#!/usr/bin/env node
/**
 * Colour guard — the enforcement half of "changing a colour never requires
 * hardcoding, single source of truth".
 *
 * The :root block in css/style.css is the ONLY place a colour literal may
 * appear. Everywhere else, a colour must be written as:
 *     solid:  color: var(--color-navy);
 *     alpha:  background: rgba(var(--navy-rgb), 0.45);
 *
 * NOT color-mix(): a custom property holding an unsupported function is valid
 * at parse time and becomes invalid at COMPUTED-VALUE time, so the property
 * computes to `unset`. Neither a twin declaration nor a var() fallback can
 * catch that — the fallback is skipped because the token IS defined, just
 * invalid. On Chrome <111 / iOS <16.2 that would render the lightbox scrim
 * fully transparent. rgba(var(--x-rgb), a) cannot fail this way: var()
 * substitution is textual, so it resolves to a plain rgba() every engine
 * since 2016 parses.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

// White and black are deliberately not tokens: they are paper and shadow, not
// brand, and a token that can only ever hold one value is not a token.
const ALLOWED = /^#(fff|ffffff|000|000000)$/i;

// Files we author. Vendor CSS under plugins/ is not ours to tokenise.
const FILES = ["css/style.css", "blogs/blog.css"];

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

function checkColors() {
  const errors = [];
  for (const rel of FILES) {
    const css = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const span = rootSpan(css);
    // Blank out :root and comments, preserving offsets so line numbers stay true.
    const blank = (s) => " ".repeat(s.length);
    let scan = css;
    if (span) scan = scan.slice(0, span[0]) + blank(scan.slice(span[0], span[1])) + scan.slice(span[1]);
    scan = scan.replace(/\/\*[\s\S]*?\*\//g, blank);

    const at = (idx) => scan.slice(0, idx).split("\n").length;
    for (const m of scan.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      if (ALLOWED.test(m[0])) continue;
      errors.push(`${rel}:${at(m.index)}  hex literal ${m[0]} — use var(--color-*)`);
    }
    // A numeric rgba() is a hardcoded colour. rgba(var(--x-rgb), a) is fine, and
    // pure black/white overlays are allowed.
    for (const m of scan.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/g)) {
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      const achromatic = (r === g && g === b && (r === 0 || r === 255));
      if (achromatic) continue;
      errors.push(`${rel}:${at(m.index)}  numeric ${m[0]} — use rgba(var(--<name>-rgb), a)`);
    }
    for (const m of scan.matchAll(/color-mix\(/g)) {
      errors.push(`${rel}:${at(m.index)}  color-mix() is banned — it computes to \`unset\` on Chrome <111 / iOS <16.2`);
    }
  }
  if (errors.length) {
    throw new Error(
      `colour guard failed — ${errors.length} hardcoded colour(s):\n  - ` + errors.join("\n  - ") +
      `\n\nEvery colour lives in the :root block of css/style.css.` +
      `\n  solid:  color: var(--color-navy);` +
      `\n  alpha:  background: rgba(var(--navy-rgb), 0.45);`
    );
  }
  console.log(`Colour guard OK — 0 hardcoded colours outside :root in ${FILES.length} stylesheet(s)`);
}

module.exports = { checkColors };
if (require.main === module) {
  try { checkColors(); } catch (e) { console.error(e.message); process.exit(1); }
}
