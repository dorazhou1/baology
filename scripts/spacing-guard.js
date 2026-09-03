#!/usr/bin/env node
/**
 * Spacing guard. Warn-only for now: Tier A (values already on the 4px ladder) is
 * migrated; Tier B (the 1-2px moves) is not, so failing the build would block work.
 * Flip WARN_ONLY to false once Tier B lands.
 *
 * Guarded by PROPERTY IDENTITY, not by value: only margin/padding/gap are checked,
 * so borders, transforms, shadows, width/height, offsets and breakpoints are out of
 * scope by construction rather than by an allow-list that would rot.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const WARN_ONLY = true;

const FILES = ["css/style.css", "blogs/blog.css"];
const SPACING = new Set([
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
  "gap", "row-gap", "column-gap",
]);

function rootSpan(css) {
  const i = css.indexOf(":root");
  if (i < 0) return null;
  let k = css.indexOf("{", i), d = 0;
  for (let j = k; j < css.length; j++) {
    if (css[j] === "{") d++;
    else if (css[j] === "}") { d--; if (!d) return [i, j + 1]; }
  }
  return null;
}

function checkSpacing() {
  const ladder = new Set();
  const style = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  const span = rootSpan(style);
  if (span) {
    for (const m of style.slice(span[0], span[1]).matchAll(/--space-(\d+)\s*:/g)) ladder.add(Number(m[1]));
  }

  const findings = [];
  for (const rel of FILES) {
    const css = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const sp = rootSpan(css);
    const blank = (s) => " ".repeat(s.length);
    let scan = css;
    if (sp) scan = scan.slice(0, sp[0]) + blank(scan.slice(sp[0], sp[1])) + scan.slice(sp[1]);
    scan = scan.replace(/\/\*[\s\S]*?\*\//g, blank);

    for (const d of scan.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
      if (!SPACING.has(d[1])) continue;
      for (const v of d[2].matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) {
        const n = Number(v[1]);
        if (n === 0) continue;
        const line = scan.slice(0, d.index).split("\n").length;
        findings.push(
          `${rel}:${line}  ${d[1]}: ${n}px` +
          (ladder.has(n) ? "  — on the ladder, use var(--space-" + n + ")"
                         : "  — off the 4px ladder (Tier B)")
        );
      }
    }
  }

  if (!findings.length) {
    console.log("Spacing guard OK — no raw px in margin/padding/gap outside :root");
    return;
  }
  const msg = `spacing guard: ${findings.length} raw px value(s) in margin/padding/gap:\n  - ` +
    findings.join("\n  - ") +
    `\n\nThe 4px ladder lives in css/style.css :root as --space-*.`;
  if (WARN_ONLY) {
    console.log(`Spacing guard — ${findings.length} raw px value(s) remain (Tier B, warn-only)`);
    return;
  }
  throw new Error(msg);
}

module.exports = { checkSpacing };
if (require.main === module) {
  try { checkSpacing(); } catch (e) { console.error(e.message); process.exit(1); }
}
