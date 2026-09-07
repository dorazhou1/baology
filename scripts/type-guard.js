#!/usr/bin/env node
/**
 * Type guard — font-size, font-family, font-weight, line-height.
 *
 * Warn-only, like the spacing and radius guards started: the type axes are the least
 * enforced on the site. Flip WARN_ONLY once the findings are gone.
 *
 * Guarded by property identity, not by value, so a number that merely looks like a
 * weight (z-index: 600) or a size (width: 20px) can never be mistaken for type; a new
 * type property is the only thing that needs adding to GROUPS.
 *
 * font-family is the axis with a proven live drift: one retyped copy of the serif stack
 * had lost its Playfair fallback — `"New York", serif` beside `"New York", "Playfair
 * Display", serif` — so one heading fell back to Times. Both spellings are valid CSS and
 * render identically on the author's machine. sameFaceDifferentFallback() below names
 * that exact failure if the stacks are ever retyped again.
 *
 * @font-face is BLANKED before scanning: a font-family inside it NAMES the face being
 * defined, so there is no token to use — the token's value is that name.
 *
 * CSS-wide keywords (inherit / initial / unset / revert / revert-layer) are skipped
 * everywhere: they are cascade instructions, not values. `normal`, `bold`, `bolder` and
 * `lighter` are NOT in that group — they have exact token equivalents, and a keyword
 * hides from every audit that greps 700.
 *
 * Relative units (em, %) are counted, not flagged — `font-size: 0.85em` is a step down
 * from the parent, which no --fs-* token can express without changing the render. The
 * count is printed so the omission is visible.
 *
 * Scope: the stylesheets we author AND every inline style="" in our HTML.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { blank, scannable, rootBody, lineAt, rootFontPx, declarations, inlineStyles, htmlFiles, selfTest } =
  require("./css-source.js");
const ROOT = path.resolve(__dirname, "..");
const WARN_ONLY = true;

const FILES = ["css/style.css", "blogs/blog.css"];

// Named groups, so the scope sentence in every message is DERIVED from what is checked.
// `font` is listed with no current consumer on purpose: the shorthand sets all four of
// these at once, so it is the one hole every type value could re-enter through.
const GROUPS = [
  ["font-size", ["font-size"]],
  ["font-family", ["font-family"]],
  ["font-weight", ["font-weight"]],
  ["line-height", ["line-height"]],
  ["font (shorthand)", ["font"]],
];
const TYPE = new Set(GROUPS.flatMap(([, props]) => props));
const SCOPE = GROUPS.map(([name]) => name).join(", ");

// Cascade instructions. Not values — nothing to tokenise.
const CSS_WIDE = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);

// The one place a value may name a face rather than choose one.
const stripFontFace = (css) =>
  css.replace(/@font-face\s*\{[^{}]*\}/gi, blank);

// A value with its var() references and !important removed: what is left is what was
// written raw. Stripping var() first is what stops a token NAME being read as a value —
// otherwise `var(--fw-600)` reports a bare 600 and a `--space-2` inside a line-height
// calc reports a bare 2. Split in two because the clamp() reader below has to see WHICH
// bounds carry a var() before the var()s are stripped.
const VAR_REF = /var\(\s*--[\w-]+\s*(?:,[^()]*)?\)/g;
// Non-global twin: `.test()` on a /g/ regex carries lastIndex between calls and
// would answer differently for the same string on alternate invocations.
const HAS_VAR = /var\(\s*--[\w-]+/;
const noVars = (value) => value.replace(VAR_REF, " ");
const noImportant = (value) => value.replace(/!\s*important/gi, " ");
const raw = (value) => noVars(noImportant(value));

// --- clamp(): three sizes in one declaration, not one -----------------------
// `font-size: clamp(2rem, 12vw, var(--fs-display))` states a floor, a preferred size and
// a ceiling. Judging the whole expression against one token compares a range to a point
// and aims the reader at the wrong end of the value, so each bound is judged on its own
// and only the untokenised ones are reported.
// Top-level commas only: `clamp(1rem, calc(1rem + 2vw), 3rem)` is three arguments, not four.
function splitArgs(inner) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && !depth) { out.push(inner.slice(start, i)); start = i + 1; }
  }
  out.push(inner.slice(start));
  return out;
}
// value -> [{ label, text }] for the bounds of a clamp()/min()/max(), or null when
// the value is an ordinary one. clamp()'s three arguments have names in the spec and
// those names are what make the finding actionable ("the FLOOR is off the ladder");
// min()/max() take any number of equal arguments, so they are numbered.
function sizeBounds(value) {
  const m = /^\s*(clamp|min|max)\(([\s\S]*)\)\s*$/i.exec(value.trim());
  if (!m) return null;
  const fn = m[1].toLowerCase();
  const args = splitArgs(m[2]);
  const names = fn === "clamp" && args.length === 3
    ? ["min", "preferred", "max"]
    : args.map((_, i) => `arg ${i + 1}`);
  return args.map((text, i) => ({ fn, label: names[i], text }));
}

// --- token scales, read from :root so adding a token teaches the guard about it ---
function tokens(css) {
  const out = { family: [], weight: [], size: [], lh: [] };
  const REM = rootFontPx(css);
  // Every :root block, not just the first: a theme override defines tokens on the same
  // scales, and a half-read scale reports everything it cannot see as untokenised.
  const body = rootBody(css);
  for (const m of body.matchAll(/(--(?:font|fw|fs|lh)-[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = m[1], value = m[2].trim();
    if (name.startsWith("--font-")) { out.family.push({ name, value }); continue; }
    const num = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(value);
    if (!num) continue;
    const n = Number(num[1]);
    if (name.startsWith("--fw-")) out.weight.push({ name, n });
    else if (name.startsWith("--fs-")) out.size.push({ name, n: num[2] === "rem" ? n * REM : n });
    else if (name.startsWith("--lh-")) out.lh.push({ name, n });
  }
  for (const k of ["weight", "size", "lh"]) out[k].sort((a, b) => a.n - b.n);
  return out;
}

// value -> the token that holds it, or the nearest one. Shared by the three numeric
// axes so they can never disagree about what "nearest" means.
function nearest(n, scale, unit = "") {
  const exact = scale.find((t) => t.n === n);
  if (exact) return `= ${exact.name}, use var(${exact.name})`;
  if (!scale.length) return "no matching token is defined";
  const near = scale.reduce((a, b) => (Math.abs(b.n - n) < Math.abs(a.n - n) ? b : a));
  const d = n - near.n;
  return `no token has this value (nearest ${near.name} ${near.n}${unit}, ${d > 0 ? "+" : ""}${Math.round(d * 100) / 100}${unit})`;
}

// Split a stack into comparable family names: unquoted, lowercased, whitespace-normal.
const families = (stack) =>
  stack.split(",").map((f) => f.trim().replace(/^['"]|['"]$/g, "").toLowerCase().replace(/\s+/g, " "))
       .filter(Boolean);

// The drift this guard was built for: the right face with the wrong fallbacks.
function sameFaceDifferentFallback(stack, familyTokens) {
  const got = families(stack);
  if (!got.length) return null;
  for (const t of familyTokens) {
    const want = families(t.value);
    if (want[0] !== got[0]) continue;
    if (want.length === got.length && want.every((f, i) => f === got[i])) {
      return `= ${t.name}, use var(${t.name})`;
    }
    return `SAME primary face as ${t.name} but a DIFFERENT fallback chain ` +
      `(${t.name} is \`${t.value}\`) — this is exactly how "New York", serif lost Playfair. ` +
      `Use var(${t.name}).`;
  }
  return null;
}

function checkType() {
  selfTest();
  const style = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  const T = tokens(style);
  const REM = rootFontPx(style);

  const findings = [];
  let relative = 0;

  const LEN = /(?<![\w.])(-?\d+(?:\.\d+)?)(px|rem|pt)(?![\w-])/g;
  const REL = /(?<![\w.])-?\d+(?:\.\d+)?(?:%|em|vh|vw)(?![\w-])/g;
  const NUM = /(?<![\w.#-])(\d+(?:\.\d+)?)(?![\w.%-])/g;
  const KEYWORD = /(?<![\w-])(normal|bold|bolder|lighter)(?![\w-])/gi;

  const px = (n, unit) => (unit === "rem" ? n * REM : unit === "pt" ? (n * 96) / 72 : n);

  const scanDecl = (rel, line, prop, value) => {
    if (!TYPE.has(prop)) return;
    const at = (msg) => findings.push(`${rel}:${line}  ${prop}: ${value.trim()}  — ${msg}`);
    const body = raw(value).trim();
    if (!body || CSS_WIDE.has(body.toLowerCase())) return;

    if (prop === "font") {
      at("the `font` shorthand sets font-size, font-family, font-weight AND line-height " +
         "in one unparsed string — spell the four out so each takes its token");
      return;
    }

    if (prop === "font-family") {
      at(sameFaceDifferentFallback(body, T.family) ||
         `no --font-* token holds this stack (${T.family.map((t) => t.name).join(", ")})`);
      return;
    }

    for (const m of body.matchAll(REL)) { void m; relative++; }

    if (prop === "font-size") {
      const parts = sizeBounds(noImportant(value));
      if (parts) {
        // Naming the bounds that are ALREADY tokenised is what makes the finding
        // actionable: "the floor is raw, the ceiling is fine" is a one-line change.
        const done = parts.filter((p) => HAS_VAR.test(p.text));
        const context = done.length
          ? `  [${done.map((p) => `${p.label} already tokenised: ${p.text.trim()}`).join("; ")}]`
          : "";
        for (const p of parts) {
          for (const m of noVars(p.text).matchAll(LEN)) {
            const n = px(Number(m[1]), m[2]);
            at(`${p.fn}() ${p.label} ${m[0]} = ${n}px: ${nearest(n, T.size, "px")}${context}`);
          }
        }
        return;
      }
      for (const m of body.matchAll(LEN)) at(nearest(px(Number(m[1]), m[2]), T.size, "px"));
      return;
    }
    if (prop === "font-weight") {
      for (const m of body.matchAll(NUM)) at(nearest(Number(m[1]), T.weight));
      for (const m of body.matchAll(KEYWORD)) {
        const k = m[1].toLowerCase();
        const n = k === "bold" ? 700 : k === "normal" ? 400 : null;
        at(n === null
          ? `\`${k}\` is relative to the inherited weight — name the weight you mean`
          : `\`${k}\` is ${n}: ${nearest(n, T.weight)} (a keyword hides from every audit that greps ${n})`);
      }
      return;
    }
    // line-height. A LENGTH and a RATIO are different declarations, not two spellings
    // of one, so a value that has a unit is reported as a length and never also read
    // as the bare number inside it.
    const lengths = [...body.matchAll(LEN)];
    for (const m of lengths) {
      // No "nearest token" here on purpose: --lh-* holds RATIOS, and the distance from
      // 100px to 1.2 means nothing. The finding is the category error, not a delta.
      at(`a LENGTH, not a ratio — it pins the leading and stops scaling with ` +
         `font-size; the scale holds ${T.lh.map((t) => `${t.name} ${t.n}`).join(", ") || "no --lh-* token"}`);
    }
    if (lengths.length) return;
    for (const m of body.matchAll(NUM)) {
      const n = Number(m[1]);
      if (n === 0) continue;
      at(nearest(n, T.lh));
    }
    for (const m of body.matchAll(KEYWORD)) {
      at(`\`${m[1].toLowerCase()}\` hands the leading back to the browser; ` +
         `this site defines ${T.lh.map((t) => t.name).join(", ") || "no --lh-* token"}`);
    }
  };

  for (const rel of FILES) {
    const css = rel === "css/style.css" ? style : fs.readFileSync(path.join(ROOT, rel), "utf8");
    const scan = stripFontFace(scannable(css));
    for (const d of declarations(scan)) scanDecl(rel, lineAt(scan, d.index), d.prop, d.value);
  }
  for (const rel of htmlFiles(ROOT)) {
    const txt = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const s of inlineStyles(txt)) {
      for (const d of declarations("{" + s.value)) {
        scanDecl(rel, lineAt(txt, s.index + d.index - 1), d.prop, d.value);
      }
    }
  }

  const scale =
    `--font-* ${T.family.length}, --fs-* ${T.size.length}, --fw-* ${T.weight.length}, --lh-* ${T.lh.length}`;
  const note = relative
    ? `  (${relative} more use a relative unit (em/%/vh/vw) — sized against the parent, deliberately out of scale scope)`
    : "";

  if (!findings.length) {
    console.log(`Type guard OK — every ${SCOPE} value uses a token [${scale}]` + (note ? "\n" + note : ""));
    return;
  }
  const msg = `type guard: ${findings.length} untokenised type value(s) in ${SCOPE}:\n  - ` +
    findings.join("\n  - ") + (note ? "\n" + note : "") +
    `\n\nThe type scale lives in css/style.css :root (${scale}).`;
  if (WARN_ONLY) {
    console.log(`Type guard — ${findings.length} untokenised type value(s) remain (warn-only)\n  - ` +
      findings.join("\n  - ") + (note ? "\n" + note : ""));
    return;
  }
  throw new Error(msg);
}

module.exports = { checkType };
if (require.main === module) {
  try { checkType(); } catch (e) { console.error(e.message); process.exit(1); }
}
