#!/usr/bin/env node
/**
 * Shared scanning primitives for the CSS guards (colour / spacing / radius / type).
 *
 * Blanking preserves BOTH offsets and newlines (`m.replace(/[^\n]/g, " ")`).
 * `" ".repeat(s.length)` keeps offsets but destroys newlines, and every reported line
 * number is then short by the number of lines blanked above it.
 *
 * THE ONE RULE: a guard may only judge text a browser would execute. Four guards share
 * these functions, and the colour guard's var() check is at ERROR tier — a mistake here
 * does not print a warning, it fails `npm run build`.
 *
 * The HTML side is an EXTRACTION, not a blank-list. In an HTML document CSS is live in
 * exactly two places — inside a <style> element and inside a real `style` attribute —
 * and that closed definition cannot grow a fourth hiding place. The old list of "places
 * CSS is not" grew three times after being called complete: ordinary page prose, another
 * attribute's quoted value and an on* event handler each still reached the var() check
 * and could fail the build over text no renderer reads. htmlCss() walks the document once
 * with a real tokenizer and keeps those two regions; inlineStyles() reads the same walk.
 *
 * The CSS side keeps masking, because in a stylesheet the exceptions really are a closed
 * set: comment, string, url() payload. And a `:root` opens a token block only where it
 * has the SHAPE of a selector — `--sel: :root;` is live CSS that no masking can hide, and
 * a stray one blanks the real rule after it out of every guard's scan: silent blindness,
 * which is worse than a false positive.
 *
 * Every class of "text that merely looks like code" is asserted in selfTest() below,
 * each paired with the true positive it must not suppress — scanning less is not a fix.
 * It runs at the top of every guard, and standalone as `npm run check:scanners`.
 */
"use strict";

// Blank a span to spaces but KEEP its newlines, so both `.index` offsets and
// `split("\n").length` line numbers stay true.
const blank = (s) => s.replace(/[^\n]/g, " ");

// ASCII-only lowercase, for comparing tag and attribute names. Plain
// `toLowerCase()` is NOT length-preserving for every code point (U+0130
// lowercases to two characters), and every offset here indexes the original.
const lower = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

// --- what is CODE, and what is merely TEXT that looks like code ----------
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
// A url() payload names a FILE or carries a data: blob; a quoted string is a literal.
// Neither is CSS this repo authors, even when it looks like it. Exported because the
// colour guard needs the same idea of "url() payload" when it separates paint from
// filenames.
const URL_FN = /\burl\(\s*(?:"[^"]*"|'[^']*'|[^)]*?)\s*\)/gi;
const CSS_STRING = /"[^"]*"|'[^']*'/g;
// A declaration: `prop: value`, value running to the next `;`/`{`/`}`.
const DECL = /(-{0,2}[a-zA-Z][\w-]*)\s*:\s*([^;{}]+)/g;

const blankComments = (css) => css.replace(CSS_COMMENT, blank);

// A stylesheet with every url() payload and quoted string blanked out. Used for
// FINDING declarations, never for reading their values — the value a guard sees
// is always sliced back out of the original text, so `font-family: "New York"`
// still arrives with its quotes on.
//
// The DELIMITERS survive: `url(` and `)`, and both quotes. Blanking them too turns
// `font-family:"New York",serif` into `font-family:           ,serif`, the `\s*` after
// the colon then eats the spaces, and every offset derived from the value is wrong.
const hollow = (m, open) => m.slice(0, open) + blank(m.slice(open, -1)) + m.slice(-1);
const maskData = (css) =>
  blankComments(css)
    .replace(URL_FN, (m) => hollow(m, m.indexOf("(") + 1))
    .replace(CSS_STRING, (m) => hollow(m, 1));

// A stylesheet reduced to the text a browser would act on. This is what a var()
// reference scan must read: a token named in a comment or inside a string is prose, and
// failing the build over prose is a false positive at ERROR tier.
const liveCss = (css) => maskData(css);

// --- an HTML document, walked the way a parser walks it -------------------
// ONE sequential pass, so every byte lands in exactly one token and ORDER is a property
// of the walk rather than of the order two regexes happen to run in: a `<code>` named
// inside a comment is comment text because the comment token is taken first.

const isSpace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
const isAlpha = (c) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));

