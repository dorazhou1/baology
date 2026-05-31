(function () {
  initTestimonialsCarousel();
  initGalleryPreview();
  initRecentBlogs();
})();

function initTestimonialsCarousel() {
  const slider = document.querySelector("[data-testimonial-slider]");
  if (!slider) return;

  const slickOpts = {
    dots: true,
    infinite: true,
    autoplay: true,
    autoplaySpeed: 5000,
    pauseOnHover: true,
    speed: 700,
    slidesToShow: 1,
    arrows: true,
    prevArrow: '<button class="slick-prev" aria-label="Previous" type="button">Previous</button>',
    nextArrow: '<button class="slick-next" aria-label="Next" type="button">Next</button>'
  };

  // Pre-rendered slides (from scripts/build.js) are present in the DOM. If so,
  // just enhance with slick — no fetch, no DOM build, no flash. This is what
  // crawlers index and what users see immediately.
  if (slider.children.length > 0) {
    jQuery(slider).slick(slickOpts);
    return;
  }

  // Fallback for when build script hasn't been run.
  fetch("data/testimonials.yaml")
    .then(res => res.text())
    .then(text => {
      const data = jsyaml.load(text);
      const featured = data.filter(t => t.featured);
      const pool = featured.length ? featured : [...data].sort((a, b) => b.year - a.year).slice(0, 5);

      pool.forEach(t => {
        const slide = document.createElement("div");
        slide.className = "text-center testimonial-content";
        slide.innerHTML = `
          <i class="fa-solid fa-quote-left icon mb-4 d-inline-block"></i>
          <p class="text-white mb-4">${escapeHtml((t.quote || '').trim())}</p>
          <h5 class="testimonial-name">${escapeHtml(t.name)}</h5>
          <div class="testimonial-placements mb-4">${renderTestimonialBadges(t.placements)}</div>
        `;
        slider.appendChild(slide);
      });

      jQuery(slider).slick(slickOpts);
    });
}

function initGalleryPreview() {
  const row = document.querySelector("[data-gallery-preview]");
  if (!row) return;

  fetch("data/gallery.csv")
    .then(res => res.text())
    .then(text => {
      const data = parseCSV(text);
      const shuffled = shuffle([...data]).slice(0, 6);
      shuffled.forEach(photo => {
        const desc = [formatGalleryDate(photo.date), photo.description].filter(Boolean).join(" · ");
        const slide = document.createElement("div");
        slide.className = "gallery-slide";
        slide.innerHTML = `
          <a class="gallery-tile" href="explore/gallery.html?photo=${encodeURIComponent(photo.src)}">
            <img src="${escapeAttr(resolveGallerySrc(photo.src))}" alt="${escapeAttr(photo.alt)}">
            <div class="gallery-tile-caption">
              <div class="loc">${escapeHtml(photo.location)}</div>
              <div class="desc">${escapeHtml(desc)}</div>
            </div>
          </a>
        `;
        row.appendChild(slide);
      });

      const $frame = jQuery(row).parent();
      jQuery(row).slick({
        arrows: true,
        dots: false,
        infinite: true,
        autoplay: true,
        // Gentle stepped autoplay (not a continuous marquee — that fought the
        // arrows and the hover). A short dwell plus a longer, eased slide reads
        // as smooth flow, while every rest lands on an aligned slide: arrows
        // advance one photo cleanly and hovering holds it steady.
        autoplaySpeed: 1400,
        speed: 700,
        cssEase: "ease-in-out",
        waitForAnimate: true,
        pauseOnHover: true,
        pauseOnFocus: true,
        draggable: true,
        swipeToSlide: true,
        slidesToShow: 3,
        slidesToScroll: 1,
        prevArrow: $frame.find('.gallery-arrow-prev'),
        nextArrow: $frame.find('.gallery-arrow-next'),
        responsive: [
          { breakpoint: 992, settings: { slidesToShow: 2 } },
          { breakpoint: 576, settings: { slidesToShow: 1 } }
        ]
      });
    });
}

function initRecentBlogs() {
  const container = document.querySelector("[data-blog-cards-container]");
  const template = document.querySelector("[data-blog-template]");
  if (!container || !template) return;

  // Pre-rendered cards already exist — nothing to do here (no interactive
  // behavior to attach on the explore landing page's recent-blogs section).
  if (container.children.length > 0) return;

  // Fallback for when build script hasn't been run.
  fetch("blogs/blogs.json")
    .then(res => res.json())
    .then(data => {
      const sorted = [...data].sort((a, b) => parseDate(b.date) - parseDate(a.date));
      sorted.slice(0, 3).forEach(blog => {
        const card = renderBlogCard(blog, template);
        container.appendChild(card);
      });
    });
}

// Minimal RFC-4180 CSV parser — mirrors the one in js/gallery.js. Handles
// quoted fields with embedded commas, newlines, and "" escapes.
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

// Translate the YAML's root-anchored `/images/...` into a path relative to
// this page (the site root), so it works under file:// as well as http://.
function resolveGallerySrc(src) {
  return typeof src === "string" && src.startsWith("/") ? src.slice(1) : src;
}

// Mirrors formatDate() in js/gallery.js — duplicated since the site has no bundler.
// Accepts year-only (2024), year-month (2024-06), or full ISO; skips bare ints that
// new Date() would otherwise interpret as Unix milliseconds. YYYY-MM[-DD] strings
// are constructed in LOCAL time to avoid the UTC-parse + local-display shift that
// rolls day-1 dates back into the previous month.
function formatGalleryDate(date) {
  if (date == null) return "";
  const str = String(date);
  if (/^\d{4}$/.test(str)) return str;
  const ymd = str.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (ymd) {
    const y = Number(ymd[1]), m = Number(ymd[2]), d = Number(ymd[3] || 1);
    const dt = new Date(y, m - 1, d);
    if (!isNaN(dt)) return dt.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  }
  const dt = new Date(str);
  if (!isNaN(dt)) return dt.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  return str;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseDate(str) {
  if (!str) return 0;
  if (str.includes("/")) {
    const [m, d, y] = str.split("/").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return new Date(str).getTime();
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// Placement-badge rendering shared with the testimonials page.
// Kept duplicated here rather than imported because the site has no bundler.
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

function placementMaxYear(p) {
  const y = p && p.year;
  if (Array.isArray(y) && y.length) return Math.max(...y.filter(n => typeof n === "number"));
  if (typeof y === "number") return y;
  return 0;
}

// Mirror of formatYear() in js/testimonials.js — duplicated since the site
// has no bundler. See that file for the cases this handles.
function formatYear(y) {
  if (typeof y === "number") return String(y);
  if (!Array.isArray(y) || y.length === 0) return String(y ?? "");
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
