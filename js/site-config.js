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
  officialAdUrl: "https://drive.google.com/file/d/1n_AfquzAWqFwgy2MmYMihsx1TEDwfunh/view?usp=sharing"
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
