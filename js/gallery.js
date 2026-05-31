(function () {
  const grid = document.querySelector("[data-gallery-grid]");
  const filterBar = document.querySelector("[data-gallery-filter]");
  const template = document.querySelector("[data-gallery-tile-template]");
  if (!grid || !filterBar || !template) return;

  let lightbox = null;
  let activeFilter = "all";
  let allPhotos = [];
  let lastColumnCount = 0;

  // Capture aspect ratios from the pre-rendered tiles before any render() destroys
  // them. scripts/build.js stamps data-aspect with each image's real height/width.
  // If the build hasn't been run, the map is empty and distribution falls back
  // to treating every tile as square (≈ round-robin behavior).
  const aspectBySrc = new Map();
  grid.querySelectorAll(".gallery-tile--page").forEach(tile => {
    const href = tile.getAttribute("href");
    const a = parseFloat(tile.dataset.aspect);
    if (href && !isNaN(a)) aspectBySrc.set(href, a);
  });

  fetch("../data/gallery.csv")
    .then(res => res.text())
    .then(text => {
      const data = parseCSV(text);
      // Sort: dated photos newest-first, then unlabeled (no date) at the end.
      allPhotos = [...data].sort((a, b) => dateSortKey(b.date) - dateSortKey(a.date));
      allPhotos.forEach(p => {
        const a = aspectBySrc.get(resolveSrc(p.src));
        if (a && !isNaN(a)) p.aspect = a;
      });

      renderFilters(allPhotos);
      render();
      openDeepLink();
      window.addEventListener("resize", onResize);
    });

  function renderFilters(photos) {
    const years = [...new Set(photos.map(p => yearOf(p.date)).filter(y => y != null))].sort((a, b) => b - a);
    const hasUnlabeled = photos.some(p => yearOf(p.date) == null);
    const buttons = [
      { label: "All", value: "all" },
      ...years.map(y => ({ label: String(y), value: String(y) })),
      ...(hasUnlabeled ? [{ label: "Unlabeled", value: "unlabeled" }] : [])
    ];
    buttons.forEach(b => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add("filter-pill");
      btn.textContent = b.label;
      btn.dataset.year = b.value;
      if (b.value === activeFilter) btn.classList.add("is-active");
      btn.addEventListener("click", () => applyFilter(b.value));
      filterBar.appendChild(btn);
    });
  }

  // Rebuild the grid for the current filter and column count. Photos go through
  // a greedy bin-pack: each (chronological newest-first) lands in the column
  // with the smallest summed aspect ratio, producing visually balanced column
  // heights. The chronoIdx still points at the photo's position in the visible
  // chronological order so the lightbox can navigate by date even though the
  // tiles aren't laid out in that order.
  function render() {
    const visible = allPhotos.filter(p => matchesFilter(p, activeFilter));
    const K = currentColumnCount();
    lastColumnCount = K;
    grid.innerHTML = "";
    const buckets = distributeBalanced(visible, K);
    buckets.forEach((bucket, colIdx) => {
      const colEl = document.createElement("div");
      colEl.className = "gallery-col";
      grid.appendChild(colEl);
      bucket.forEach((p, rowIdx) => colEl.appendChild(buildTile(p, p._chronoIdx, colIdx, rowIdx)));
    });
    initLightbox(visible);
    if (window.wow) window.wow.sync();
  }

  // If the page was opened with ?photo=<src> (e.g. a click on a gallery-preview
  // tile on the landing page), scroll that tile into view and open its lightbox
  // slide so the visitor lands directly on the image they clicked.
  function openDeepLink() {
    const want = new URLSearchParams(window.location.search).get("photo");
    if (!want || !lightbox) return;
    const idx = allPhotos.findIndex(p => p.src === want);
    if (idx < 0) return;
    const tile = grid.querySelector('.gallery-tile--page[data-chrono-idx="' + idx + '"]');
    if (tile) tile.scrollIntoView({ behavior: "smooth", block: "center" });
    lightbox.openAt(idx);
  }

  // Mirrors scripts/build.js distributeBalanced (must stay in sync so the
  // pre-rendered layout and this client layout match — no flash on load).
  // Each photo lands in whichever column has the smallest summed aspect.
  // `photos` is newest-first; _chronoIdx records that order for lightbox
  // navigation. We pack OLDEST-first then reverse each column so the newest
  // still renders at the top — see build.js for why (keeps the committed HTML
  // diff small when a newer photo is appended).
  function distributeBalanced(photos, K) {
    photos.forEach((p, i) => { p._chronoIdx = i; });
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

  function buildTile(p, chronoIdx, colIdx, rowIdx) {
    const tile = template.content.cloneNode(true).children[0];
    const src = resolveSrc(p.src);
    tile.href = src;
    // Stagger the scroll-fade diagonally: same-row tiles (same rowIdx, different
    // column) get different delays so they don't bubble up in lockstep. Cycled
    // mod 5 and kept small (≤0.32s) so no tile stays hidden long as it scrolls in.
    const delay = (((rowIdx || 0) + (colIdx || 0)) % 5) * 0.08;
    tile.dataset.wowDelay = delay.toFixed(2) + "s";
    // Records this photo's position in the chronological (newest-first) order
    // so a click can open the lightbox at the right slide regardless of where
    // the tile ended up in the visual layout.
    tile.dataset.chronoIdx = String(chronoIdx);
    if (p.aspect) tile.dataset.aspect = String(p.aspect.toFixed(4));
    const y = yearOf(p.date);
    tile.dataset.year = y != null ? String(y) : "unlabeled";
    const img = tile.querySelector("img");
    img.src = src;
    img.alt = p.alt || "";
    tile.querySelector(".loc").textContent = p.location || "";
    tile.querySelector(".desc").textContent = captionLine(p);
    return tile;
  }

  function matchesFilter(p, filter) {
    if (filter === "all") return true;
    const y = yearOf(p.date);
    if (filter === "unlabeled") return y == null;
    return String(y) === filter;
  }

  // rAF-debounced resize: only rerun when the breakpoint actually changes the
  // column count. Avoids re-rendering on every pixel of width change.
  let resizePending = false;
  function onResize() {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      if (currentColumnCount() !== lastColumnCount) render();
    });
  }

  // Mirrors the .gallery-grid breakpoints in css/style.css.
  // ≤575px → 1 col; 576–991px → 2 cols; ≥992px → 3 cols.
  function currentColumnCount() {
    if (window.matchMedia("(max-width: 575px)").matches) return 1;
    if (window.matchMedia("(max-width: 991px)").matches) return 2;
    return 3;
  }

  // Translate the YAML/CSV's root-anchored `/images/...` into a path relative
  // to this page (one level deep), so it works under file:// as well as http://.
  function resolveSrc(src) {
    return typeof src === "string" && src.startsWith("/") ? ".." + src : src;
  }

  function captionLine(p) {
    // "{formatted date} · {description}" — omit the date prefix if missing.
    return [formatDate(p.date), p.description].filter(Boolean).join(" · ");
  }

  function applyFilter(year) {
    activeFilter = year;
    filterBar.querySelectorAll("button").forEach(b => {
      b.classList.toggle("is-active", b.dataset.year === year);
    });
    // 250ms crossfade: hide the grid via opacity, swap the tiles, fade back in.
    // Timing matches `.gallery-grid` transition in css/style.css.
    grid.classList.add("is-swapping");
    setTimeout(() => {
      render();
      grid.classList.remove("is-swapping");
    }, 250);
  }

  // Wire GLightbox by rendering a hidden, chronologically-ordered list of
  // anchor sources. The visible grid is column-major (for the masonry layout),
  // so its anchors don't carry the GLightbox class; instead each visible tile's
  // click forwards to the matching hidden anchor, and GLightbox navigates
  // through the hidden anchors in date order.
  function initLightbox(chronoOrder) {
    // The pre-rendered hidden source container survives between filter
    // re-renders. Look for it first; only fall back to creating a new one if
    // the page didn't ship with one.
    let hiddenGrid = document.querySelector("[data-gallery-hidden-source]");
    if (!hiddenGrid) {
      hiddenGrid = document.createElement("div");
      hiddenGrid.setAttribute("data-gallery-hidden-source", "");
      hiddenGrid.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;";
      document.body.appendChild(hiddenGrid);
    }
    hiddenGrid.innerHTML = "";
    chronoOrder.forEach(p => {
      const a = document.createElement("a");
      a.className = "gallery-lightbox-source";
      a.href = resolveSrc(p.src);
      a.setAttribute("data-glightbox", `title: ${p.location || ''}; description: ${captionLine(p)}`);
      hiddenGrid.appendChild(a);
    });

    if (lightbox) lightbox.destroy();
    lightbox = GLightbox({
      selector: ".gallery-lightbox-source",
      touchNavigation: true,
      loop: true,
      keyboardNavigation: true,
      closeOnOutsideClick: true
    });

    // Forward clicks from each visible tile to the matching hidden anchor.
    grid.querySelectorAll(".gallery-tile--page").forEach(tile => {
      tile.addEventListener("click", e => {
        e.preventDefault();
        const i = Number(tile.dataset.chronoIdx);
        const target = hiddenGrid.children[i];
        if (target) target.click();
      });
    });
  }

  // Minimal CSV parser — RFC-4180-ish. Handles quoted fields with embedded
  // commas, newlines, and "" escapes. Returns array of objects keyed by header row.
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

  // Extract the year (integer) from a date that may be a number or string in
  // YYYY, YYYY-MM, or YYYY-MM-DD form. Returns null if none of those.
  function yearOf(date) {
    if (date == null || date === "") return null;
    const str = String(date);
    const match = str.match(/^(\d{4})/);
    return match ? Number(match[1]) : null;
  }

  // Format a date for caption display, respecting the precision in the source.
  //   2024           → "2024"
  //   2024-06        → "Jun 2024"
  //   2024-06-15     → "Jun 2024"  (day not shown in caption)
  //   missing / NaN  → ""
  function formatDate(date) {
    if (date == null || date === "") return "";
    const str = String(date);
    if (/^\d{4}$/.test(str)) return str;
    // Construct in LOCAL time. `new Date("YYYY-MM-DD")` parses as UTC, then
    // toLocaleDateString shifts it to local timezone, which silently rolls a
    // day-1 date back to the previous month (e.g. "2026-12-01" → "Nov 2026"
    // in any timezone west of UTC).
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

  // Sort key: convert any of the accepted date forms to a comparable timestamp.
  // Year-only and missing entries sort at the far end (oldest).
  function dateSortKey(date) {
    if (date == null || date === "") return -Infinity;
    const str = String(date);
    if (/^\d{4}$/.test(str)) return new Date(`${str}-01-01`).getTime();
    if (/^\d{4}-\d{2}$/.test(str)) return new Date(`${str}-01`).getTime();
    const d = new Date(str);
    return isNaN(d) ? -Infinity : d.getTime();
  }
})();
