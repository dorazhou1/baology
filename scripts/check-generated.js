#!/usr/bin/env node
/**
 * "Would a fresh clone of what you committed reproduce this?" — run a build,
 * then assert that (a) nothing the build OWNS came out different from what is
 * committed and (b) nothing the build NEEDS is untracked.
 *
 * Scoped to build-owned files, not the whole tree: `git diff --quiet` over the
 * tree was red for anyone mid-edit, and a check that cannot be green during
 * development teaches people to ignore it. `git diff` compares against the
 * INDEX, so "differs" means "not staged".
 */
"use strict";
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Repo-root-relative throughout — what git prints and what the ledger publishes.
const ROOT = path.resolve(__dirname, "..");
const git = (args, opts) => spawnSync("git", args, { encoding: "utf8", cwd: ROOT, ...opts });
const lines = (out) => (out || "").split("\n").map((s) => s.trim()).filter(Boolean);
const hashOf = (rel) => {
  try { return crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex"); }
  catch { return "<absent>"; }   // deleted, or never existed: still "not what is committed"
};

// SNAPSHOT FIRST, BUILD SECOND — the only way to tell "the build rewrote it"
// (committed output is stale) from "it was already edited" (the build is fine).
// Hash the already-dirty ones so a build write on top of a pending edit still shows.
const dirtyBefore = new Set(lines(git(["diff", "--name-only"]).stdout));
const hashBefore = new Map([...dirtyBefore].map((f) => [f, hashOf(f)]));

const BUILD = path.join(__dirname, "build.js");

// `--list-generated`: ordinary build, log on stderr, ledger on stdout. The same
// ledger .githooks/pre-commit stages from, so the two cannot disagree.
const build = spawnSync(process.execPath, [BUILD, "--list-generated"], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "inherit"],
});
if (build.error) throw build.error;
if (build.status !== 0) {
  // A different exit-1: the build never finished, so NOTHING was compared. The
  // failures below all name files; this one names none.
  console.error(
    "\nWHAT FAILED: scripts/build.js itself, above. Nothing was compared, so this\n" +
    "says nothing about whether the committed output is current.\n" +
    "WHAT TO DO: fix the error the build printed, then run this again."
  );
  process.exit(build.status || 1);
}

const generated = build.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
if (!generated.length) {
  console.error(
    "\nWHAT FAILED: the build ran but reported no generated files, so there was\n" +
    "nothing to compare — `node scripts/build.js --list-generated` is broken (its\n" +
    "stdout must be the ledger, one repo-relative path per line).\n" +
    "WHAT TO DO: fix --list-generated in scripts/build.js. The pre-commit hook\n" +
    "stages from this same ledger, so while it is empty nothing gets staged either."
  );
  process.exit(1);
}

// A fresh clone has to be able to BUILD, not merely to match: an untracked file in
// scripts/ or .githooks/ is invisible to every clone and unrecoverable once deleted —
// no blob, no reflog, no stash — so this FAILS rather than warns. Asked of git, not of
// a filename list, so a helper added tomorrow is covered without an edit.
const untracked = lines(
  // Repo-wide, not just scripts/.githooks: the build reads data/*.yaml, data/*.csv,
  // about/syllabus-*.csv, header.html, footer.html and js/site-config.js, and dies on an
  // ENOENT for any of them. Narrowing this to modules let an untracked DATA input ship a
  // commit that no one could build. Safe to widen because --exclude-standard honours
  // .gitignore, which now carries *-how.csv.
  git(["ls-files", "--others", "--exclude-standard"]).stdout
);

const diff = git(["diff", "--quiet", "--", ...generated], { stdio: "inherit" });
if (diff.error) throw diff.error;
const status = diff.status || 0;

if (status !== 0) {
  // Name the files AND the cause — stale committed output and pre-existing unstaged
  // edits need different fixes — by splitting the list on the snapshot taken above.
  const dirtyNow = lines(git(["diff", "--name-only", "--", ...generated]).stdout);
  const rewritten = dirtyNow.filter((f) => !dirtyBefore.has(f) || hashBefore.get(f) !== hashOf(f));
  const preexisting = dirtyNow.filter((f) => !rewritten.includes(f));
  const bullets = (fs_) => fs_.map((f) => "  - " + f).join("\n");

  const parts = [`\n${dirtyNow.length} generated file(s) do not match the staged/committed content.`];
  if (rewritten.length) {
    parts.push(
      `\nWHAT FAILED: STALE COMMITTED OUTPUT. The build rewrote these just now, so\n` +
      `what is committed was generated from older data — the repo is shipping HTML\n` +
      `that its own sources no longer produce:\n` +
      bullets(rewritten) +
      `\nWHAT TO DO: \`npm run build\`, then commit these files.`
    );
  }
  if (preexisting.length) {
    parts.push(
      `\nWHAT FAILED: UNCOMMITTED WORK. These already differed before the build ran\n` +
      `and the build did not touch them — they are your own unstaged edits to\n` +
      `build-owned files, not stale build output:\n` +
      bullets(preexisting) +
      `\nWHAT TO DO: commit or discard those edits. (The pre-commit hook stages\n` +
      `every file the build owns, so committing normally clears this.)`
    );
  }

  console.error(parts.join("\n"));
}

if (untracked.length) {
  console.error(
    `\nWHAT FAILED: UNTRACKED BUILD DEPENDENC${untracked.length > 1 ? "IES" : "Y"}. git is not tracking:\n` +
    untracked.map((f) => "  - " + f).join("\n") +
    `\nThe build passes here and dies in a fresh clone, and nothing can recover\n` +
    `${untracked.length > 1 ? "these files" : "this file"} once ${untracked.length > 1 ? "they are" : "it is"} deleted — they have never been committed.\n` +
    `WHAT TO DO: git add ${untracked.join(" ")}`
  );
}

process.exit(status || (untracked.length ? 1 : 0));