// Elements whose content is TEXT, not markup. The first four are raw text /
// RCDATA in the HTML spec itself; <pre> and <code> are this repo's convention
// for a SAMPLE, which is why unescaped markup inside them is not an element.
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const SAMPLE_TEXT = new Set(["pre", "code"]);

// `</name` followed by a tag-name boundary, searched in the lowercased copy.
function findClose(low, name, from) {
  const needle = "</" + name;
  for (let i = from; ; ) {
    const k = low.indexOf(needle, i);
    if (k < 0) return -1;
    const after = low[k + needle.length];
    if (after === undefined || after === ">" || after === "/" || isSpace(after)) return k;
    i = k + needle.length;
  }
}

// One tag, with the offsets of every attribute VALUE in the original text. Attribute
// values are consumed the way the HTML tokenizer consumes them: once a `"` opens a
// value, `>` and `style=` inside it are just characters, so
// `<div data-tpl="<p style='gap:3px'>">` is one tag with one attribute and no inline
// style anywhere in it.
function readTag(html, lt) {
  const n = html.length;
  let i = lt + 1;
  let closing = false;
  if (html[i] === "/") { closing = true; i++; }
  const ns = i;
  while (i < n && !isSpace(html[i]) && html[i] !== "/" && html[i] !== ">") i++;
  const name = lower(html.slice(ns, i));
  const attrs = [];
  let selfClosing = false;
  while (i < n) {
    if (isSpace(html[i])) { i++; continue; }
    if (html[i] === ">") { i++; break; }
    if (html[i] === "/") {
      if (html[i + 1] === ">") { selfClosing = true; i += 2; break; }
      i++; continue;
    }
    const as = i;
    while (i < n && !isSpace(html[i]) && html[i] !== "/" && html[i] !== ">" && html[i] !== "=") i++;
    if (i === as) { i++; continue; }                        // never stall
    const aname = lower(html.slice(as, i));
    let j = i;
    while (j < n && isSpace(html[j])) j++;
    if (html[j] !== "=") { attrs.push({ name: aname, start: i, end: i }); continue; }
    j++;
    while (j < n && isSpace(html[j])) j++;
    const q = html[j];
    if (q === '"' || q === "'") {
      const close = html.indexOf(q, j + 1);
      attrs.push({ name: aname, start: j + 1, end: close < 0 ? n : close });
      i = close < 0 ? n : close + 1;
    } else {
      const vs = j;
      while (j < n && !isSpace(html[j]) && html[j] !== ">") j++;
      attrs.push({ name: aname, start: vs, end: j });
      i = j;
    }
  }
  return { kind: "tag", start: lt, end: i, name, closing, selfClosing, attrs };
}

// Every token, in document order: "tag", "comment", "bogus" (doctype and the
// like) and "text" (the content of a raw-text / sample element).
function* htmlTokens(html) {
  const low = lower(html);
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) return;
    if (html.startsWith("<!--", lt)) {
      const e = html.indexOf("-->", lt + 4);
      const end = e < 0 ? n : e + 3;
      yield { kind: "comment", start: lt, end };
      i = end;
      continue;
    }
    const c = html[lt + 1];
    if (c === "!" || c === "?") {
      const e = html.indexOf(">", lt + 1);
      const end = e < 0 ? n : e + 1;
      yield { kind: "bogus", start: lt, end };
      i = end;
      continue;
    }
    if (!isAlpha(c === "/" ? html[lt + 2] : c)) { i = lt + 1; continue; }  // a bare "<" in prose
    const tag = readTag(html, lt);
    yield tag;
    i = tag.end;
    if (tag.closing || tag.selfClosing) continue;
    const raw = RAW_TEXT.has(tag.name);
    if (!raw && !SAMPLE_TEXT.has(tag.name)) continue;
    const close = findClose(low, tag.name, tag.end);
    if (close < 0) {
      // An unclosed <script>/<style>/<textarea>/<title> really does swallow the rest of
      // the document in a browser. An unclosed <pre>/<code> does not, and treating one as
      // a container would blind the guards to everything after it, so it stays markup.
      if (!raw) continue;
      yield { kind: "text", name: tag.name, start: tag.end, end: n };
      i = n;
      continue;
    }
    yield { kind: "text", name: tag.name, start: tag.end, end: close };
    i = close;
  }
}

