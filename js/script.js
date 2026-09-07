
// WOW active. Exposed on window so dynamic re-renders (gallery filter, testimonials
// post-fetch) can call window.wow.sync() to re-scan for new `wow ...` elements.
// Guarded: blogs/ pages do not ship plugins/wow/wow.min.js, and an unguarded
// `new WOW()` throws a ReferenceError at top level, killing every feature below it.
if (typeof WOW === "function") {
  window.wow = new WOW();
  window.wow.init();
}

// Every entry point below feature-detects what it needs: a top-level throw stops the
// browser evaluating the rest of the file, so one missing plugin costs one feature.
// `window.jQuery`, not `jQuery`: the bare identifier is a ReferenceError when the
// library is not on the page.
(function ($) {
    'use strict';

    if (!$) return;

    // Sticky Menu. Queried once, not per scroll event, and not registered at all when
    // there is no bar: `.offset()` on an empty set is undefined, so `.offset().top`
    // throws on every wheel tick.
    var $nav = $('.navigation');
    if ($nav.length) {
        $(window).scroll(function () {
            $nav.toggleClass('nav-bg', $nav.offset().top > 100);
        });
    }

    // Background-images
    $('[data-background]').each(function () {
        $(this).css({
            'background-image': 'url(' + $(this).data('background') + ')'
        });
    });

    // background color
    $('[data-color]').each(function () {
        $(this).css({
            'background-color': $(this).data('color')
        });
    });

    // progress bar
    $('[data-progress]').each(function () {
        $(this).css({
            'bottom': $(this).data('progress')
        });
    });


    // testimonial-slider. Guarded on the PLUGIN so plugins/slick/slick.min.js (71KB,
    // render-blocking) can stay off the 19 pages with nothing for it to do: without the
    // check `$(...).slick` is undefined and the TypeError kills the code below.
    // `.testimonial-slider` matches zero elements today — explore.html's carousel is
    // [data-testimonial-slider], run by js/explore.js — so this is kept as the documented hook.
    var $sliders = $('.testimonial-slider');
    if ($sliders.length && typeof $.fn.slick === 'function') {
        $sliders.slick({
            dots: true,
            infinite: true,
            autoplay: true,
            autoplaySpeed: 10000,
            speed: 700,
            slidesToShow: 1,
            arrows: true,
            // adaptiveHeight: true
        });
    }


})(window.jQuery);

// Collapsible

var coll = document.getElementsByClassName("collapsible");
var i;
for (i = 0; i < coll.length; i++) {
  coll[i].addEventListener("click", function() {
    this.classList.toggle("active");
    // A .collapsible whose panel was removed (or that is the last child) has no
    // nextElementSibling; reading .style off null throws inside the handler.
    var content = this.nextElementSibling;
    if (!content) return;
    if (content.style.maxHeight){
      content.style.maxHeight = null;
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
    } 
  }); 
}


// Publish the fixed header's height as --header-h so CSS can offset anchor landings
// (html { scroll-padding-top }). Bootstrap owns the height and the lg breakpoint
// changes it, so measure rather than hardcode; re-measured on resize.
(function () {
  var header = document.querySelector(".navigation");
  if (!header) return;
  function publish() {
    document.documentElement.style.setProperty(
      "--header-h", header.getBoundingClientRect().height + "px");
  }
  publish();
  window.addEventListener("resize", publish);
})();
