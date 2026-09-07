#!/usr/bin/env node
/**
 * Spacing guard. Warn-only for now: Tier A (values already on the ladder) is migrated,
 * Tier B (the 1-2px moves) is not. Flip WARN_ONLY to false once Tier B lands.
 *
 * Guarded by property identity, not by value: only the GROUPS below are checked, so
 * borders, transforms, shadows and breakpoints are out of scope by construction rather
 * than by an allow-list that would rot.
 *
 * Width and height are OUT, offsets are IN. A width is component geometry, which a 4px
 * ladder has no opinion about; an offset is rhythm — `top: 12px` on a badge is the same
 * gap as `margin-top: 12px` beside it. Do not tidy top/right/bottom/left back out.
 *
 * px AND rem: `gap: 1.5rem` is 24px is --space-24. Fluid units (%, vh, vw, em) are
 * deliberately NOT flagged — layout geometry that scales, not steps on a fixed ladder;
 * their count is printed so the omission is visible.
 *
 * Scope: the stylesheets we author AND every inline style="" in our HTML.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { scannable, rootBody, lineAt, rootFontPx, declarations, inlineStyles, htmlFiles, selfTest } =
  require("./css-source.js");
const ROOT = path.resolve(__dirname, "..");
const WARN_ONLY = true;

const FILES = ["css/style.css", "blogs/blog.css"];
// Named groups, not a flat list, so the scope sentence printed in every message is
// DERIVED from what is actually checked and cannot drift from it.
const GROUPS = [
  ["margin", ["margin", "margin-top", "margin-bottom", "margin-left", "margin-right"]],
  ["padding", ["padding", "padding-top", "padding-bottom", "padding-left", "padding-right"]],
  ["gap", ["gap", "row-gap", "column-gap"]],
  // Row rhythm on a separated-border table (.results-table) is spacing by any
  // reading, and it is the one spacing property that lives on the table itself.
  ["border-spacing", ["border-spacing"]],
  // Offsets. Logical forms included so a future `inset-inline-start` cannot enter
  // through the door its physical twin is watched at.
  ["offsets", [
    "top", "right", "bottom", "left", "inset",
    "inset-block", "inset-inline",
    "inset-block-start", "inset-block-end",
    "inset-inline-start", "inset-inline-end",
  ]],
];
const SPACING = new Set(GROUPS.flatMap(([, props]) => props));
const SCOPE = GROUPS.map(([name]) => name).join("/");
// The grid unit, derived from the ladder rather than typed, so it follows a change of
// rhythm. Derived as the MODE of the gaps between consecutive named steps, not their
// gcd: :root's ladder includes a 2px hairline step, and a gcd would return that and
// collapse "on the grid" into "is even", which carries no design information.
function gridUnit(ladder) {
  const steps = [...ladder].filter((n) => n > 0).sort((a, b) => a - b);
  if (steps.length < 2) return steps[0] || 1;
  const gaps = new Map();
  for (let i = 1; i < steps.length; i++) {
    const g = steps[i] - steps[i - 1];
    gaps.set(g, (gaps.get(g) || 0) + 1);
  }
  // Ties break to the SMALLER gap: it is the finer rhythm, and wrongly calling
  // a value "off the grid entirely" is the more expensive of the two errors.
  return [...gaps.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// px value -> how it relates to the ladder. A multiple of the grid unit that is not a
// named step is ON the grid and off the named steps: a much smaller migration than
// "off the ladder" implies, so the two are reported differently.
function verdict(px, ladder, grid) {
  const mag = Math.abs(px);
  if (ladder.has(mag)) {
    return px < 0
      ? `= --space-${mag} negated, use calc(var(--space-${mag}) * -1)`
      : `= --space-${mag}, use var(--space-${mag})`;
  }
  if (mag % grid === 0) return `on the ${grid}px grid but not one of the ${ladder.size} named steps (Tier B)`;
  return `off the ${grid}px grid entirely (Tier B)`;
}

function checkSpacing() {
  selfTest();
  const style = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  const ladder = new Set();
  // Every :root block, so a token added in a theme override still joins the ladder.
  for (const m of rootBody(style).matchAll(/--space-(\d+)\s*:/g)) ladder.add(Number(m[1]));
  const REM = rootFontPx(style);
  const GRID = gridUnit(ladder);

  const findings = [];
  let fluid = 0;

  // A leading "-" is part of the value: the old lookbehind `(?<![\w.-])` exempted
  // every negative spacing value in the repo by accident.
  const PX = /(?<![\w.])(-?\d+(?:\.\d+)?)px/g;
  const REMV = /(?<![\w.])(-?\d+(?:\.\d+)?)rem/g;
  const FLUID = /(?<![\w.])-?\d+(?:\.\d+)?(?:%|vh|vw|em)(?![\w-])/g;

  const scanDecl = (rel, line, prop, value) => {
    if (!SPACING.has(prop)) return;
    for (const v of value.matchAll(PX)) {
      const n = Number(v[1]);
      if (n === 0) continue;
      findings.push(`${rel}:${line}  ${prop}: ${n}px  — ${verdict(n, ladder, GRID)}`);
    }
    for (const v of value.matchAll(REMV)) {
      const n = Number(v[1]);
      if (n === 0) continue;
      const px = n * REM;
      findings.push(`${rel}:${line}  ${prop}: ${n}rem = ${px}px  — ${verdict(px, ladder, GRID)}`);
    }
    for (const _ of value.matchAll(FLUID)) fluid++;
  };

  for (const rel of FILES) {
    const css = rel === "css/style.css" ? style : fs.readFileSync(path.join(ROOT, rel), "utf8");
    const scan = scannable(css);
    for (const d of declarations(scan)) scanDecl(rel, lineAt(scan, d.index), d.prop, d.value);
  }

  // Inline style="" is CSS in an attribute; nothing was ever checking it.
  const html = htmlFiles(ROOT);
  for (const rel of html) {
    const txt = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const s of inlineStyles(txt)) {
      for (const d of declarations("{" + s.value)) {
        scanDecl(rel, lineAt(txt, s.index + d.index - 1), d.prop, d.value);
      }
    }
  }

  const note = fluid
    ? `  (${fluid} more use a fluid unit (%/vh/vw/em) — deliberately out of ladder scope)`
    : "";

  if (!findings.length) {
    console.log(`Spacing guard OK — no raw px/rem in ${SCOPE} outside :root` + (note ? "\n" + note : ""));
    return;
  }
  const msg = `spacing guard: ${findings.length} untokenised value(s) in ${SCOPE}:\n  - ` +
    findings.join("\n  - ") + (note ? "\n" + note : "") +
    `\n\nThe ladder lives in css/style.css :root as --space-*.` +
    `\n"On the grid" means a multiple of ${GRID}; "on the ladder" means one of the ${ladder.size} named steps.`;
  if (WARN_ONLY) {
    console.log(`Spacing guard — ${findings.length} untokenised value(s) remain (Tier B, warn-only)\n  - ` +
      findings.join("\n  - ") + (note ? "\n" + note : ""));
    return;
  }
  throw new Error(msg);
}

module.exports = { checkSpacing };
if (require.main === module) {
  try { checkSpacing(); } catch (e) { console.error(e.message); process.exit(1); }
}