// THE CLOSED DEFINITION. In an HTML document CSS is live in exactly two places.
// Everything else — prose, other attributes, event handlers, comments, doctypes,
// samples, script bodies — is not CSS, and no list of them is needed or kept.
function* cssRegions(html) {
  for (const t of htmlTokens(html)) {
    if (t.kind === "tag") {
      for (const a of t.attrs) if (a.name === "style") yield { kind: "attr", start: a.start, end: a.end };
    } else if (t.kind === "text" && t.name === "style") {
      yield { kind: "element", start: t.start, end: t.end };
    }
  }
}

// An HTML file reduced to the CSS a browser will actually apply from it: same
// length, same line breaks, everything that is not live CSS blanked. Inside the
// two live regions the stylesheet masking still applies, so a token named in a
// CSS comment or a string inside a <style> block is prose there too.
function htmlCss(html) {
  let out = "";
  let at = 0;
  for (const r of cssRegions(html)) {
    out += blank(html.slice(at, r.start)) + maskData(html.slice(r.start, r.end));
    at = r.end;
  }
  return out + blank(html.slice(at));
}

// [start, end) of EVERY :root block, brace-balanced, in source order.
//
// Every one, not just the first: a second block (`:root[data-theme="dark"]`, a
// `@media (prefers-contrast)` override) contributes tokens to the same scales, and a
// single-span version both loses them and scans their bodies as ordinary CSS.
//
// TWO tests, because one is not enough. The search runs over the MASKED text, so a
// `:root` in a comment, a string or a url() payload is not there to find. And what is
// found must have the SHAPE of a selector: between it and its `{` there may be more
// selector and nothing else. Only that second test catches `--sel: :root;`, which is
// live CSS no masking can hide and which otherwise blanks a real rule out of every
// guard's scan — silent blindness, worse than a false positive.
function* rootSpans(css) {
  const src = maskData(css);
  let from = 0;
  for (;;) {
    const i = src.indexOf(":root", from);
    if (i < 0) return;
    from = i + 5;
    const k = src.indexOf("{", i);
    if (k < 0) return;                            // no brace left in the file at all
    if (/[;}]/.test(src.slice(i, k))) continue;   // not a selector: a value, or prose
    let depth = 0;
    let end = -1;
    for (let j = k; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") { depth--; if (!depth) { end = j + 1; break; } }
    }
    if (end < 0) return;
    yield [i, end];
    from = end;
  }
}

// The token declarations, all of them, comments already blanked — what every guard reads
// its scale out of. Sliced out of blankComments(), NOT maskData(): a token value can
// legitimately be a string (`--font-serif: "Playfair Display", serif`), and the type
// guard reads those family names straight out of here.
function rootBody(css) {
  const src = blankComments(css);
  let out = "";
  for (const [s, e] of rootSpans(css)) out += src.slice(s, e) + "\n";
  return out;
}

// The text a guard should scan: the stylesheet with every :root block and every
// comment blanked out, same length and same line breaks as the original.
function scannable(css) {
  let scan = blankComments(css);
  for (const [s, e] of rootSpans(css)) {
    scan = scan.slice(0, s) + blank(scan.slice(s, e)) + scan.slice(e);
  }
  return scan;
}

// 1-indexed line of a character offset.
const lineAt = (text, idx) => text.slice(0, idx).split("\n").length;

// The property a character offset sits inside: walk back to the nearest declaration
// boundary and read the identifier before the colon; "" at a selector or at-rule
// prelude. Walked over the MASKED text, because a `;` inside a string is not a boundary.
// One-entry cache: callers pass the same whole-file string over and over.
let maskedFor = null;
let maskedText = "";
function masked(text) {
  if (maskedFor !== text) { maskedFor = text; maskedText = maskData(text); }
  return maskedText;
}
function propertyAt(text, idx) {
  const t = masked(text);
  const start = Math.max(
    t.lastIndexOf(";", idx), t.lastIndexOf("{", idx), t.lastIndexOf("}", idx),
  ) + 1;
  const m = /^\s*(-{0,2}[a-zA-Z][\w-]*)\s*:/.exec(t.slice(start, idx));
  return m ? m[1].toLowerCase() : "";
}

