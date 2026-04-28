// Course countdown popup. Shows once per visitor on the homepage,
// counts down to SITE_CONFIG.courseStartIso, then switches to a
// "course has started" message that keeps the same links.
//
// Uses Bootstrap 4's jQuery modal API ($.fn.modal) since that's what
// the site loads. BS4 dispatches modal events as jQuery events, so
// listeners must be attached with $(...).on(), not addEventListener.

(function ($) {
  var STORAGE_KEY = "countdownPopupDismissed";
  var SHOW_DELAY_MS = 1500;

  $(function () {
    if (typeof SITE_CONFIG === "undefined" || !SITE_CONFIG.courseStartIso) return;
    if (!$.fn || !$.fn.modal) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch (_) { /* localStorage may be unavailable; show anyway */ }

    var $modal = $("#courseCountdownModal");
    if (!$modal.length) return;
    var modalEl = $modal[0];

    var startMs = new Date(SITE_CONFIG.courseStartIso).getTime();
    if (isNaN(startMs)) return;

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
          els.message.textContent = "It's not too late — sign up or catch the recording below.";
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
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch (_) {}
    });

    setTimeout(function () { $modal.modal("show"); }, SHOW_DELAY_MS);
  });
})(jQuery);
