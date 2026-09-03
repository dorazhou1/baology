#!/usr/bin/env node
/**
 * Colour guard: css/style.css :root is the only place a colour literal may live.
 *     solid:  color: var(--color-navy);
 *     alpha:  background: rgba(var(--navy-rgb), 0.45);
 *
 * color-mix() is banned. In a token it is invalid-at-computed-value-time on
 * Chrome <111 / iOS <16.2, so the property computes to `unset` — and a var()
 * fallback does NOT catch it, because the token is defined, just invalid.
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
    // 3/4/6/8-digit hex. The 8-digit form is why this is not `{6}\b` — a trailing
    // word char defeats \b, so #162D59CC used to slip straight through.
    for (const m of scan.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      if (!/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(m[0])) continue;
      if (ALLOWED.test(m[0])) continue;
      errors.push(`${rel}:${at(m.index)}  hex literal ${m[0]} — use var(--color-*)`);
    }
    // Numeric rgb()/rgba(), BOTH the comma form and the modern space/slash form.
    // rgba(var(--x-rgb), a) is fine; pure black/white overlays are allowed.
    for (const m of scan.matchAll(/rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*[\d.]+%?\s*)?\)/g)) {
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      if (r === g && g === b && (r === 0 || r === 255)) continue;   // achromatic scrim
      errors.push(`${rel}:${at(m.index)}  numeric ${m[0]} — use rgba(var(--<name>-rgb), a)`);
    }
    // Every other colour function is a hardcoded colour too.
    for (const m of scan.matchAll(/\b(hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/g)) {
      errors.push(`${rel}:${at(m.index)}  ${m[1]}() colour — use var(--color-*)`);
    }
    for (const m of scan.matchAll(/color-mix\(/g)) {
      errors.push(`${rel}:${at(m.index)}  color-mix() is banned — it computes to \`unset\` on Chrome <111 / iOS <16.2`);
    }
  }
  // Undefined token references. Scanned across the stylesheets AND every HTML file,
  // since inline style="" can carry var() too.
  const styleCss = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  const rs = rootSpan(styleCss);
  const rootBody = rs ? styleCss.slice(rs[0], rs[1]).replace(/\/\*[\s\S]*?\*\//g, " ") : "";
  const defined = new Set([...rootBody.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

  const htmlFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (/^(node_modules|\.git|plugins|deprecated)$/.test(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".html")) htmlFiles.push(path.relative(ROOT, full));
    }
  })(ROOT);

  for (const rel of [...FILES, ...htmlFiles]) {
    const txt = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const m of txt.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (defined.has(m[1])) continue;
      const line = txt.slice(0, m.index).split("\n").length;
      errors.push(`${rel}:${line}  var(${m[1]}) is not defined in :root — computes to \`unset\` (transparent / none), silently`);
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
