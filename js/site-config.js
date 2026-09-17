// ─── Site-wide configuration ──────────────────────────────────────────────────
// Update links, emails and the Google Form here; do not hardcode them anywhere else.
// After replacing the Google Form, list the new entry IDs and match each against the
// question text around it in the fetched HTML:
//   curl -s "<FORM_VIEWFORM_URL>" | grep -o 'entry\.[0-9]*' | sort -u
// ─────────────────────────────────────────────────────────────────────────────

var SITE_CONFIG = {
  // Two addresses, same local part, different provider (gmail / yahoo). The applier
  // below sets only el.href, never textContent, so the VISIBLE address is a separate
  // literal in the markup — grep for it and change it too, or a reader copying by eye
  // sends the $1500-$2000 course fee to the old inbox.
  // paymentEmail is the Zelle course fee only (three places on signup.html); every
  // other "write to us" takes contactEmail.
  contactEmailHref: "mailto:kevinbaobiology@gmail.com",   // questions — the general contact
  contactEmail:     "kevinbaobiology@gmail.com",
  paymentEmailHref: "mailto:kevinbaobiology@yahoo.com",   // Zelle course fee ONLY
  paymentEmail:     "kevinbaobiology@yahoo.com",

  // Google Form
  formUrl:         "https://docs.google.com/forms/d/e/1FAIpQLSf8LeepZpT5VISiMeDuSRNR_GzDZc_9kD7PyrO-0RCjbOE0ng/viewform",
  formEmbedUrl:    "https://docs.google.com/forms/d/e/1FAIpQLSf8LeepZpT5VISiMeDuSRNR_GzDZc_9kD7PyrO-0RCjbOE0ng/viewform?embedded=true",
  // entry.701743111 is the live form's "Course Selection" question, and the option
  // strings below must match it byte-for-byte (note the DOUBLE space in each).
  // Re-run the discovery command above whenever formUrl changes.
  formEntryCourse: "entry.701743111",
  tierValues: {
    "1":    "Level 1  (6+ hours/week, $1500)",
    "2":    "Level 2  (6+ hours/week, $1500)",
    "full": "Full Package  (8+ hours/week, $2000)"
  },

  // Printable flyer linked from the Course Overview list on /signup.html; rotate it
  // each semester. Do NOT put it back in the homepage hero: its own CTA is a QR code
  // to baology.org/signup, it is a 5.7 MB image-only PDF that Google serves as
  // noindex/nofollow, and it links nowhere back to this site.
  officialAdUrl: "https://drive.google.com/file/d/1ImIsGj9RNFW5UnognMpXsPqJGhGfpbWg/view?usp=sharing",

  // Demo / free Week-1 preview (used by /demo)
  demoMoodleUrl:        "https://baology.moodlecloud.com/course/view.php?id=11",
  // Week-1 videos (unlisted YouTube playlist). /demo plays one at a time and builds a
  // thumbnail strip from this list — the /embed/videoseries?list= form throws
  // "Error 153" for unlisted playlists.
  demoPlaylistId: "PL20gi4tWxPdsKzv0kaNxOPEGSWX35MI8r",
  demoVideos: [
    { id: "ioJWFgKeKis", title: "Main Lecture" },
    { id: "xqXsfLzbUMI", title: "New Concepts" },
    { id: "LC_EDq0JP78", title: "Skill Building" },
    { id: "dAfsQ1iTw1o", title: "Lecture Primer" },
    { id: "TqalqCmT0x8", title: "Problem Solving" },
    { id: "CIFLPS6bGsM", title: "Case Study" },
    { id: "GmnPKZfmPiQ", title: "Homework Review" }
  ],

  // Season 7 Semester 2 first lecture (week 21), 4:00 PM Pacific — PDT, UTC-7, since
  // DST does not end until Nov 1. Drives the homepage countdown popup; changing it
  // re-shows that popup to everyone, including visitors who dismissed the last one.
  courseStartIso: "2026-09-19T16:00:00-07:00",

  // Info session recording (YouTube). Rotate each semester alongside officialAdUrl.
  infoSessionRecordingUrl: "https://youtu.be/i27Fl1RZlUs",
};

// Auto-apply config to any element with data-site-href or data-site-src.
// Usage in HTML:  <a data-site-href="formUrl">...</a>
//                 <iframe data-site-src="formEmbedUrl"></iframe>
// Only assigns when the value DIFFERS from what is already in the markup. scripts/build.js
// bakeSiteLinks() now bakes these same values in at build time, so the common case is that
// they already match — and for an <iframe> an unconditional write is not a no-op: it
// re-navigates the frame, fetching the embedded Google Form a second time on every load.
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("[data-site-href]").forEach(function (el) {
    var key = el.getAttribute("data-site-href");
    if (SITE_CONFIG[key] && el.getAttribute("href") !== SITE_CONFIG[key]) el.href = SITE_CONFIG[key];
  });
  document.querySelectorAll("[data-site-src]").forEach(function (el) {
    var key = el.getAttribute("data-site-src");
    if (SITE_CONFIG[key] && el.getAttribute("src") !== SITE_CONFIG[key]) el.src = SITE_CONFIG[key];
  });
});
