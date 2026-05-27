# Baology — Explore Section Spec

Brief for Claude Code. The goal: replace the current **Blog** nav tab with a new **Explore** tab that has a dropdown containing **Testimonials**, **Gallery**, and **Blog**, plus build an Explore landing page and new Testimonials/Gallery pages.

Blog is already built — don't touch it beyond moving its nav entry under Explore.

---

## 0. Before you start

- Inspect the existing **About** nav tab. Its dropdown is the pattern Explore should follow (desktop hover behavior, parent click → landing page, styling, transitions, etc.). Mirror it exactly so the nav feels consistent.
- Inspect the existing Blog page so the "Recent blogs" section on the Explore landing page can pull from the same data source / use the same card component.
- Match all styling (colors, fonts, spacing, shadows, border-radius scale) to the existing site. Don't introduce new design tokens.
- Routing: follow existing conventions in the codebase (whatever the current `/about`, `/blog` etc. setup does).

---

## 1. Nav changes

**Current state:** Blog is a top-level nav item.

**New state:** Replace Blog with a new top-level item called **Explore**. Explore has a dropdown with three sub-items:

1. Testimonials
2. Gallery
3. Blog

**Desktop behavior:** Copy the About tab exactly — hover opens dropdown, clicking the parent ("Explore") navigates to the Explore landing page.

**Mobile behavior:** Standard accordion. Tap "Explore" to expand and reveal the three sub-items. Tapping a sub-item navigates to that page. The user should still be able to reach the Explore landing page from mobile — figure out the cleanest pattern (e.g., a "Explore home" sub-item at the top of the accordion, or whatever About does on mobile if it has a landing page).

---

## 2. Explore landing page

A new page at whatever URL matches existing routing conventions (likely `/explore`).

### Section order (top to bottom)

1. **Intro** — heading + short tagline paragraph. Placeholder copy is fine (e.g., heading: "Meet the Baology community"; paragraph: ~1–2 sentences about students, achievements, and the experience). Flag the copy as placeholder so the owner can swap it.
2. **Testimonials carousel** — see details below.
3. **Gallery preview** — see details below.
4. **Recent blogs** — the 3 most recent blog posts, reusing the existing Blog page's card component.

Each of the three content sections should have a clear "View all" / "See more" link to the full page (Testimonials, Gallery, Blog respectively). Section headings should be present and consistent.

### Testimonials carousel

- Auto-rotates every ~5 seconds.
- Manual controls visible: prev/next arrows and dot indicators.
- Pause on hover (standard expected behavior).
- One testimonial visible at a time, or a tasteful "card with peek of next" — whatever fits the existing site's aesthetic. Use judgment.
- Pulls from the same testimonials data source as the Testimonials page (see §3).
- Pull the testimonials marked for the landing page if a `featured` flag exists; otherwise default to the newest N.

### Gallery preview

- Horizontal scrolling row of photos.
- **Random selection on each page load** (re-randomize server-side or on mount — fine either way).
- Use the same image data as the Gallery page.
- Each photo should still show the bottom-left caption on hover (same component as the Gallery page if possible — DRY).
- Clicking a photo can either open the lightbox (consistent with the Gallery page) or just navigate to the Gallery page. Pick whichever is cleaner; lightbox-consistent is preferred.

---

## 3. Testimonials page

### Layout

- 3-column grid of cards on desktop.
- Responsive: 2 columns on tablet, 1 column on mobile.
- Generous vertical spacing between rows; consistent card heights within a row.

### Card content

Each card shows three things, and only these three:

1. **Quote** (the testimonial body)
2. **Name** of the person
3. **Placement** — e.g. "2024 USABO Finalist", "2023 IBO Bronze Medal", "2022 USABO Semifinalist"

Keep the design clean. Don't add photos, schools, or other fields unless explicitly added to the data later.

### Sort

Newest year first. If two have the same year, the higher placement comes first (Gold > Silver > Bronze > Finalist > Semifinalist), but only as a tiebreaker.

### Data

Store testimonials in a JSON or YAML file in a sensible location in the repo (e.g., `data/testimonials.json` or `content/testimonials.yaml` — match codebase conventions). Schema suggestion:

```json
{
  "name": "Jane Doe",
  "quote": "Baology was the reason I made USABO Finals...",
  "year": 2024,
  "placement": "USABO Finalist",
  "featured": false
}
```

Seed with 4–6 placeholder entries so the layout is testable. Flag them as placeholders.

---

## 4. Gallery page

### Layout

- Collage-style grid. Masonry layout preferred (variable heights) if it fits the site's aesthetic; otherwise a clean equal-height grid is acceptable.
- Responsive: fewer columns on smaller screens.

### Hover behavior on each photo

- Slight scale up (e.g., `scale-105` or similar — subtle, not dramatic).
- Corners round slightly on hover.
- Caption fades in at the bottom-left of the image.
- Smooth transitions (~200–300ms).

### Caption content

Per photo: **Location + date + short description**. Example: "USABO Finals, Mt. Holyoke College · June 2024 · Day 1 lab practical".

### Click behavior

- Opens a **lightbox** with a larger view of the image and the full caption underneath/overlaid.
- Lightbox supports **prev/next navigation** through all photos currently visible (respecting any active filter).
- Keyboard support: left/right arrows for prev/next, Esc to close.
- Click outside the image (on the backdrop) closes the lightbox.

### Filtering

- Filter buttons by **year** (2024, 2023, 2022, etc.).
- An "All" option to clear filters.
- Year buttons should be derived from the data, not hardcoded — adding a new year to the data should automatically add a button.
- Active filter state should be visually clear.

### Data

JSON or YAML file. Schema suggestion:

```json
{
  "src": "/images/gallery/usabo-finals-2024-01.jpg",
  "alt": "Students working on the lab practical at USABO Finals",
  "location": "USABO Finals, Mt. Holyoke College",
  "date": "2024-06-15",
  "description": "Day 1 lab practical",
  "year": 2024
}
```

Year can be derived from the date or stored explicitly — pick one and be consistent. Seed with ~8–12 placeholder entries across at least 2–3 years so filtering is testable.

---

## 5. Acceptance criteria

Quick checklist to verify before handing off:

- [ ] Nav: Blog tab is gone; Explore tab exists with dropdown of Testimonials / Gallery / Blog
- [ ] Desktop nav behavior for Explore is indistinguishable from About
- [ ] Mobile nav: Explore is an accordion; sub-items are reachable; Explore landing page is reachable
- [ ] Explore landing page: intro → testimonials carousel → gallery preview → 3 recent blogs, in that order
- [ ] Testimonials carousel auto-rotates every ~5s and has working arrows + dots
- [ ] Gallery preview on landing shows different random photos on reload
- [ ] Testimonials page: 3-column responsive grid, cards show name + quote + placement only
- [ ] Testimonials sorted newest year first
- [ ] Gallery page: hover does subtle scale + rounded corners + bottom-left caption fade-in
- [ ] Gallery click opens lightbox with prev/next + keyboard support
- [ ] Gallery filter buttons by year work and are derived from data
- [ ] Both Testimonials and Gallery read from JSON/YAML data files (not hardcoded in components)
- [ ] All "View all" links from landing page work
- [ ] No regressions on existing Blog page

---

## 6. Out of scope (don't do these)

- Don't redesign the Blog page or change blog post styling.
- Don't add CMS integration. Flat data files are fine.
- Don't add testimonial photos, school/university fields, or any extra metadata to cards.
- Don't add gallery categories beyond the year filter.
- Don't change the existing About tab — only mirror its behavior for Explore.
