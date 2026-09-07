#!/usr/bin/env node
/**
 * Radius guard. Warn-only: ~16 distinct raw values against 4 tokens is a migration,
 * not a one-line fix. Flip WARN_ONLY once the raw values are gone.
 *
 * Guarded by property identity, not by value, so `width: 500px` can never be mistaken
 * for a pill; a new corner property is the only thing that needs adding here.
 *
 * Percentages are NOT flagged: `border-radius: 50%` is a shape instruction with no px
 * equivalent, so no token could replace it. The count is printed so it is not silent.
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
const RADIUS = new Set([
  "border-radius",
  "border-top-left-radius", "border-top-right-radius",
  "border-bottom-right-radius", "border-bottom-left-radius",
  "border-start-start-radius", "border-start-end-radius",
  "border-end-start-radius", "border-end-end-radius",
]);

// The radius scale, read from :root so adding a token teaches the guard about it.
function radiusTokens(css) {
  const out = [];
  for (const m of rootBody(css).matchAll(/(--radius-[\w-]+)\s*:\s*([^;]+);/g)) {
    const px = /^(\d+(?:\.\d+)?)px$/.exec(m[2].trim());
    if (px) out.push({ name: m[1], px: Number(px[1]) });
  }
  return out.sort((a, b) => a.px - b.px);
}

function verdict(px, tokens) {
  const exact = tokens.find((t) => t.px === px);
  if (exact) return `= ${exact.name}, use var(${exact.name})`;
  if (!tokens.length) return "no --radius-* token is defined";
  const near = tokens.reduce((a, b) => (Math.abs(b.px - px) < Math.abs(a.px - px) ? b : a));
  const delta = px - near.px;
  return `no token has this value (nearest ${near.name} ${near.px}px, ${delta > 0 ? "+" : ""}${delta}px)`;
}

function checkRadius() {
  selfTest();
  const style = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  const tokens = radiusTokens(style);
  const REM = rootFontPx(style);

  const findings = [];
  let pct = 0;
  const PX = /(?<![\w.])(\d+(?:\.\d+)?)px/g;
  const REMV = /(?<![\w.])(\d+(?:\.\d+)?)rem/g;
  const PCT = /(?<![\w.])\d+(?:\.\d+)?%/g;

  const scanDecl = (rel, line, prop, value) => {
    if (!RADIUS.has(prop)) return;
    for (const v of value.matchAll(PX)) {
      const n = Number(v[1]);
      if (n === 0) continue;
      findings.push(`${rel}:${line}  ${prop}: ${n}px  — ${verdict(n, tokens)}`);
    }
    for (const v of value.matchAll(REMV)) {
      const n = Number(v[1]);
      if (n === 0) continue;
      findings.push(`${rel}:${line}  ${prop}: ${n}rem = ${n * REM}px  — ${verdict(n * REM, tokens)}`);
    }
    for (const _ of value.matchAll(PCT)) pct++;
  };

  for (const rel of FILES) {
    const css = rel === "css/style.css" ? style : fs.readFileSync(path.join(ROOT, rel), "utf8");
    const scan = scannable(css);
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

  const scale = tokens.map((t) => `${t.name} ${t.px}px`).join(", ") || "(none)";
  const note = pct ? `  (${pct} more use a percentage — a shape instruction, deliberately out of scope)` : "";

  if (!findings.length) {
    console.log(`Radius guard OK — every corner uses var(--radius-*) [${scale}]` + (note ? "\n" + note : ""));
    return;
  }
  const msg = `radius guard: ${findings.length} raw corner value(s):\n  - ` + findings.join("\n  - ") +
    (note ? "\n" + note : "") +
    `\n\nThe radius scale lives in css/style.css :root: ${scale}.`;
  if (WARN_ONLY) {
    console.log(`Radius guard — ${findings.length} raw corner value(s) remain (warn-only)\n  - ` +
      findings.join("\n  - ") + (note ? "\n" + note : ""));
    return;
  }
  throw new Error(msg);
}

module.exports = { checkRadius };
if (require.main === module) {
  try { checkRadius(); } catch (e) { console.error(e.message); process.exit(1); }
}