// Every `prop: value` in a scannable stylesheet, with the offset of the declaration so a
// finding can be located. Custom properties are skipped: the only ones outside :root are
// local overrides, and their values are the tokens.
//
// Boundaries are found in the MASKED copy and the value is sliced out of the ORIGINAL,
// so a `;`, `{` or `}` inside a string or a url() payload can neither start nor end a
// declaration, while the guard still sees the real value.
function* declarations(scan) {
  const mask = maskData(scan);
  for (const m of mask.matchAll(DECL)) {
    // A declaration always OPENS right after `{` or `;`, which rejects the two things
    // that look like one: pseudo-class selectors (`a:hover`) and media preludes
    // (`(max-width: …`). `k < 0` is not an opening either — only the inline-style callers
    // reach offset 0, and they prepend a `{` precisely so this holds.
    let k = m.index - 1;
    while (k >= 0 && /\s/.test(mask[k])) k--;
    if (k < 0 || (mask[k] !== "{" && mask[k] !== ";")) continue;
    // ...and it always CLOSES at `;`, `}` or end of file — never at `{`. That is the
    // difference between a declaration and a selector: inside an at-rule the first
    // selector is also preceded by `{`, so `@media print{p:hover{color:red}}` would
    // otherwise yield a phantom `p: hover`.
    if (mask[m.index + m[0].length] === "{") continue;
    // A custom property is an override, not a value this repo audits.
    if (m[1].startsWith("--")) continue;
    // The value capture is the trailing group, so its offset is fixed by length.
    const start = m.index + m[0].length - m[2].length;
    yield { prop: m[1].toLowerCase(), value: scan.slice(start, start + m[2].length), index: m.index };
  }
}

// px per rem, for the guards that compare a rem value against a px ladder. rem resolves
// against the ROOT element, so `body { font-size: 16px }` is NOT the base; only an
// html/:root font-size would be. There is none, so this falls through to the UA default
// and starts reading the stylesheet the moment one is added.
function rootFontPx(css) {
  const src = blankComments(css);
  const m = /(?:^|[},])\s*(?:html|:root)[^{}]*\{[^{}]*?font-size\s*:\s*(\d+(?:\.\d+)?)px/m.exec(src);
  return m ? Number(m[1]) : 16;
}

// Every REAL inline style="" / style='' payload, with the offset of the value in
// the ORIGINAL text so a finding can cite the real line. Read off the
// tokenizer's attribute list, so a `style=` spelled inside another attribute's
// value, inside an event handler, inside prose or inside a sample is not an
// attribute at all — there is nothing to exclude, because it was never in.
function* inlineStyles(html) {
  for (const r of cssRegions(html)) {
    if (r.kind !== "attr") continue;
    yield { value: html.slice(r.start, r.end), index: r.start };
  }
}

// The directories NOTHING here descends into: vendor code, VCS internals and the
// archived site. Exported because scripts/build.js walks the tree too (its results-claim
// scan and its nav sync) — one regex, one meaning of "our HTML", so the copies cannot
// drift apart silently.
const SKIP_DIR = /^(node_modules|\.git|plugins|deprecated)$/;

// Every HTML file build.js itself walks — the same skip list, so the guards and
// the build always agree on what "our HTML" means.
function htmlFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const e of require("fs").readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIR.test(e.name)) continue;
      const full = require("path").join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".html")) out.push(require("path").relative(root, full));
    }
  })(root);
  return out.sort();
}

