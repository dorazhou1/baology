#!/usr/bin/env node
/**
 * Colour guard: css/style.css :root is the only place a colour literal may live.
 *     solid:  color: var(--color-navy);
 *     alpha:  background: rgba(var(--navy-rgb), 0.45);
 *
 * color-mix() is banned. In a token it is invalid-at-computed-value-time on
 * Chrome <111 / iOS <16.2, so the property computes to `unset` — and a var()
 * fallback does NOT catch it, because the token is defined, just invalid.
 *
 * Two tiers, on purpose:
 *   ERRORS   fail the build: literals in the stylesheets we author, and any var()
 *            that :root never defines.
 *   WARNINGS print and pass. Three classes whose call sites predate the rule:
 *            pure-black FILLS, bare CSS colour keywords, and literals inside HTML
 *            style="" attributes. Flip WARN_NEW to false once those are migrated —
 *            never to hide a NEW violation.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { rootBody, scannable, lineAt, propertyAt, declarations, inlineStyles, htmlFiles,
        liveCss, htmlCss, URL_FN, selfTest } = require("./css-source.js");
const ROOT = path.resolve(__dirname, "..");
const WARN_NEW = true;

// White is deliberately not a token: it is paper, not brand, and it is allowed wherever
// it lands. BLACK IS NOT THE SAME CASE. `#000`, `rgb(0,0,0)` and `black` are one colour
// and are judged by the PROPERTY they paint — shadow yes, surface no — because this
// repo's scrim doctrine is "navy-tinted, never pure black". Do not fold black back into
// an unconditional allow-list beside white: that is what made every hex spelling of a
// black SURFACE silent.
const VALID_HEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const PAPER_HEX = /^#(fff|ffffff)$/i;
const BLACK_HEX = /^#(000|000000)$/i;

// Files we author. Vendor CSS under plugins/ is not ours to tokenise.
const FILES = ["css/style.css", "blogs/blog.css"];

// The CSS named colours. `transparent` and `currentColor` are absent by design:
// they are keywords for "no paint" and "inherit the paint", not literals.
const NAMED = new Set(("aliceblue,antiquewhite,aqua,aquamarine,azure,beige,bisque,black,blanchedalmond,blue," +
  "blueviolet,brown,burlywood,cadetblue,chartreuse,chocolate,coral,cornflowerblue,cornsilk,crimson,cyan," +
  "darkblue,darkcyan,darkgoldenrod,darkgray,darkgreen,darkgrey,darkkhaki,darkmagenta,darkolivegreen," +
  "darkorange,darkorchid,darkred,darksalmon,darkseagreen,darkslateblue,darkslategray,darkslategrey," +
  "darkturquoise,darkviolet,deeppink,deepskyblue,dimgray,dimgrey,dodgerblue,firebrick,floralwhite," +
  "forestgreen,fuchsia,gainsboro,ghostwhite,gold,goldenrod,gray,green,greenyellow,grey,honeydew,hotpink," +
  "indianred,indigo,ivory,khaki,lavender,lavenderblush,lawngreen,lemonchiffon,lightblue,lightcoral," +
  "lightcyan,lightgoldenrodyellow,lightgray,lightgreen,lightgrey,lightpink,lightsalmon,lightseagreen," +
  "lightskyblue,lightslategray,lightslategrey,lightsteelblue,lightyellow,lime,limegreen,linen,magenta," +
  "maroon,mediumaquamarine,mediumblue,mediumorchid,mediumpurple,mediumseagreen,mediumslateblue," +
  "mediumspringgreen,mediumturquoise,mediumvioletred,midnightblue,mintcream,mistyrose,moccasin," +
  "navajowhite,navy,oldlace,olive,olivedrab,orange,orangered,orchid,palegoldenrod,palegreen," +
  "paleturquoise,palevioletred,papayawhip,peachpuff,peru,pink,plum,powderblue,purple,rebeccapurple,red," +
  "rosybrown,royalblue,saddlebrown,salmon,sandybrown,seagreen,seashell,sienna,silver,skyblue,slateblue," +
  "slategray,slategrey,snow,springgreen,steelblue,tan,teal,thistle,tomato,turquoise,violet,wheat,white," +
  "whitesmoke,yellow,yellowgreen").split(","));
// The same two colours spelled as words. Reported whatever they paint, because a
// keyword hides from every hex audit: paper is #fff, shadow is #000, and a pure-black
// surface is a finding in either spelling.
const PAPER = new Set(["white", "black"]);

// Guarded by property identity, like the spacing guard: these are the properties whose
// value paints, so `transition: background-color .25s` and `font-family: "New York"`
// are out of scope by construction.
const COLOR_PROPS = new Set([
  "color", "background", "background-color", "background-image",
  "border", "border-color", "border-top", "border-right", "border-bottom", "border-left",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "outline", "outline-color", "box-shadow", "text-shadow", "text-decoration-color",
  "caret-color", "column-rule-color", "accent-color", "fill", "stroke",
  "-webkit-text-fill-color", "-webkit-box-shadow", "-moz-box-shadow",
]);
// Where a pure-black literal is legitimately shadow rather than a surface.
const SHADOW_PROPS = /^(?:-\w+-)?(?:box-shadow|text-shadow|filter|backdrop-filter)$/;

// How a hex literal is judged, as ONE function, so both callers — the
// stylesheets we author and inline style="" — and the self-test read the same
// rule instead of three copies of it that have to agree:
//   "skip"     not a hex colour at all, or paper
//   "shadow"   pure black in a shadow property: what the exemption was FOR
//   "fill"     pure black painting a SURFACE: what the rule always meant
//   "literal"  any other hardcoded colour
const hexVerdict = (hex, prop) =>
  !VALID_HEX.test(hex) || PAPER_HEX.test(hex) ? "skip"
    : !BLACK_HEX.test(hex) ? "literal"
      : SHADOW_PROPS.test(prop) ? "shadow" : "fill";
// One wording for the pure-black surface, shared with the rgb() branch below,
// so two spellings of one colour cannot drift into two different rules.
const BLACK_FILL = (where, prop, literal) =>
  `${where}  ${prop || "?"}: ${literal} — pure-black FILL, not a shadow; this repo tints its ` +
  `surfaces: var(--color-navy), or rgba(var(--navy-rgb), a)`;

// --- what in a value is PAINT, and what is merely DATA -------------------
// A url() payload and a quoted string are data, not paint: `background: url("snow.png")`
// names a FILE, and reading `snow` there as a colour would fail the build over an image
// filename. URL_FN is the shared one from css-source.js so the guards cannot disagree
// about what a url() payload is.
const withoutData = (value) => value.replace(URL_FN, " ").replace(/"[^"]*"|'[^']*'/g, " ");

// ...with ONE deliberate exception. An inline-SVG data-URI is our own markup inlined in
// our stylesheet, so `stroke='white'` there is a colour we wrote, and it hides from a
// hex audit exactly the way a bare keyword does. Paint is therefore read back out of a
// data: payload — keyed on the SVG PAINT ATTRIBUTE, never on a bare word, which is what
// keeps the exception from resurrecting the filename false positive: a filename can look
// like `snow`, but never like `stroke='snow'`.
// Only keywords are judged here; a hex or rgb() inside the payload is already caught by
// the whole-file scans, and double-reporting it would be noise.
const SVG_PAINT = /\b(fill|stroke|stop-color|flood-color|lighting-color)\s*=\s*(?:'([^']*)'|"([^"]*)")/gi;
function* svgPaints(text) {
  for (const u of text.matchAll(URL_FN)) {
    if (!/^url\(\s*["']?\s*data:/i.test(u[0])) continue;
    for (const a of u[0].matchAll(SVG_PAINT)) {
      const raw = a[2] !== undefined ? a[2] : a[3];
      yield { attr: a[1].toLowerCase(), value: raw.trim(), index: u.index + a.index };
    }
  }
}

// The bare CSS colour keywords a value actually paints with.
const KEYWORD = /(?<![\w#.-])([a-z]{3,20})(?![\w-])/g;
const keywordsIn = (value) =>
  [...withoutData(value).matchAll(KEYWORD)].map((m) => m[1]).filter((w) => NAMED.has(w));

// --- regression probe ----------------------------------------------------
// Runs on every invocation: the failure it guards is silent until someone commits an
// image called snow.png, and left as a comment the carve-out above would be
// "simplified" straight back out.
const PROBE = [
  // declaration value                                            keywords it paints with
  [`url("snow.png")`,                                             []],
  [`url(/images/orange/hero.jpg) no-repeat`,                       []],
  [`url('../img/red.svg') center / cover`,                         []],
  [`url("data:image/png;base64,c25vdw==")`,                        []],
  [`#fff url("tan.gif") repeat-x`,                                 []],
  [`white`,                                                        ["white"]],
  [`1px solid navy`,                                               ["navy"]],
  [`0 0 0 2px gold, 0 0 0 4px teal`,                               ["gold", "teal"]],
];
// The pure-black rule, both halves. The shadow exemption is what the rule is FOR, so it
// is probed as hard as the new catch: deleting it is not a fix for the blind spot.
const PROBE_HEX = [
  // hex          property              verdict
  [`#fff`,        `background`,         `skip`],
  [`#FFFFFF`,     `color`,              `skip`],
  [`#12345`,      `color`,              `skip`],      // 5 digits is not a hex colour
  [`#000`,        `background`,         `fill`],      // was SILENT
  [`#000000`,     `color`,              `fill`],      // was SILENT
  [`#000`,        `fill`,               `fill`],      // was SILENT — the case the message names
  [`#000`,        `border-color`,       `fill`],
  [`#000`,        ``,                   `fill`],      // no property found: still not a shadow
  [`#000`,        `box-shadow`,         `shadow`],
  [`#000000`,     `text-shadow`,        `shadow`],
  [`#000`,        `-webkit-box-shadow`, `shadow`],
  [`#000`,        `filter`,             `shadow`],
  [`#000`,        `backdrop-filter`,    `shadow`],
  [`#162D59`,     `color`,              `literal`],
  [`#162D59CC`,   `background`,         `literal`],
  [`#162D59`,     `box-shadow`,         `literal`],   // the exemption is for BLACK, not for shadows
];
const PROBE_SVG = [
  [`url("data:image/svg+xml;utf8,<svg><path stroke='white' fill='none'/></svg>")`, ["white"]],
  [`url("data:image/svg+xml;utf8,<svg><path stroke='black'/></svg>")`,             ["black"]],
  [`url("data:image/svg+xml,<svg><stop stop-color='crimson'/></svg>")`,            ["crimson"]],
  [`url("snow.png")`,                                                              []],
];
function probe() {
  selfTest();               // the shared scanners first: everything below reads them
  const bad = [];
  const check = (label, got, want) => {
    if (got.join(",") !== want.join(",")) bad.push(`${label}\n      expected [${want}] got [${got}]`);
  };
  for (const [value, want] of PROBE) check(`keywordsIn(${value})`, keywordsIn(value), want);
  for (const [hex, prop, want] of PROBE_HEX) {
    check(`hexVerdict(${hex}, ${prop || "-"})`, [hexVerdict(hex, prop)], [want]);
  }
  for (const [value, want] of PROBE_SVG) {
    check(`svgPaints(${value})`,
      [...svgPaints(value)].map((x) => x.value.toLowerCase()).filter((w) => NAMED.has(w)), want);
  }
  if (bad.length) {
    throw new Error(
      "colour guard SELF-TEST failed — it no longer separates paint from data, or no\n" +
      "longer judges every spelling of one colour by one rule:\n  - " +
      bad.join("\n  - ") +
      "\n\nurl() payloads and quoted strings are filenames, not colours; SVG paint\n" +
      "attributes inside a data: URI are colours; and #000 is the same colour as\n" +
      "rgb(0,0,0) and as `black` — exempt in a shadow, a finding on a surface.\n" +
      "Every half must hold."
    );
  }
}

const hex6 = (h) => (h.length === 3 ? h.split("").map((c) => c + c).join("") : h).toUpperCase();

// hex -> token name, derived entirely from :root (triplet + rgb(var()) form and
// the plain-hex tokens), so a suggestion can never name a token that moved.
function tokenIndex(styleCss) {
  const body = rootBody(styleCss);
  const decls = [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]);
  const triplets = new Map();
  for (const [name, val] of decls) {
    const t = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(val);
    if (t) triplets.set(name, hex6([t[1], t[2], t[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")));
  }
  const byHex = new Map();
  for (const [name, val] of decls) {
    const h = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(val);
    const r = /^rgb\(\s*var\(\s*(--[\w-]+)\s*\)\s*\)$/.exec(val);
    const key = h ? hex6(h[1]) : r && triplets.has(r[1]) ? triplets.get(r[1]) : null;
    if (key && !byHex.has(key)) byHex.set(key, name);
  }
  return byHex;
}

function checkColors() {
  probe();
  const errors = [];
  const warnings = [];
  const styleCss = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  const tokens = tokenIndex(styleCss);
  const suggest = (hx) => {
    const t = tokens.get(hex6(hx.replace("#", "")));
    return t ? ` — it IS var(${t})` : " — use var(--color-*)";
  };

  // --- the stylesheets we author ---------------------------------------
  for (const rel of FILES) {
    const css = rel === "css/style.css" ? styleCss : fs.readFileSync(path.join(ROOT, rel), "utf8");
    const scan = scannable(css);
    const at = (idx) => lineAt(scan, idx);

    // 3/4/6/8-digit hex. The 8-digit form is why this is not `{6}\b`: a trailing word
    // char defeats \b, so #162D59CC slips straight through such a pattern.
    for (const m of scan.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const prop = propertyAt(scan, m.index);
      const verdict = hexVerdict(m[0], prop);
      if (verdict === "skip" || verdict === "shadow") continue;
      if (verdict === "fill") {
        warnings.push(BLACK_FILL(`${rel}:${at(m.index)}`, prop, m[0]));
        continue;
      }
      errors.push(`${rel}:${at(m.index)}  hex literal ${m[0]}${suggest(m[0])}`);
    }
    // Numeric rgb()/rgba(), BOTH the comma form and the modern space/slash form.
    // rgba(var(--x-rgb), a) is fine.
    for (const m of scan.matchAll(/rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)/g)) {
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (r === g && g === b) {
        if (alpha === 0) continue;                     // fully transparent: no colour at all
        if (r === 255) continue;                       // paper: white is the doctrine, like #fff
        const prop = propertyAt(scan, m.index);
        if (r === 0 && SHADOW_PROPS.test(prop)) continue;   // shadow: what the exemption was FOR
        if (r === 0) {
          // A grey/black exemption that ends at `r===g===b` waves every pure-black
          // SURFACE through, against the "navy-tinted, never pure black" scrim doctrine.
          warnings.push(BLACK_FILL(`${rel}:${at(m.index)}`, prop, m[0]));
          continue;
        }
      }
      errors.push(`${rel}:${at(m.index)}  numeric ${m[0]} — use rgba(var(--<name>-rgb), a)`);
    }
    // Every other colour function is a hardcoded colour too.
    for (const m of scan.matchAll(/\b(hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/g)) {
      errors.push(`${rel}:${at(m.index)}  ${m[1]}() colour — use var(--color-*)`);
    }
    for (const m of scan.matchAll(/color-mix\(/g)) {
      errors.push(`${rel}:${at(m.index)}  color-mix() is banned — it computes to \`unset\` on Chrome <111 / iOS <16.2`);
    }
    // Bare CSS colour keywords. Invisible to a hex-only guard, and `white` is the one
    // that ships as a rendering fault (cream-on-white, white-on-yellow).
    for (const d of declarations(scan)) {
      if (!COLOR_PROPS.has(d.prop)) continue;
      for (const word of keywordsIn(d.value)) {
        const line = at(d.index);
        if (PAPER.has(word)) {
          warnings.push(`${rel}:${line}  ${d.prop}: bare keyword \`${word}\` — this repo spells paper/shadow #fff / #000; a keyword hides from every hex audit`);
        } else {
          errors.push(`${rel}:${line}  ${d.prop}: named colour \`${word}\` — use var(--color-*)`);
        }
      }
    }
    // Inline-SVG data-URIs, scanned whole-file rather than per declaration: a
    // `data:image/svg+xml;utf8,…` payload contains a `;`, so a declaration value is cut
    // off at `data:image/svg+xml` and the paint inside is in no value the loop can see.
    for (const pnt of svgPaints(scan)) {
      const word = pnt.value.toLowerCase();
      if (!NAMED.has(word)) continue;
      const line = at(pnt.index);
      if (PAPER.has(word)) {
        warnings.push(`${rel}:${line}  inline SVG ${pnt.attr}='${pnt.value}' — this repo spells paper/shadow #fff / #000; a keyword inside a data-URI hides from every hex audit`);
      } else {
        errors.push(`${rel}:${line}  inline SVG ${pnt.attr}='${pnt.value}' — named colour; use a token and re-encode the data-URI`);
      }
    }
  }

  // --- HTML: inline style="" carries literals too ------------------------
  const html = htmlFiles(ROOT);
  for (const rel of html) {
    const txt = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const s of inlineStyles(txt)) {
      const at = (off) => lineAt(txt, s.index + off);
      // `"{" + value` gives propertyAt() the opening brace its boundary walk
      // needs; the +1 keeps the offset pointing at the same character.
      const decl = "{" + s.value;
      for (const m of s.value.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        const prop = propertyAt(decl, m.index + 1);
        const verdict = hexVerdict(m[0], prop);
        if (verdict === "skip" || verdict === "shadow") continue;
        if (verdict === "fill") {
          warnings.push(BLACK_FILL(`${rel}:${at(m.index)}  inline style`, prop, m[0]));
          continue;
        }
        warnings.push(`${rel}:${at(m.index)}  inline style hex ${m[0]}${suggest(m[0])}`);
      }
      for (const m of s.value.matchAll(/rgba?\(\s*\d+\s*[,\s]\s*\d+\s*[,\s]\s*\d+/g)) {
        warnings.push(`${rel}:${at(m.index)}  inline style numeric ${m[0]}) — use rgba(var(--<name>-rgb), a)`);
      }
      for (const m of s.value.matchAll(/\b(hsla?|hwb|lab|lch|oklab|oklch|color-mix)\s*\(/g)) {
        warnings.push(`${rel}:${at(m.index)}  inline style ${m[1]}() colour — use var(--color-*)`);
      }
      for (const d of declarations("{" + s.value)) {
        if (!COLOR_PROPS.has(d.prop)) continue;
        for (const word of keywordsIn(d.value)) {
          warnings.push(`${rel}:${at(d.index - 1)}  inline style ${d.prop}: named colour \`${word}\` — use var(--color-*)`);
        }
      }
      for (const pnt of svgPaints(s.value)) {
        if (!NAMED.has(pnt.value.toLowerCase())) continue;
        warnings.push(`${rel}:${at(pnt.index)}  inline style SVG ${pnt.attr}='${pnt.value}' — use a token and re-encode the data-URI`);
      }
    }
  }

  // Undefined token references, across the stylesheets AND every HTML file, since inline
  // style="" can carry var() too.
  //
  // LIVE references only, and this is the strict tier — an entry here FAILS THE BUILD.
  // Scanning raw text instead would check a var() merely MENTIONED in a comment or in
  // page prose: `<!-- was var(--color-legacy) -->`, or a blog post about a rename, would
  // kill `npm run build`. liveCss() masks what a stylesheet is not (comments, strings,
  // url() payloads); htmlCss() EXTRACTS the only two places CSS is live in a document —
  // a <style> element and a real style attribute — rather than enumerating hiding places,
  // a list that had already grown three times past "complete".
  // Both keep offsets and newlines, so a finding cites the line it is really on.
  const defined = new Set([...rootBody(styleCss).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const VAR_USE = /var\(\s*(--[\w-]+)/g;
  const undefinedVars = (rel, live) => {
    for (const m of live.matchAll(VAR_USE)) {
      if (defined.has(m[1])) continue;
      errors.push(`${rel}:${lineAt(live, m.index)}  var(${m[1]}) is not defined in :root — computes to \`unset\` (transparent / none), silently`);
    }
  };
  for (const rel of FILES) {
    undefinedVars(rel, liveCss(fs.readFileSync(path.join(ROOT, rel), "utf8")));
  }
  for (const rel of html) {
    undefinedVars(rel, htmlCss(fs.readFileSync(path.join(ROOT, rel), "utf8")));
  }

  // WARN_NEW, wired: off, the three staged classes fail the build like every other
  // literal. Keep it read here — a WARN_NEW nothing consumes makes the docblock's
  // "flip it once those are migrated" an instruction that does nothing.
  if (!WARN_NEW && warnings.length) {
    errors.push(...warnings);
    warnings.length = 0;
  }

  if (warnings.length) {
    console.log(`Colour guard — ${warnings.length} untokenised colour(s) outside the hard rules (warn-only):\n  - ` +
      warnings.join("\n  - "));
  }
  if (errors.length) {
    throw new Error(
      `colour guard failed — ${errors.length} hardcoded colour(s):\n  - ` + errors.join("\n  - ") +
      `\n\nEvery colour lives in the :root block of css/style.css.` +
      `\n  solid:  color: var(--color-navy);` +
      `\n  alpha:  background: rgba(var(--navy-rgb), 0.45);`
    );
  }
  console.log(`Colour guard OK — 0 hardcoded colours outside :root in ${FILES.length} stylesheet(s) and ${html.length} HTML file(s)`);
}

// Only checkColors() has a caller (scripts/build.js build(), and the require.main branch
// below for `npm run check:colors`). probe() is not dead — checkColors() runs it first
// thing on every invocation — it just has no importer, so it is not exported.
module.exports = { checkColors };
if (require.main === module) {
  try { checkColors(); } catch (e) { console.error(e.message); process.exit(1); }
}
