// Google Form pre-fill configuration
// To rediscover entry IDs after replacing the form, run:
//   curl -s "<FORM_URL>" | grep -o 'entry\.[0-9]*' | sort -u
// Then check which ID maps to the course selection question:
//   curl -s "<FORM_URL>" | python3 -c "
//   import sys, re; html = sys.stdin.read()
//   for e in ['<id1>','<id2>',...]:
//       idx = html.find('entry.'+e)
//       if idx != -1:
//           print(e, re.sub(r'<[^>]+>',' ',html[max(0,idx-400):idx+100])[-150:])
//   "
// Update FORM_BASE and TIER_VALUES below with the new values.

var FORM_BASE = "https://docs.google.com/forms/d/e/1FAIpQLScUolfD-mBgd_5usmLfpuUr6dcK5imKUAn2PmlaguLoEa8yqA/viewform?embedded=true";
var FORM_ENTRY_COURSE = "entry.701743111";
var TIER_VALUES = {
  "1":    "Level 1  (6+ hours/week, $1500)",
  "2":    "Level 2  (6+ hours/week, $1500)",
  "full": "Full Package  (8+ hours/week, $2000)"
};
