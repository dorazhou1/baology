#!/usr/bin/env node
/**
 * Pre-render gallery + testimonials into the HTML files so AI/search crawlers
 * (which don't run JS) can index the content. Without this, the gallery and
 * testimonials sections look like empty <div>s in the page source.
 *
 * Inputs:  data/gallery.csv, data/testimonials.yaml
 * Outputs: rewrites regions between `<!-- BUILD:name -->` and `<!-- /BUILD:name -->`
 *          marker pairs in explore.html, explore/gallery.html, explore/testimonials.html.
 *
 * Run:     node scripts/build.js
 *
 * Gallery schema (CSV columns):
 *   src         - path to image, MUST start with "/" so the JS path-rewrite works
 *   alt         - alt text for screen readers + SEO
 *   location    - bold title in the caption
 *   date        - YYYY | YYYY-MM | YYYY-MM-DD | empty (Unlabeled)
 *   description - caption subtitle
 *
 * Testimonials schema: see data/testimonials.yaml header.
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { imageSize } = require("image-size");

const ROOT = path.resolve(__dirname, "..");

// Read an image's pixel dimensions off disk. CSV `src` is root-anchored
// (`/images/...`); the on-disk path is ROOT + that.
function imageAspect(src) {
  if (typeof src !== "string") return 1;
  const rel = src.startsWith("/") ? src.slice(1) : src;
  const filePath = path.join(ROOT, rel);
  try {
    const { width, height } = imageSize(fs.readFileSync(filePath));
    if (!width || !height) return 1;
    return height / width;
  } catch (e) {
    console.warn(`  ! could not read dimensions for ${src}: ${e.message}`);
    return 1;
  }
}

// Greedy bin-packing: place each photo into whichever column currently has the
// smallest summed aspect ratio, producing visually balanced column heights.
//
// `photos` arrives newest-first. We pack OLDEST-first and then reverse each
// column so the newest still renders at the top. Why pack oldest-first: the
// usual edit is appending a *newer* photo, which then gets packed last and
// dropped into one column — leaving every existing photo's column and order
// untouched. The committed HTML diff becomes a single inserted tile instead of
// a full reshuffle. (Back-filling an older photo can still shuffle newer ones,
// but that's rare.) Order is preserved within each column; across-column order
// relaxes for the sake of balanced heights.
function distributeBalanced(photos, K) {
  const cols = Array.from({ length: K }, () => ({ items: [], total: 0 }));
  for (let i = photos.length - 1; i >= 0; i--) {
    const p = photos[i];
    let target = cols[0];
    for (let c = 1; c < cols.length; c++) {
      if (cols[c].total < target.total) target = cols[c];
    }
    target.items.push(p);
    target.total += p.aspect || 1;
  }
  return cols.map(c => c.items.reverse());
}

// --- CSV parser ---------------------------------------------------------
// Minimal RFC-4180 parser: handles quoted fields, embedded commas, CRLF,
// and "" escapes. Returns array-of-arrays including the header row.
function parseCSVGrid(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ""));
}

// Header row + data rows, keyed by column name. The syllabus renderer wants raw
// positional cells instead, so it calls parseCSVGrid directly.
function parseCSV(text) {
  const rows = parseCSVGrid(text);
  const header = rows.shift() || [];
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] != null ? r[i] : ""])));
}

// --- HTML escapers ------------------------------------------------------
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}
const escapeAttr = escapeHtml;

// --- Gallery helpers (mirror js/gallery.js) -----------------------------
function yearOf(date) {
  if (date == null || date === "") return null;
  const m = String(date).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

function dateSortKey(date) {
  if (date == null || date === "") return -Infinity;
  const str = String(date);
  if (/^\d{4}$/.test(str)) return new Date(`${str}-01-01`).getTime();
  if (/^\d{4}-\d{2}$/.test(str)) return new Date(`${str}-01`).getTime();
  const d = new Date(str);
  return isNaN(d) ? -Infinity : d.getTime();
}

function formatDate(date) {
  if (date == null || date === "") return "";
  const str = String(date);
  if (/^\d{4}$/.test(str)) return str;
  const ymd = str.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (ymd) {
    const y = Number(ymd[1]), m = Number(ymd[2]), d = Number(ymd[3] || 1);
    const dt = new Date(y, m - 1, d);
    if (!isNaN(dt)) return dt.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  }
  const dt = new Date(str);
  if (!isNaN(dt)) return dt.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  return str;
}

function captionLine(p) {
  return [formatDate(p.date), p.description].filter(Boolean).join(" · ");
}

// Path rewriter — matches js/gallery.js resolveSrc / js/explore.js resolveGallerySrc.
// `/images/...` → `../images/...` for pages one level deep (gallery.html, testimonials.html),
// `/images/...` → `images/...` for root-level pages (explore.html).
function resolveSrcForDepth(src, depth) {
  if (typeof src !== "string" || !src.startsWith("/")) return src;
  return depth === 1 ? ".." + src : src.slice(1);
}

// --- Gallery tile HTML --------------------------------------------------
// Every attribute here is intrinsic to the photo itself (its own year, its own
// aspect ratio) — nothing depends on neighbouring photos — so a tile's HTML is
// byte-stable no matter what else is added to the gallery. We deliberately omit
// data-chrono-idx (the photo's position in the global newest-first order): it
// shifts for every tile whenever a photo is inserted, and js/gallery.js
// recomputes it at runtime anyway, so baking it in only adds git churn.
function renderGalleryTile(p, depth) {
  const src = resolveSrcForDepth(p.src, depth);
  const desc = captionLine(p);
  const y = yearOf(p.date);
  const yearAttr = y != null ? String(y) : "unlabeled";
  const aspect = (p.aspect || 1).toFixed(4);
  return `        <a class="gallery-tile gallery-tile--page wow fadeInUp"
           href="${escapeAttr(src)}"
           data-year="${escapeAttr(yearAttr)}"
           data-aspect="${aspect}">
          <img src="${escapeAttr(src)}" alt="${escapeAttr(p.alt || "")}">
          <div class="gallery-tile-caption">
            <div class="loc">${escapeHtml(p.location || "")}</div>
            <div class="desc">${escapeHtml(desc)}</div>
          </div>
        </a>`;
}

function renderHiddenLightboxAnchor(p, depth) {
  const src = resolveSrcForDepth(p.src, depth);
  const desc = captionLine(p);
  const glb = `title: ${p.location || ""}; description: ${desc}`;
  return `        <a class="gallery-lightbox-source" href="${escapeAttr(src)}" data-glightbox="${escapeAttr(glb)}"></a>`;
}

// --- Testimonials helpers (mirror js/testimonials.js / js/explore.js) ---
function placementMaxYear(p) {
  const y = p && p.year;
  if (Array.isArray(y) && y.length) return Math.max(...y.filter(n => typeof n === "number"));
  if (typeof y === "number") return y;
  return 0;
}

function placementRank(medal) {
  const s = (medal || "").toLowerCase();
  if (s.includes("gold")) return 5;
  if (s.includes("silver")) return 4;
  if (s.includes("bronze")) return 3;
  if (s.includes("finalist") && !s.includes("semi")) return 2;
  if (s.includes("semifinalist")) return 1;
  return 0;
}

function medalVariant(medal) {
  const s = (medal || "").toLowerCase();
  if (s.includes("gold")) return "gold";
  if (s.includes("silver")) return "silver";
  if (s.includes("bronze")) return "bronze";
  if (s.includes("finalist") && !s.includes("semi")) return "finalist";
  if (s.includes("semifinalist")) return "semifinalist";
  return "default";
}

function formatYear(y) {
  if (typeof y === "number") return String(y);
  if (!Array.isArray(y) || y.length === 0) return String(y == null ? "" : y);
  const sorted = [...new Set(y.filter(n => typeof n === "number"))].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const runs = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i]; continue; }
    runs.push([start, prev]);
    start = prev = sorted[i];
  }
  runs.push([start, prev]);
  return runs.map(([s, e]) => (s === e ? `${s}` : `${s}–${e}`)).join(", ");
}

function renderTestimonialBadges(placements) {
  if (!Array.isArray(placements) || placements.length === 0) return "";
  const sorted = [...placements].sort((a, b) => {
    const ya = placementMaxYear(a), yb = placementMaxYear(b);
    if (yb !== ya) return yb - ya;
    return placementRank(b.medal) - placementRank(a.medal);
  });
  return sorted.map(p => {
    const variant = medalVariant(p.medal);
    const text = `${escapeHtml(p.medal)} · ${formatYear(p.year)}`.trim();
    return `<span class="placement-badge placement-badge--${variant}">${text}</span>`;
  }).join(" ");
}

function sortTestimonialsForCarousel(data) {
  const featured = data.filter(t => t.featured);
  if (featured.length) return featured;
  return [...data].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 5);
}

function sortTestimonialsForGrid(data) {
  // Featured first, then by latest placement year desc.
  return [...data].sort((a, b) => {
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    const ya = Math.max(0, ...(a.placements || []).map(placementMaxYear));
    const yb = Math.max(0, ...(b.placements || []).map(placementMaxYear));
    return yb - ya;
  });
}

// data-wow-delay staggers the scroll-fade so cards don't all bubble up in
// unison. The grid is a CSS multi-column (balanced, top-to-bottom then next
// column), so DOM order rises diagonally across the layout; an index-based
// delay cascades it and keeps same-row cards out of lockstep. Capped at 0.6s
// so later cards never sit hidden for long. Mirrors js/testimonials.js.
function renderTestimonialCard(t, i) {
  const delay = Math.min((i || 0) * 0.08, 0.6).toFixed(2);
  return `        <article class="testimonial-card wow fadeInUp" data-wow-delay="${delay}s">
          <i class="fa-solid fa-quote-left icon mb-3"></i>
          <p class="quote">${escapeHtml((t.quote || "").trim())}</p>
          <h5 class="testimonial-name">${escapeHtml(t.name)}</h5>
          <div class="testimonial-placements">${renderTestimonialBadges(t.placements)}</div>
        </article>`;
}

function renderTestimonialSlide(t) {
  return `          <div class="text-center testimonial-content">
            <i class="fa-solid fa-quote-left icon mb-4 d-inline-block"></i>
            <p class="text-white mb-4">${escapeHtml((t.quote || "").trim())}</p>
            <h5 class="testimonial-name">${escapeHtml(t.name)}</h5>
            <div class="testimonial-placements mb-4">${renderTestimonialBadges(t.placements)}</div>
          </div>`;
}

// --- Blog helpers -------------------------------------------------------
// Date comes as MM/DD/YYYY in blogs.json.
function parseBlogDate(str) {
  if (!str) return 0;
  if (str.includes("/")) {
    const [m, d, y] = str.split("/").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return new Date(str).getTime();
}

function renderBlogCard(blog, opts) {
  const pageClass = opts && opts.pageNum ? ` ${opts.pageNum}` : "";
  const tagsHtml = (blog.tags || "").split(" ").filter(Boolean)
    .map(t => `<li>${escapeHtml(t)}</li>`).join("");
  return `        <a class="card is-raised wow fadeInLeft${pageClass}" href="${escapeAttr(blog.link)}">
          <img class="card-img-blog" src="${escapeAttr(blog.imglink)}" alt="">
          <div class="card-label">
            <div class="header">${escapeHtml(blog.name)}</div>
            <div class="subtitle">${escapeHtml(blog.subtitle || "")}</div>
            <div class="body">${escapeHtml(blog.description)}</div>
            <ul class="taglist">${tagsHtml}</ul>
            <div class="date">${escapeHtml(blog.date)}</div>
          </div>
        </a>`;
}

// --- Syllabus helpers ---------------------------------------------------
// The five syllabus tables on about/syllabus.html are pure data — no filtering,
// no lightbox, nothing a visitor interacts with — so unlike the gallery they are
// baked once here and never re-rendered client-side. Before this, all ~100 rows
// existed only after about/calendar.js fetched the CSVs, so the served HTML
// carried five empty <tbody>s: invisible to every crawler that doesn't run JS,
// which is all of them except Googlebot and Applebot.
//
// about/syllabus-*.csv stays the single source of truth. The <thead> stays
// hand-written in the HTML — its labels are display copy and deliberately don't
// always match the CSV header text — so only <tbody> is generated.

// CSV dates are M/D/YY, always this century. Returns an ISO date so the baked
// cell can carry a machine-readable <time>; returns null for anything that isn't
// a clean M/D/YY, in which case the cell falls back to plain text rather than
// emitting a wrong datetime.
function syllabusIsoDate(value) {
  const m = String(value == null ? "" : value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const month = Number(m[1]), day = Number(m[2]), year = 2000 + Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return dt.toISOString().slice(0, 10);
}

// One <tr>, mirroring what about/calendar.js builds at runtime: the Week cell is
// a row header, the rest are data cells. Short rows are padded to the <thead>'s
// column count so the table can never render ragged. One row per line keeps the
// git diff to a single changed line per changed week.
// Dates are PLAIN TEXT, deliberately. A <time datetime> wrapper looks more
// machine-readable but is worse: `time` is on trafilatura's drop-with-children
// list (so are `svg`, `figure`, `canvas`), and trafilatura is the extractor behind
// FineWeb/RefinedWeb — the wrapper deleted every date from the text LLMs train on,
// which is the audience this baking exists for.
function renderSyllabusRow(cells, colCount) {
  const out = [];
  for (let i = 0; i < colCount; i++) {
    const raw = cells[i] != null ? String(cells[i]).trim() : "";
    out.push(i === 0
      ? `<th scope="row">${escapeHtml(raw)}</th>`
      : `<td>${escapeHtml(raw)}</td>`);
  }
  return `                                <tr>${out.join("")}</tr>`;
}

// Count the <th scope="col"> cells in one table's <thead>, so a CSV that grows or
// loses a column fails the build instead of silently rendering a broken grid.
function syllabusHeadCols(html, tableId) {
  const re = new RegExp(`<table[^>]*id="${tableId}"[\\s\\S]*?<\\/thead>`);
  const m = html.match(re);
  if (!m) throw new Error(`No <table id="${tableId}"> with a <thead> in about/syllabus.html`);
  return (m[0].match(/<th\b/g) || []).length;
}

// Discover semesters from the CSVs themselves: syllabus-s7s2.csv drives marker
// and table id `syllabus-s7s2`. Adding a semester is then "add the CSV, add the
// table markup"; forgetting the second half throws rather than silently
// shipping an empty table for the semester currently on sale.
function syllabusSources() {
  return fs.readdirSync(path.join(ROOT, "about"))
    .map(f => f.match(/^syllabus-(s(\d+)s(\d+))\.csv$/i))
    .filter(Boolean)
    // Newest first, numerically — a string sort would put s10s1 before s5s2.
    .sort((a, b) => Number(b[2]) - Number(a[2]) || Number(b[3]) - Number(a[3]))
    .map(m => ({ file: m[0], id: m[1] }));
}

// --- Syllabus JSON-LD ---------------------------------------------------
// Generated from the same CSVs as the tables, so the structured data and the
// visible page can never disagree.
//
// Be clear about what this is for: it buys no Google rich result — course-info
// structured data was retired in Sept 2025, and the surviving course-list
// carousel wants three separately-URL'd courses. It is here for answer engines,
// as a compact unambiguous statement of what the course is, when each semester
// ran, and what the current one covers.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "s7s2" -> "Season 7 Semester 2". The ids are the only place these numbers
// live, so the label is derived rather than duplicated in a lookup table.
function syllabusLabel(id) {
  const m = String(id).match(/^s(\d+)s(\d+)$/i);
  return m ? `Season ${m[1]} Semester ${m[2]}` : id;
}

function buildSyllabusJsonLd(semesters) {
  const instances = semesters.map(sem => {
    const start = sem.dates[0], end = sem.dates[sem.dates.length - 1];
    const years = start.slice(0, 4) === end.slice(0, 4)
      ? start.slice(0, 4)
      : `${start.slice(0, 4)}–${end.slice(0, 4)}`;
    return {
      "@type": "CourseInstance",
      name: `${syllabusLabel(sem.id)} (${years})`,
      courseMode: "Online",
      courseSchedule: {
        "@type": "Schedule",
        startDate: start,
        endDate: end,
        repeatFrequency: "P1W",
        // Every lecture falls on the same weekday; derive it from the first date
        // rather than hardcoding, so a future schedule change can't lie here.
        byDay: `https://schema.org/${WEEKDAYS[new Date(start + "T00:00:00Z").getUTCDay()]}`,
      },
    };
  });

  // Newest semester first — the sections describe the course as taught now.
  const current = semesters[0];
  const sections = current.rows.map(r => {
    // Everything after the topic column becomes the description, labelled with
    // its own <thead> wording so the JSON reads the way the table does.
    const detail = current.header
      .map((h, i) => (i <= current.dateIdx || i === current.topicIdx
        ? null
        : `${String(h).trim()}: ${String(r[i] || "").trim()}`))
      .filter(t => t && !/:\s*$/.test(t))
      .join(" · ");
    const section = {
      "@type": "Syllabus",
      position: Number(r[0]) || undefined,
      name: String(r[current.topicIdx] || "").trim(),
    };
    if (detail) section.description = detail;
    return section;
  }).filter(sec => sec.name);

  const doc = {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${SITE}/about/syllabus.html#course`,
    name: "Baology Prep USABO Course",
    url: `${SITE}/about/syllabus.html`,
    description:
      "A year-round, two-semester online biology course preparing high school students " +
      "for the USA Biology Olympiad (USABO), taught by past USABO finalists and IBO " +
      "medalists. Each semester runs 20 weekly lectures mapped to Campbell Biology chapters.",
    provider: { "@type": "Organization", name: "Baology Prep", url: `${SITE}/` },
    hasCourseInstance: instances,
    syllabusSections: sections,
  };
  return `    <script type="application/ld+json">\n` +
    JSON.stringify(doc, null, 2).split("\n").map(l => "    " + l).join("\n") +
    `\n    </script>`;
}

// --- Class types --------------------------------------------------------
// data/classes.yaml is the source of truth for what each weekly class IS, who
// teaches it, when it meets and which tiers include it. Before this the seven
// names appeared as bare <li> labels in the signup tiers and were defined
// nowhere on the site — so the Level 1 vs Level 2 choice, which costs the same
// either way, turned entirely on undefined terms.
const WEEK_FROM_SAT = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// The course week starts with Saturday's Main Lecture, so the list reads as a
// week rather than in whatever order the file happens to be in.
function sortClassesByWeek(classes) {
  return [...classes].sort((a, b) => WEEK_FROM_SAT.indexOf(a.day) - WEEK_FROM_SAT.indexOf(b.day));
}

// "20:00" -> "8:00pm ET / 5:00pm PT". Pacific is derived, never stored: both
// zones shift for DST together, so ET-3 holds year-round. Rendering the zone as
// ET (not EST) is likewise correct in both halves of the season.
function classTime(startEt) {
  const [h, m] = String(startEt).split(":").map(Number);
  const fmt = (x) => `${(x % 12) || 12}:${String(m).padStart(2, "0")}${x < 12 ? "am" : "pm"}`;
  return `${fmt(h)} ET / ${fmt((h + 21) % 24)} PT`;
}

function renderClassItem(c) {
  return [
    `              <li>`,
    `                <span class="tier-class-name">${escapeHtml(c.name)}</span>`,
    `                <span class="tier-class-meta">${escapeHtml(c.day)}s, ${escapeHtml(classTime(c.startEt))} · <a href="about.html#${escapeAttr(c.anchor)}">${escapeHtml(c.instructor)}</a></span>`,
    `                <span class="tier-class-desc">${escapeHtml(String(c.description).trim())}</span>`,
    `              </li>`,
  ].join("\n");
}

// Tier membership comes from each class's `levels`, so the cards and the class
// list can never disagree about what a tier includes.
function renderTier(classes, tier) {
  const inTier = tier === "full" ? classes : classes.filter(c => (c.levels || []).includes(tier));
  return sortClassesByWeek(inTier).map(renderClassItem).join("\n");
}

// --- Results chart ------------------------------------------------------
// data/results.csv is the single source of truth for every finalist/IBO count
// on the site. The chart, the totals row and the prose summary are all summed
// from it, and checkResultClaims() below fails the build if any page states a
// total that disagrees.
function resultsTotals(rows) {
  return rows.reduce((t, r) => ({
    finalists: t.finalists + Number(r[1] || 0),
    ibo: t.ibo + Number(r[2] || 0),
  }), { finalists: 0, ibo: 0 });
}

// One row: year, a nested bar with the finalist count printed beside it, and the
// IBO count. Bar widths are percentages of the best year, so the longest bar is
// always full-width and the shape stays readable at any container size.
function renderResultsRow(r, max) {
  const [year, fin, ibo] = [String(r[0]).trim(), Number(r[1]), Number(r[2])];
  const finPct = ((fin / max) * 100).toFixed(1);
  const iboPct = ((ibo / fin) * 100).toFixed(1);
  return `            <tr>` +
    `<th scope="row">${escapeHtml(year)}</th>` +
    `<td><span class="rc-cell"><span class="rc-track">` +
      `<span class="rc-fill" style="width:${finPct}%">` +
        `<span class="rc-ibo" style="width:${iboPct}%"></span>` +
      `</span></span>` +
      `<span class="rc-val">${fin}</span></span></td>` +
    `<td><span class="rc-val">${ibo}</span></td>` +
    `</tr>`;
}

function renderResultsChart(rows) {
  const t = resultsTotals(rows);
  const max = Math.max(...rows.map(r => Number(r[1])));
  const first = String(rows[0][0]).trim(), last = String(rows[rows.length - 1][0]).trim();
  // The caption repeats the totals in prose because jusText (Nemotron-CC's
  // extractor) discards tables as boilerplate but keeps the caption.
  const caption =
    `Baology Prep USA Biology Olympiad results by season, ${first} to ${last}. ` +
    `Across ${rows.length} seasons Baology students earned ${t.finalists} USABO National ` +
    `Finalist places, ${t.ibo} of which went on to represent Team USA at the ` +
    `International Biology Olympiad.`;
  return [
    `        <div class="rc-legend">`,
    `          <span class="rc-key"><span class="rc-swatch rc-swatch--finalist"></span>USABO National Finalists</span>`,
    `          <span class="rc-key"><span class="rc-swatch rc-swatch--ibo"></span>Team USA at the IBO (selected from the finalists)</span>`,
    `        </div>`,
    `        <table class="results-table">`,
    `          <caption>${escapeHtml(caption)}</caption>`,
    `          <thead>`,
    `            <tr><th scope="col">Season</th><th scope="col">USABO National Finalists</th><th scope="col">Team USA (IBO)</th></tr>`,
    `          </thead>`,
    `          <tbody>`,
    rows.map(r => renderResultsRow(r, max)).join("\n"),
    `          </tbody>`,
    `          <tfoot>`,
    `            <tr><th scope="row">Total, ${escapeHtml(first)}&ndash;${escapeHtml(last)}</th><td>${t.finalists}</td><td>${t.ibo}</td></tr>`,
    `          </tfoot>`,
    `        </table>`,
  ].join("\n");
}

// Every page that states a finalist/IBO total must match the CSV. This is the
// guard for the defect that started this: the site claimed 54 and 13 while the
// data said 52 and 12, in three places, two of them invisible <meta> tags.
function checkResultClaims(totals) {
  // Anchored deliberately tightly. A loose "(\\d+) ... finalist" also matches a
  // YEAR ("2019 USABO Finalist"), a rank ("Top 20 National Finalist") and the
  // size of the national field ("only 20 finalists") — all of which are correct
  // sentences that have nothing to do with our total. An aggregate claim always
  // puts the competition name immediately after the count.
  // (?<!\d) matters: without it, \d{1,3} happily matches "019" inside "2019".
  const FINALISTS = /(?<!\d)(\d{1,3})\s+(?:USABO|USA Biology Olympiad)[^.]{0,48}?[Ff]inalist/g;
  // Allows text between the count and "Team USA" ("12 of which went on to
  // represent Team USA" — the caption this build writes) but forbids a digit in
  // between, so "52 ... Finalist places, 12 of which ... Team USA" matches only
  // the 12. Without that, the flagship generated sentence went unguarded.
  const TEAM_USA = /(?<!\d)(\d{1,3})\s+[^.<0-9]{0,70}?Team USA/g;
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (/^(node_modules|\.git|plugins|deprecated)$/.test(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith(".html")) continue;
      const txt = fs.readFileSync(full, "utf8");
      const rel = path.relative(ROOT, full);
      const line = (i) => txt.slice(0, i).split("\n").length;
      for (const m of txt.matchAll(FINALISTS)) {
        if (Number(m[1]) !== totals.finalists) {
          bad.push(`${rel}:${line(m.index)}  claims ${m[1]} finalists, data/results.csv says ${totals.finalists}`);
        }
      }
      for (const m of txt.matchAll(TEAM_USA)) {
        if (Number(m[1]) !== totals.ibo) {
          bad.push(`${rel}:${line(m.index)}  claims ${m[1]} Team USA, data/results.csv says ${totals.ibo}`);
        }
      }
    }
  };
  walk(ROOT);
  if (bad.length) {
    throw new Error("results claim guard failed:\n  - " + bad.join("\n  - ") +
      "\n\nEvery count comes from data/results.csv. Update the CSV, not the copy.");
  }
  console.log(`Results claim guard OK — every stated total matches data/results.csv (${totals.finalists}/${totals.ibo})`);
}

// --- Sitemap ------------------------------------------------------------
// Regenerate sitemap.xml (+ image sitemap) so search/AI crawlers can discover
// every page and every gallery image. Output is fully deterministic — NO
// build-time timestamps — so the file only changes when the page list or the
// photos change. (lastmod is intentionally omitted; a per-build date would
// churn the file on every commit and wouldn't reflect real edits anyway.)
const SITE = "https://baology.org";

function getLastMod(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function buildSitemap(photos, blogs) {
  // Hand-maintained list of indexable top-level pages (excludes 404, the
  // header.html fragment, and unpublished sample blog files).
  const pages = [
    { url: "/", file: "index.html" },
    { url: "/about.html", file: "about.html" },
    { url: "/about/faq.html", file: "about/faq.html" },
    { url: "/about/syllabus.html", file: "about/syllabus.html" },
    { url: "/signup.html", file: "signup.html" },
    { url: "/demo/", file: "demo/index.html" },
    { url: "/explore.html", file: "explore.html" },
    { url: "/explore/testimonials.html", file: "explore/testimonials.html" },
    { url: "/blog-main.html", file: "blog-main.html" },
  ];
  // Published blog posts — only those linked from blogs.json. De-duplicated
  // and sorted so the order is stable across builds.
  const blogPages = [...new Set(blogs.map(b => "/" + String(b.link).replace(/^\/+/, "")))]
    .sort()
    .map((url) => ({ url, file: url.slice(1) }));

  const urls = [...pages, ...blogPages].map(({ url, file }) => {
    const lastmod = getLastMod(path.join(ROOT, file));
    const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
    return `  <url>\n    <loc>${escapeHtml(SITE + url)}</loc>${lastmodTag}\n  </url>`;
  });

  // The gallery page carries an <image:image> entry per photo. Sorted by src
  // so adding/editing a caption doesn't reorder the whole block.
  const imageEntries = [...photos]
    .sort((a, b) => (a.src < b.src ? -1 : a.src > b.src ? 1 : 0))
    .map(p => {
      const title = (p.location || "").trim();
      const caption = (p.description || p.alt || "").trim();
      return [
        `    <image:image>`,
        `      <image:loc>${escapeHtml(SITE + p.src)}</image:loc>`,
        title ? `      <image:title>${escapeHtml(title)}</image:title>` : null,
        caption ? `      <image:caption>${escapeHtml(caption)}</image:caption>` : null,
        `    </image:image>`,
      ].filter(Boolean).join("\n");
    })
    .join("\n");
  const galleryLastmod = getLastMod(path.join(ROOT, "explore/gallery.html"));
  const galleryLastmodTag = galleryLastmod ? `\n    <lastmod>${galleryLastmod}</lastmod>` : "";
  urls.push(`  <url>\n    <loc>${SITE}/explore/gallery.html</loc>${galleryLastmodTag}\n${imageEntries}\n  </url>`);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`,
    `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
    urls.join("\n"),
    `</urlset>`,
    ``,
  ].join("\n");
}

// --- Marker injection ---------------------------------------------------
function injectBetweenMarkers(html, name, content) {
  const open = `<!-- BUILD:${name} -->`;
  const close = `<!-- /BUILD:${name} -->`;
  const re = new RegExp(`${open.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[\\s\\S]*?${close.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`, "g");
  if (!re.test(html)) {
    throw new Error(`Marker pair not found: ${name}`);
  }
  re.lastIndex = 0;
  return html.replace(re, `${open}\n${content}\n        ${close}`);
}

// --- Static nav sync (header.html is the single source) -----------------
// Every page carries its nav as static, crawlable HTML; this keeps them all in
// sync with header.html on each build. Replaces either an inlined
// <header class="navigation…">…</header> block or a <div id="header"></div>
// placeholder, so a new page only needs one of those where the nav belongs.
function syncNav() {
  const nav = fs.readFileSync(path.join(ROOT, "header.html"), "utf8").trim();
  const navRe = /<header class="navigation[\s\S]*?<\/header>/;
  const placeholderRe = /<div id="header">\s*<\/div>/;
  const skipDirs = new Set([".git", "node_modules", "deprecated", "plugins"]);
  const skipFiles = new Set(["header.html", "footer.html"]);
  let count = 0;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(full);
        continue;
      }
      if (!entry.name.endsWith(".html")) continue;
      if (skipFiles.has(path.relative(ROOT, full))) continue;
      const html = fs.readFileSync(full, "utf8");
      let out = html;
      if (navRe.test(out)) out = out.replace(navRe, nav);
      else if (placeholderRe.test(out)) out = out.replace(placeholderRe, nav);
      if (out !== html) { fs.writeFileSync(full, out); count++; }
    }
  })(ROOT);
  console.log(`Synced static nav into ${count} page(s) from header.html`);
}

// --- Build ---------------------------------------------------------------
// Overlay dims (--scrim-lightbox / --scrim-modal) override vendor CSS by load
// order alone. A plugin upgrade can reintroduce a hardcoded dim or move it to a
// new, more specific selector, and nothing would notice until someone opened the
// lightbox on a phone. Fail the build instead.
//
// The fingerprint hashes the SET of vendor rules that paint a dim, not each rule
// individually — that is what catches a brand-new selector being added, which
// per-selector pinning would miss.
const SCRIM_VENDOR_FINGERPRINT = "e5732dbdb087";

function checkScrims() {
  const crypto = require("crypto");
  const vendorFiles = [
    "plugins/glightbox/glightbox.min.css",
    "plugins/bootstrap/bootstrap.min.css",
  ];
  // Matches innermost rules only, so @media-nested rules are captured too.
  // Note: a regex that consumes its leading delimiter skips every other rule in
  // a minified file. This form does not.
  const RULE = /([^{}]+)\{([^{}]*)\}/g;
  const found = [];
  for (const rel of vendorFiles) {
    const css = fs.readFileSync(path.join(ROOT, rel), "utf8");
    let m;
    RULE.lastIndex = 0;
    while ((m = RULE.exec(css)) !== null) {
      const sel = m[1].trim(), body = m[2].trim();
      if (!/goverlay|modal-backdrop/.test(sel)) continue;
      if (!/(^|;)\s*(background|background-color|opacity)\s*:/.test(";" + body)) continue;
      found.push(`${rel}|${sel}{${body}}`);
    }
  }
  const fp = crypto.createHash("sha256")
    .update(found.sort().join("\n")).digest("hex").slice(0, 12);

  const errors = [];
  if (fp !== SCRIM_VENDOR_FINGERPRINT) {
    errors.push(
      `vendor scrim rules changed (pinned ${SCRIM_VENDOR_FINGERPRINT}, found ${fp}).\n` +
      `  ${found.length} vendor rule(s) currently paint a dim:\n` +
      found.map((f) => "    " + f).join("\n")
    );
  }

  const site = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  const required = [
    [".goverlay", "--scrim-lightbox"],
    [".glightbox-mobile .goverlay", "--scrim-lightbox"],
    [".modal-backdrop", "--scrim-modal"],
    [".modal-backdrop.show", null],
  ];
  for (const [sel, token] of required) {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(^|,|\\})\\s*${esc}\\s*(,|\\{)`, "m").test(site)) {
      errors.push(`css/style.css has no override for \`${sel}\``);
    }
    if (token && !site.includes(`var(${token}`)) {
      errors.push(`css/style.css never references var(${token})`);
    }
  }
  for (const t of ["--scrim-lightbox", "--scrim-modal"]) {
    if (!new RegExp(`^\\s*${t}\\s*:`, "m").test(site)) {
      errors.push(`token ${t} is not defined in :root`);
    }
  }
  if (!/\.modal-backdrop\.show\s*\{[^}]*opacity\s*:\s*1\b/.test(site)) {
    errors.push("`.modal-backdrop.show { opacity: 1 }` is missing — Bootstrap's .5 would multiply --scrim-modal's alpha");
  }

  if (errors.length) {
    throw new Error(
      "scrim guard failed:\n  - " + errors.join("\n  - ") +
      "\n\nThe overlay dims are tokenized in css/style.css (:root --scrim-*).\n" +
      "Re-audit the vendor rules listed above, point the --scrim-* overrides at\n" +
      "them (matching or beating their specificity), then update\n" +
      "SCRIM_VENDOR_FINGERPRINT in scripts/build.js."
    );
  }
  console.log(`Scrim guard OK — vendor fingerprint ${fp}, ${found.length} vendor dim rule(s) overridden`);
}

function build() {
  checkScrims();
  require("./color-guard.js").checkColors();
  syncNav();
  const galleryCsv = fs.readFileSync(path.join(ROOT, "data/gallery.csv"), "utf8");
  const photos = parseCSV(galleryCsv)
    .sort((a, b) => dateSortKey(b.date) - dateSortKey(a.date));

  // Tag each photo with its aspect ratio (height/width) read from disk. Used
  // both for the data-aspect attribute on tiles and for the column-balanced
  // distribution below.
  photos.forEach((p) => {
    p.aspect = imageAspect(p.src);
  });

  const testimonialsYaml = fs.readFileSync(path.join(ROOT, "data/testimonials.yaml"), "utf8");
  const testimonials = yaml.load(testimonialsYaml, { schema: yaml.CORE_SCHEMA });

  // --- gallery.html ---------------------------------------------------
  // Greedy bin-pack: each photo (chronological order, newest first) goes into
  // the column with the smallest summed aspect ratio so far. Produces visually
  // balanced column heights, at the cost of some chronological mixing across
  // columns. Crawlers index every tile regardless of which column it lives in.
  const galleryHtmlPath = path.join(ROOT, "explore/gallery.html");
  let galleryHtml = fs.readFileSync(galleryHtmlPath, "utf8");
  const K = 3;
  const distributedCols = distributeBalanced(photos, K);
  const colTotals = distributedCols.map(col => col.reduce((s, p) => s + (p.aspect || 1), 0));
  const galleryTiles = distributedCols
    .map(col => {
      const tiles = col.map(p => renderGalleryTile(p, /*depth*/ 1)).join("\n");
      return `      <div class="gallery-col">\n${tiles}\n      </div>`;
    })
    .join("\n");
  const lightboxAnchors = photos.map(p => renderHiddenLightboxAnchor(p, /*depth*/ 1)).join("\n");
  galleryHtml = injectBetweenMarkers(galleryHtml, "gallery-grid", galleryTiles);
  galleryHtml = injectBetweenMarkers(galleryHtml, "gallery-lightbox-sources", lightboxAnchors);
  fs.writeFileSync(galleryHtmlPath, galleryHtml);
  console.log(`Wrote explore/gallery.html — ${photos.length} tiles (col heights: ${colTotals.map(t => t.toFixed(2)).join(", ")}) + ${photos.length} lightbox sources`);

  // --- testimonials.html ----------------------------------------------
  const testimonialsHtmlPath = path.join(ROOT, "explore/testimonials.html");
  let testimonialsHtml = fs.readFileSync(testimonialsHtmlPath, "utf8");
  const cards = sortTestimonialsForGrid(testimonials).map(renderTestimonialCard).join("\n");
  testimonialsHtml = injectBetweenMarkers(testimonialsHtml, "testimonials-grid", cards);
  fs.writeFileSync(testimonialsHtmlPath, testimonialsHtml);
  console.log(`Wrote explore/testimonials.html — ${testimonials.length} cards`);

  // --- blogs ----------------------------------------------------------
  const blogsJsonPath = path.join(ROOT, "blogs/blogs.json");
  const blogs = JSON.parse(fs.readFileSync(blogsJsonPath, "utf8"))
    .sort((a, b) => parseBlogDate(b.date) - parseBlogDate(a.date));

  // --- explore.html ---------------------------------------------------
  const exploreHtmlPath = path.join(ROOT, "explore.html");
  let exploreHtml = fs.readFileSync(exploreHtmlPath, "utf8");
  const slides = sortTestimonialsForCarousel(testimonials).map(renderTestimonialSlide).join("\n");
  exploreHtml = injectBetweenMarkers(exploreHtml, "testimonials-carousel", slides);
  const recentBlogs = blogs.slice(0, 3).map(b => renderBlogCard(b)).join("\n");
  exploreHtml = injectBetweenMarkers(exploreHtml, "recent-blogs", recentBlogs);
  fs.writeFileSync(exploreHtmlPath, exploreHtml);
  console.log(`Wrote explore.html — ${sortTestimonialsForCarousel(testimonials).length} carousel slides + 3 recent blogs`);

  // --- blog-main.html -------------------------------------------------
  const blogMainPath = path.join(ROOT, "blog-main.html");
  let blogMainHtml = fs.readFileSync(blogMainPath, "utf8");
  const blogCards = blogs.map((b, i) => renderBlogCard(b, { pageNum: Math.floor(i / 6) + 1 })).join("\n");
  blogMainHtml = injectBetweenMarkers(blogMainHtml, "blog-cards", blogCards);
  fs.writeFileSync(blogMainPath, blogMainHtml);
  console.log(`Wrote blog-main.html — ${blogs.length} blog cards`);

  // --- about/syllabus.html --------------------------------------------
  const syllabusPath = path.join(ROOT, "about/syllabus.html");
  let syllabusHtml = fs.readFileSync(syllabusPath, "utf8");
  const semesters = syllabusSources();
  if (!semesters.length) throw new Error("No about/syllabus-sNsM.csv files found");

  let syllabusRowCount = 0;
  const semesterData = [];
  for (const sem of semesters) {
    const marker = `syllabus-${sem.id}`;
    const grid = parseCSVGrid(fs.readFileSync(path.join(ROOT, "about", sem.file), "utf8"));
    const header = grid.shift() || [];
    const colCount = syllabusHeadCols(syllabusHtml, marker);
    if (header.length !== colCount) {
      throw new Error(
        `about/${sem.file} has ${header.length} columns but <table id="${marker}"> ` +
        `declares ${colCount} <th>. Update the <thead> and the CSV together.`
      );
    }
    // Which column holds the date, so only that cell gets a <time datetime>.
    const dateIdx = header.findIndex(h => /date/i.test(h));
    const rows = grid.map(r => renderSyllabusRow(r, colCount)).join("\n");
    syllabusHtml = injectBetweenMarkers(syllabusHtml, marker, rows);
    syllabusRowCount += grid.length;

    const dates = grid.map(r => syllabusIsoDate(r[dateIdx])).filter(Boolean).sort();
    if (dates.length !== grid.length) {
      throw new Error(`about/${sem.file} has ${grid.length - dates.length} row(s) whose Date is not M/D/YY`);
    }
    semesterData.push({
      id: sem.id, header, rows: grid, dates, dateIdx,
      topicIdx: header.findIndex(h => /lecture topic/i.test(h)),
    });
  }

  syllabusHtml = injectBetweenMarkers(syllabusHtml, "syllabus-jsonld", buildSyllabusJsonLd(semesterData));

  // A table with no marker pair would silently ship an empty <tbody> — exactly the
  // bug this whole section exists to fix, and check:generated would not catch it
  // because the output would still be deterministic. Fail loudly instead.
  const declaredTables = [...syllabusHtml.matchAll(/<table[^>]*id="(syllabus-[a-z0-9]+)"/gi)].map(m => m[1]);
  const bakedTables = new Set(semesters.map(sem => `syllabus-${sem.id}`));
  const unbaked = declaredTables.filter(id => !bakedTables.has(id));
  if (unbaked.length) {
    throw new Error(
      `about/syllabus.html declares table(s) with no baked rows: ${unbaked.join(", ")}. ` +
      `Each needs a matching about/syllabus-<id>.csv and a <!-- BUILD:<id> --> marker pair.`
    );
  }

  fs.writeFileSync(syllabusPath, syllabusHtml);
  console.log(`Wrote about/syllabus.html — ${semesters.length} syllabus table(s), ${syllabusRowCount} rows, JSON-LD for ${semesterData[0].rows.length} current-semester sections`);

  // --- signup.html tier class lists ------------------------------------
  const classes = yaml.load(fs.readFileSync(path.join(ROOT, "data/classes.yaml"), "utf8"), { schema: yaml.CORE_SCHEMA });
  if (!Array.isArray(classes) || !classes.length) throw new Error("data/classes.yaml has no entries");
  const signupPath = path.join(ROOT, "signup.html");
  let signupHtml = fs.readFileSync(signupPath, "utf8");
  for (const tier of [1, 2, "full"]) {
    signupHtml = injectBetweenMarkers(signupHtml, `tier-${tier}`, renderTier(classes, tier));
  }
  fs.writeFileSync(signupPath, signupHtml);
  console.log(`Wrote signup.html — ${classes.length} class types across 3 tiers`);

  // --- index.html results chart ---------------------------------------
  const resultsCsv = path.join(ROOT, "data/results.csv");
  if (!fs.existsSync(resultsCsv)) {
    throw new Error("data/results.csv is missing — it is the source of truth for every " +
      "finalist/IBO count on the site. Restore it (it is tracked in git) and rebuild.");
  }
  const resultRows = parseCSVGrid(fs.readFileSync(resultsCsv, "utf8")).slice(1);
  if (!resultRows.length) throw new Error("data/results.csv has no data rows");
  const resultTotals = resultsTotals(resultRows);
  const indexPath = path.join(ROOT, "index.html");
  let indexHtml = fs.readFileSync(indexPath, "utf8");
  indexHtml = injectBetweenMarkers(indexHtml, "results-chart", renderResultsChart(resultRows));
  fs.writeFileSync(indexPath, indexHtml);
  console.log(`Wrote index.html — results chart, ${resultRows.length} seasons (${resultTotals.finalists} finalists, ${resultTotals.ibo} IBO)`);
  checkResultClaims(resultTotals);

  // --- sitemap.xml ----------------------------------------------------
  const sitemapPath = path.join(ROOT, "sitemap.xml");
  const sitemap = buildSitemap(photos, blogs);
  fs.writeFileSync(sitemapPath, sitemap);
  const urlCount = (sitemap.match(/<loc>/g) || []).length;
  console.log(`Wrote sitemap.xml — ${urlCount} URLs, ${photos.length} gallery images indexed`);
}

build();
