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
// and "" escapes. Returns array of objects keyed by the header row.
function parseCSV(text) {
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
  const header = rows.shift();
  return rows
    .filter(r => r.some(v => v !== ""))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] != null ? r[i] : ""])));
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

// --- Sitemap ------------------------------------------------------------
// Regenerate sitemap.xml (+ image sitemap) so search/AI crawlers can discover
// every page and every gallery image. Output is fully deterministic — NO
// build-time timestamps — so the file only changes when the page list or the
// photos change. (lastmod is intentionally omitted; a per-build date would
// churn the file on every commit and wouldn't reflect real edits anyway.)
const SITE = "https://baology.org";

function buildSitemap(photos, blogs) {
  // Hand-maintained list of indexable top-level pages (excludes 404, the
  // header.html fragment, and unpublished sample blog files).
  const pages = [
    "/",
    "/about.html",
    "/about/faq.html",
    "/about/syllabus.html",
    "/signup.html",
    "/explore.html",
    "/explore/testimonials.html",
    "/blog-main.html",
  ];
  // Published blog posts — only those linked from blogs.json. De-duplicated
  // and sorted so the order is stable across builds.
  const blogPages = [...new Set(blogs.map(b => "/" + String(b.link).replace(/^\/+/, "")))].sort();

  const urls = [...pages, ...blogPages].map(
    p => `  <url>\n    <loc>${escapeHtml(SITE + p)}</loc>\n  </url>`
  );

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
  urls.push(`  <url>\n    <loc>${SITE}/explore/gallery.html</loc>\n${imageEntries}\n  </url>`);

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

// --- Build ---------------------------------------------------------------
function build() {
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

  // --- sitemap.xml ----------------------------------------------------
  const sitemapPath = path.join(ROOT, "sitemap.xml");
  const sitemap = buildSitemap(photos, blogs);
  fs.writeFileSync(sitemapPath, sitemap);
  const urlCount = (sitemap.match(/<loc>/g) || []).length;
  console.log(`Wrote sitemap.xml — ${urlCount} URLs, ${photos.length} gallery images indexed`);
}

build();