// --- regression probe suite ----------------------------------------------
// Each case is either something that used to be scanned as live code, or something that
// must go on being scanned as live code. They are paired on purpose: a false positive is
// trivially "fixed" by scanning less, and the true-positive half is what stops that.
// Runs at the top of all four guards, so no guard can run without it.
const PROBE_DECL = [
  // ---- must NOT be read as declarations of ours (one per class) ----
  // data-URI SVG carrying its own <style> block.
  [`.a{background-image:url("data:image/svg+xml;utf8,<svg><style>text{font-size:13px;font-family:Comic Sans MS,cursive}</style></svg>")}`,
    ["background-image"]],
  // the same unquoted, where the `;` in the MIME type used to cut the value.
  [`.a{background:url(data:image/svg+xml;utf8,<svg><style>p{padding:7px}</style></svg>) no-repeat}`,
    ["background"]],
  // a string value whose text spells declarations.
  [`.a{content:"font-size: 9px; font-family: Wingdings;"}`, ["content"]],
  [`.a{content:'line-height: 3.3; border-radius: 7px;'}`, ["content"]],
  // a comment, and a `:root` written inside one.
  [`/* font-size: 9px; :root{--x:1px} */ .a{color:red}`, ["color"]],
  // a selector after `{` inside an at-rule is not a declaration. The tell
  // is that its value would have to end at `{`, and no value ever does.
  [`@media print{p:hover{color:red}}`, ["color"]],
  [`@supports (display:grid){a:hover{color:red}}`, ["color"]],
  [`@media screen{ul:not(.x){padding:8px}}`, ["padding"]],
  // a custom property outside :root is a local override, not a raw value.
  [`.a{--space-2:8px;gap:4px}`, ["gap"]],
  [`.bg-dark{--focus-ring:var(--color-amber)}`, []],
  // ---- and the true positives that must survive all of the above ----
  [`.a{color:red;font-size:12px}`, ["color", "font-size"]],
  [`a:hover{color:red}`, ["color"]],
  [`@media (max-width: 600px){.a{padding:8px}}`, ["padding"]],
  [`@media print{.a{color:red}}`, ["color"]],
  [`.a{font-family:"New York","Playfair Display",serif}`, ["font-family"]],
  [`.a{background:url("hero.png");gap:1rem}`, ["background", "gap"]],
  // the LAST declaration in a file, with no closing brace after it.
  [`.a{gap:4px`, ["gap"]],
];
// A masked scan must never change the value a guard reads.
const PROBE_VALUE = [
  [`.a{font-family:"New York","Playfair Display",serif}`, `"New York","Playfair Display",serif`],
  [`.a{content:"font-size: 9px;"}`, `"font-size: 9px;"`],
];
const PROBE_INLINE = [
  // commented-out markup — the live element beside it still counts.
  [`<!-- <p style="font-size:11px;font-weight:650"> --><p style="color:red">`, ["color:red"]],
  // code samples and script-built markup.
  [`<pre><code>&lt;p style="font-size:11px"&gt;</code></pre>`, []],
  [`<pre><code><p style="font-size:11px"></code></pre>`, []],
  [`<script>el.innerHTML = '<p style="font-size:11px">x</p>';</script>`, []],
  [`<textarea><p style="gap:3px"></textarea>`, []],
  [`<title>How we style="gap:3px" things</title>`, []],
  // *-style attributes are not the style attribute.
  [`<div data-style="font-size:11px"></div>`, []],
  [`<div my-style='gap:3px'></div>`, []],
  // another attribute's quoted value is a VALUE, not a place attributes live.
  [`<a title="use style='color:red'">x</a>`, []],
  [`<div data-tpl="<p style='gap:3px'>"></div>`, []],
  [`<img alt='style="gap:3px"' src="x.png">`, []],
  // an inline event handler is JS, exactly like a <script> body.
  [`<button onclick="this.style='display:none'">x</button>`, []],
  [`<a onmouseover="el.style='color:red'">x</a>`, []],
  // a verbatim element merely NAMED in a comment must not open one. The
  // live element here sits between the comment and the next real </code>.
  [`<!-- TODO wrap this in <code> --><p style="color:red">live</p><p><code>x</code></p>`,
    ["color:red"]],
  [`<!-- delete the <script> below --><p style="gap:3px">live</p><script>var a=1;</script>`,
    ["gap:3px"]],
  // an unclosed <code> is not a container either — it is a typo, and swallowing
  // the rest of the file over one is the same blindness wearing a hat.
  [`<p>see <code>x<p style="color:red">live</p>`, ["color:red"]],
  // ---- true positives ----
  [`<div data-style="x" style="color:red"></div>`, ["color:red"]],
  [`<p style="color:red">`, ["color:red"]],
  [`<p STYLE = 'gap:1rem'>`, ["gap:1rem"]],
  [`<a title="t" onclick="f()" style="gap:1rem">x</a>`, ["gap:1rem"]],
  // a `>` inside a quoted value does not end the tag, so the style after it is
  // still an attribute of this tag.
  [`<div data-tpl="<b>" style="color:red"></div>`, ["color:red"]],
  // the open tag of a verbatim element is still an element.
  [`<pre style="font-size:11px">sample</pre>`, ["font-size:11px"]],
  [`<p style="">`, [""]],
];
// The build-breaker: only LIVE var() references may be checked against :root.
const PROBE_LIVE_CSS = [
  [`/* was var(--gone) before the retoken */ .a{color:var(--here)}`, ["--here"]],
  [`.a{content:"var(--gone)"}`, []],
  [`.a{background:url("data:image/svg+xml,<svg fill='var(--gone)'/>")}`, []],
  [`.a{color:var(--here);border-color:var(--also)}`, ["--here", "--also"]],
];
// The same rule for HTML, and the reason that side is now an
// EXTRACTION: every false positive below lived in a different container, and
// the list of containers kept growing. "Inside a <style> element, or inside a
// style attribute" does not grow.
const PROBE_LIVE_HTML = [
  [`<!-- historically var(--gone) --><p style="color:var(--here)">`, ["--here"]],
  [`<script>const s = "color:var(--gone)";</script><p style="color:var(--here)">`, ["--here"]],
  [`<pre><code>color: var(--gone)</code></pre>`, []],
  // ordinary page prose. THE build-breaker: this site has a blog.
  [`<p>We renamed var(--gone) to var(--gone-too) last spring.</p>`, []],
  [`<h2>var(--gone)</h2><p style="color:var(--here)">x</p>`, ["--here"]],
  // another attribute's value, and an event handler.
  [`<a title="use var(--gone)">x</a>`, []],
  [`<div data-tpl="<i style='color:var(--gone)'>"></div>`, []],
  [`<a onmouseover="el.style='color:var(--gone)'">x</a>`, []],
  // ordering: the comment is taken first, so nothing after it is swallowed.
  [`<!-- wrap in <code> --><p style="color:var(--here)">x</p><p><code>y</code></p>`, ["--here"]],
  // ---- true positives ----
  [`<p style="color:var(--here)">`, ["--here"]],
  // a <style> element IS live CSS — the other half of the closed definition.
  [`<style>.a{color:var(--here)}</style>`, ["--here"]],
  [`<style>/* var(--gone) */.a{color:var(--here)}</style>`, ["--here"]],
  [`<style>.a{content:"var(--gone)";color:var(--here)}</style>`, ["--here"]],
];
// Two :root blocks: both contribute tokens, both are hidden from the scan,
// and the line numbers of what is left are unchanged.
const PROBE_ROOT_CSS =
  `:root{--a:1px}\n.x{color:red}\n:root[data-theme="dark"]{--a:2px;--b:3px}\n.y{padding:4px}\n`;
