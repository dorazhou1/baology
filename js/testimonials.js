(function () {
  const grid = document.querySelector("[data-testimonial-grid]");
  const template = document.querySelector("[data-testimonial-template]");
  if (!grid || !template) return;

  // Pre-rendered cards (from scripts/build.js) already exist in the DOM. Just
  // make sure WOW picks them up for scroll-fade. No fetch, no DOM build, no flash.
  if (grid.children.length > 0) {
    if (window.wow) window.wow.sync();
    return;
  }

  // Fallback for when build script hasn't been run. It needs js-yaml to read the
  // source data at all, so without the plugin there is nothing to build here and
  // no reason to fetch. (Bare `jsyaml` would be a ReferenceError.)
  if (!window.jsyaml) return;

  // The stagger for the cards built below. STEP and CAP have exactly ONE author,
  // scripts/build.js, which stamps them on this very grid as data-stagger-step /
  // data-stagger-cap for this file to read back — the same contract js/search.js
  // has with data-page-size — and hard-fails the build if the container that
  // carries them is gone. So they are READ here, never retyped: a second authored
  // copy is precisely what lets the baked cards and these fallback cards drift.
  //
  // build.js's .toFixed(2) comes along with the numbers, because the formatting is
  // part of the rule. Without it this file emitted `${Math.min(i * 0.08, 0.6)}s`,
  // which is the same number PRINTED differently: "0s" vs "0.00s" at i=0, "0.4s"
  // vs "0.40s" at i=5, "0.6s" vs "0.60s" from i=8 on. Trailing zeros, not binary
  // floating point — verified in V8, i * 0.08 is exact at every index this can
  // reach, and i=4 is 0.32, never 0.32000000000000004.
  //
  // No `|| 0.08` default: that default would BE the second copy. If the attributes
  // are missing the cards get no data-wow-delay and fade in unison, which is what
  // WOW does with no delay — visibly plainer, never a different stagger.
  const step = parseFloat(grid.dataset.staggerStep);
  const cap = parseFloat(grid.dataset.staggerCap);
  const staggered = Number.isFinite(step) && Number.isFinite(cap);
  const staggerDelay = (i) => `${Math.min((i || 0) * step, cap).toFixed(2)}s`;

  fetch("../data/testimonials.yaml")
    .then(res => res.text())
    .then(text => {
      const data = jsyaml.load(text);
      // Sort by most-recent year across placements, then by best placement rank.
      const sorted = [...data].sort((a, b) => {
        const ay = maxYear(a), by = maxYear(b);
        if (by !== ay) return by - ay;
        return maxRank(b) - maxRank(a);
      });

      sorted.forEach((t, i) => {
        const card = template.content.cloneNode(true).children[0];
        card.querySelector("[data-quote]").textContent = `“${(t.quote || '').trim()}”`;
        card.querySelector("[data-name]").textContent = t.name;
        const badgesEl = card.querySelector("[data-placements]");
        badgesEl.innerHTML = renderBadges(t.placements);
        if (staggered) card.setAttribute("data-wow-delay", staggerDelay(i));
        grid.appendChild(card);
      });
      if (window.wow) window.wow.sync();
    })
    .catch(err => console.error("testimonials.js: could not load testimonials.yaml", err));
})();

// A placement's year can be either a single number (2024) or a [start, end]
// tuple ([2021, 2023]). Normalize to the latest year that placement covers.
function placementMaxYear(p) {
  const y = p && p.year;
  if (Array.isArray(y) && y.length) return Math.max(...y.filter(n => typeof n === "number"));
  if (typeof y === "number") return y;
  return 0;
}

function maxYear(t) {
  const years = (t.placements || []).map(placementMaxYear).filter(Boolean);
  return years.length ? Math.max(...years) : 0;
}

// Format a year value as a human-readable string:
//   2024                           → "2024"
//   [2021, 2022, 2023]             → "2021–2023"        (contiguous run collapsed)
//   [2021, 2023]                   → "2021, 2023"       (non-contiguous, joined)
//   [2020, 2021, 2023]             → "2020–2021, 2023"  (mixed runs)
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

function maxRank(t) {
  const ranks = (t.placements || []).map(p => placementRank(p.medal));
  return ranks.length ? Math.max(...ranks) : 0;
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

function renderBadges(placements) {
  if (!Array.isArray(placements) || placements.length === 0) return "";
  // Sort badges: latest year first (using the upper bound of a range), then by rank.
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

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}
