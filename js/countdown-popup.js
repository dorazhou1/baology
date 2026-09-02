// Course countdown popup. Shows once per visitor on the homepage,
// counts down to SITE_CONFIG.courseStartIso, then switches to a
// "course has started" message that keeps the same links.
//
// Uses Bootstrap 4's jQuery modal API ($.fn.modal) since that's what
// the site loads. BS4 dispatches modal events as jQuery events, so
// listeners must be attached with $(...).on(), not addEventListener.

(function ($) {
  // The dismissal flag is namespaced by courseStartIso so each new course date
  // gets its own key. Without this, a visitor who dismissed the popup for a
  // previous course would never see the next one — the flag would still be set
  // from months earlier. Changing courseStartIso is all it takes to re-show.
  var STORAGE_KEY_PREFIX = "countdownPopupDismissed";
  var SHOW_DELAY_MS = 1500;

  // Retire the popup once the course is well underway. Past this window the
  // countdown has nothing left to count and the "it's not too late" pitch goes
  // stale, so the popup stops opening entirely rather than greeting visitors
  // with a months-old announcement. Bump this to keep it up longer.
  var HIDE_AFTER_START_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  $(function () {
    if (typeof SITE_CONFIG === "undefined" || !SITE_CONFIG.courseStartIso) return;
    if (!$.fn || !$.fn.modal) return;

    var storageKey = STORAGE_KEY_PREFIX + ":" + SITE_CONFIG.courseStartIso;
    try {
      if (localStorage.getItem(storageKey) === "1") return;
      // One-time cleanup of the pre-namespacing key so it doesn't linger.
      localStorage.removeItem(STORAGE_KEY_PREFIX);
    } catch (_) { /* localStorage may be unavailable; show anyway */ }

    var $modal = $("#courseCountdownModal");
    if (!$modal.length) return;
    var modalEl = $modal[0];

    var startMs = new Date(SITE_CONFIG.courseStartIso).getTime();
    if (isNaN(startMs)) return;
    if (Date.now() > startMs + HIDE_AFTER_START_MS) return;

    var els = {
      preTitle:  modalEl.querySelector("[data-countdown-pre-title]"),
      postTitle: modalEl.querySelector("[data-countdown-post-title]"),
      timer:     modalEl.querySelector("[data-countdown-timer]"),
      message:   modalEl.querySelector("[data-countdown-message]"),
      days:      modalEl.querySelector('[data-cd="days"]'),
      hours:     modalEl.querySelector('[data-cd="hours"]'),
      minutes:   modalEl.querySelector('[data-cd="minutes"]'),
      seconds:   modalEl.querySelector('[data-cd="seconds"]')
    };

    var intervalId = null;
    var hasSwitchedToPostStart = false;

    function pad(n) { return n < 10 ? "0" + n : "" + n; }

    function tick() {
      var diff = startMs - Date.now();
      if (diff > 0) {
        var s = Math.floor(diff / 1000);
        var d = Math.floor(s / 86400); s -= d * 86400;
        var h = Math.floor(s / 3600);  s -= h * 3600;
        var m = Math.floor(s / 60);    s -= m * 60;
        els.days.textContent    = d;
        els.hours.textContent   = pad(h);
        els.minutes.textContent = pad(m);
        els.seconds.textContent = pad(s);
      } else if (!hasSwitchedToPostStart) {
        hasSwitchedToPostStart = true;
        if (els.preTitle)  els.preTitle.classList.add("d-none");
        if (els.timer)     els.timer.classList.add("d-none");
        if (els.postTitle) els.postTitle.classList.remove("d-none");
        if (els.message) {
          els.message.textContent = "It's not too late! Sign up or watch the recording below.";
        }
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
      }
    }

    $modal.on("shown.bs.modal", function () {
      tick();
      if (!intervalId && Date.now() < startMs) {
        intervalId = setInterval(tick, 1000);
      }
    });

    $modal.on("hidden.bs.modal", function () {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      try { localStorage.setItem(storageKey, "1"); } catch (_) {}
    });

    setTimeout(function () { $modal.modal("show"); }, SHOW_DELAY_MS);
  });
})(jQuery);