// Every container a stray `:root` has hidden in, plus the one that is not
// a container at all. Each must leave the real rule after it VISIBLE — silent
// blindness is the failure mode that prints no message to notice.
const PROBE_ROOT_BLIND = [
  [`/* :root is where tokens live */\n.b{gap:3px}`, 0],
  [`.a{content:":root"}\n.b{gap:3px}`, 0],
  [`.a{background:url(data:image/svg+xml,<svg id=":root"/>)}\n.b{gap:3px}`, 0],
  [`.a{--sel: :root;}\n.b{gap:3px}`, 0],
  // ---- true positives: these ARE token blocks and must still be found ----
  [`:root{--a:1px}\n.b{gap:3px}`, 1],
  [`:root[data-theme="dark"]{--a:1px}\n.b{gap:3px}`, 1],
  [`html:root{--a:1px}\n.b{gap:3px}`, 1],
  [`@media (prefers-contrast: more){:root{--a:1px}}\n.b{gap:3px}`, 1],
  [`:root,\n.theme{--a:1px}\n.b{gap:3px}`, 1],
];

const VAR_REF = /var\(\s*(--[\w-]+)/g;
let selfTested = false;
function selfTest() {
  if (selfTested) return;
  selfTested = true;
  const bad = [];
  const eq = (label, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      bad.push(`${label}\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`);
    }
  };
  const props = (css) => [...declarations(scannable(css))].map((d) => d.prop);
  const vars = (text) => [...text.matchAll(VAR_REF)].map((m) => m[1]);

  for (const [css, want] of PROBE_DECL) eq(`declarations(${css})`, props(css), want);
  for (const [css, want] of PROBE_VALUE) {
    eq(`value of ${css}`, [...declarations(scannable(css))].map((d) => d.value.trim())[0], want);
  }
  for (const [html, want] of PROBE_INLINE) {
    const got = [...inlineStyles(html)];
    eq(`inlineStyles(${html})`, got.map((s) => s.value), want);
    // The offset must land on the value in the ORIGINAL text, or every line
    // number a guard prints for an inline style is fiction.
    for (const s of got) {
      if (html.slice(s.index, s.index + s.value.length) !== s.value) {
        bad.push(`inlineStyles(${html})\n      offset ${s.index} does not point at ${JSON.stringify(s.value)}`);
      }
    }
  }
  for (const [css, want] of PROBE_LIVE_CSS) eq(`liveCss(${css})`, vars(liveCss(css)), want);
  for (const [html, want] of PROBE_LIVE_HTML) {
    const live = htmlCss(html);
    eq(`htmlCss(${html})`, vars(live), want);
    // Offsets and line breaks must survive, or a var() finding at ERROR tier
    // cites a line that is not the line it is on.
    if (live.length !== html.length) {
      bad.push(`htmlCss(${html})\n      length ${live.length} != ${html.length}`);
    }
    if (live.split("\n").length !== html.split("\n").length) {
      bad.push(`htmlCss(${html})\n      line count changed`);
    }
  }
  for (const [css, want] of PROBE_ROOT_BLIND) {
    eq(`rootSpans(${JSON.stringify(css)})`, [...rootSpans(css)].length, want);
    // ...and the point of the whole thing: the rule AFTER the decoy is still
    // scanned, whichever way the decoy was read.
    eq(`scannable() keeps the rule after ${JSON.stringify(css)}`, props(css).includes("gap"), true);
  }

  eq("rootSpans(two :root blocks)", [...rootSpans(PROBE_ROOT_CSS)].length, 2);
  eq("rootBody(two :root blocks)", vars(rootBody(PROBE_ROOT_CSS).replace(/--/g, "var(--")).sort(),
    ["--a", "--a", "--b"]);
  eq("scannable(two :root blocks)", props(PROBE_ROOT_CSS), ["color", "padding"]);
  eq("line of the rule after the second :root",
    lineAt(scannable(PROBE_ROOT_CSS), [...declarations(scannable(PROBE_ROOT_CSS))][1].index), 4);

  if (bad.length) {
    throw new Error(
      "css-source SELF-TEST failed — the shared scanners no longer separate live CSS\n" +
      "from text that merely looks like it:\n  - " + bad.join("\n  - ") +
      "\n\nAll four guards read these functions. In an HTML file, CSS is live in exactly\n" +
      "two places — a <style> element and a real style attribute — and htmlCss()\n" +
      "EXTRACTS those rather than blanking a list of hiding places, because that list\n" +
      "grew three times after it was called complete. In a stylesheet, comments,\n" +
      "strings and url() payloads are not CSS; every other declaration is. And a\n" +
      "`:root` is a token block only where it has the shape of a selector.\n" +
      "Every half must hold — scanning less is not a fix, and neither is scanning more.\n"
    );
  }
}

// Exported = promised to a caller. blankComments, maskData, htmlTokens and rootSpans are
// internal stages with no importer, so they are not exported; they stay callable here.
module.exports = {
  blank, liveCss, htmlCss, rootBody, scannable, lineAt, propertyAt,
  rootFontPx, declarations, inlineStyles, htmlFiles, SKIP_DIR, URL_FN, selfTest,
};
if (require.main === module) {
  const CASES = PROBE_DECL.length + PROBE_VALUE.length + PROBE_INLINE.length +
    PROBE_LIVE_CSS.length + PROBE_LIVE_HTML.length + PROBE_ROOT_BLIND.length * 2 + 4;
  try {
    selfTest();
    console.log(`Scanner self-test OK — ${CASES} cases: in HTML, CSS is live only inside a ` +
      `<style> element and a real style attribute — prose, other attributes, event handlers, ` +
      `comments and code samples are not; in CSS, comments, strings and url() payloads are ` +
      `not; and a ":root" is a token block only where it is shaped like a selector`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
