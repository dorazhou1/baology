// ─── Site-wide configuration ──────────────────────────────────────────────────
// Update values here when links, emails, or the Google Form changes.
// Do not hardcode these URLs anywhere else in the codebase.
//
// After replacing the Google Form, re-run the discovery commands below to find
// the new entry IDs, then update formEntryCourse and tierValues:
//
//   curl -s "<FORM_VIEWFORM_URL>" | grep -o 'entry\.[0-9]*' | sort -u
//
//   curl -s "<FORM_VIEWFORM_URL>" | python3 -c "
//   import sys, re; html = sys.stdin.read()
//   for e in ['<id1>','<id2>',...]:
//       idx = html.find('entry.'+e)
//       if idx != -1:
//           print(e, re.sub(r'<[^>]+>',' ', html[max(0,idx-400):idx+100])[-150:])
//   "
// ─────────────────────────────────────────────────────────────────────────────

var SITE_CONFIG = {
  // Contact
  contactEmailHref: "mailto:kevinbaobiology@yahoo.com",
  contactEmail:     "kevinbaobiology@yahoo.com",

  // Google Form
  formUrl:         "https://docs.google.com/forms/d/e/1FAIpQLScUolfD-mBgd_5usmLfpuUr6dcK5imKUAn2PmlaguLoEa8yqA/viewform",
  formEmbedUrl:    "https://docs.google.com/forms/d/e/1FAIpQLScUolfD-mBgd_5usmLfpuUr6dcK5imKUAn2PmlaguLoEa8yqA/viewform?embedded=true",
  formEntryCourse: "entry.701743111",
  tierValues: {
    "1":    "Level 1  (6+ hours/week, $1500)",
    "2":    "Level 2  (6+ hours/week, $1500)",
    "full": "Full Package  (8+ hours/week, $2000)"
  },

  // Official advertisement (Google Drive)
  officialAdUrl: "https://drive.google.com/file/d/1n_AfquzAWqFwgy2MmYMihsx1TEDwfunh/view?usp=sharing",

  // Demo / free Week-1 preview (used by /demo)
  demoMoodleUrl:        "https://baology.moodlecloud.com/course/view.php?id=11",
  // Week-1 videos (unlisted YouTube playlist). The /demo page plays one at a time and
  // builds a thumbnail strip from this list — the /embed/videoseries?list= form throws
  // "Error 153" for unlisted playlists. Update this list when the Week-1 videos change.
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

  // Season 7 first main lecture: May 2, 2026 at 4:00 PM Pacific (PDT, UTC-7 in May)
  courseStartIso: "2026-05-02T16:00:00-07:00",

  // Recording of the April 27 info session (Zoom)
  infoSessionRecordingUrl: "https://us02web.zoom.us/rec/play/qVHwtO3SF_3lUnGw1zoTq9kDsxSU9zzq14Q8rpFyxj4CRMy0uD4Gg8T3Q3qTrJ5VA_vzbB_XP9M7HUOo.S6zh8BPgQteQVIKy?eagerLoadZvaPages=sidemenu.billing.plan_management&accessLevel=meeting&canPlayFromShare=true&from=share_recording_detail&startTime=1777334440000&oldStyle=true&pwd=DOfqMutw_8j2ld801QAAIAAAAE_2HP_la0hC830osH4hJv9uh448uiA1Vo8PnaWoLf6zcsN0k3jYpHj127OLSBI6sDAwMDAwNA"
};

// Auto-apply config to any element with data-site-href or data-site-src.
// Usage in HTML:  <a data-site-href="formUrl">...</a>
//                 <iframe data-site-src="formEmbedUrl"></iframe>
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("[data-site-href]").forEach(function (el) {
    var key = el.getAttribute("data-site-href");
    if (SITE_CONFIG[key]) el.href = SITE_CONFIG[key];
  });
  document.querySelectorAll("[data-site-src]").forEach(function (el) {
    var key = el.getAttribute("data-site-src");
    if (SITE_CONFIG[key]) el.src = SITE_CONFIG[key];
  });
});
