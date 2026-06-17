// Demo player — sets the #demo-player YouTube iframe and builds the #demo-thumbs
// Week-1 strip from SITE_CONFIG.demoVideos / demoPlaylistId. No-ops on any page
// without the demo markup. Used by demo/index.html and explore.html.
// Requires js/site-config.js to be loaded first.
(function () {
  function initDemoPlayer() {
    var cfg = window.SITE_CONFIG || {};
    var vids = cfg.demoVideos || [];
    var listId = cfg.demoPlaylistId || "";
    var player = document.getElementById("demo-player");
    var strip = document.getElementById("demo-thumbs");
    if (!player || !vids.length) return;

    function srcFor(id, autoplay) {
      var u = "https://www.youtube.com/embed/" + id + "?rel=0";
      if (listId) u += "&list=" + encodeURIComponent(listId);
      return autoplay ? u + "&autoplay=1" : u;
    }

    function activate(i, autoplay) {
      player.src = srcFor(vids[i].id, autoplay);
      var btns = strip ? strip.querySelectorAll(".demo-thumb") : [];
      for (var j = 0; j < btns.length; j++) {
        btns[j].classList.toggle("is-active", j === i);
      }
    }

    // first video, no autoplay
    player.src = srcFor(vids[0].id, false);

    // build the thumbnail strip
    if (strip) {
      vids.forEach(function (v, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "demo-thumb" + (i === 0 ? " is-active" : "");
        b.title = v.title;
        b.innerHTML =
          '<img src="https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg" alt="" loading="lazy">' +
          '<span class="demo-thumb-label">' + (i + 1) + ". " + v.title + "</span>";
        b.addEventListener("click", function () { activate(i, true); });
        strip.appendChild(b);
      });
    }
  }

  if (document.readyState !== "loading") initDemoPlayer();
  else document.addEventListener("DOMContentLoaded", initDemoPlayer);
})();
