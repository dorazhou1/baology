
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
    var open = this.classList.toggle("active");
    // The +/- glyph was the ONLY open/closed signal, so a screen-reader user got none.
    // Only set it where the markup already declares it, so the syllabus accordions (which
    // do not) are not given a half-implemented ARIA contract.
    if (this.hasAttribute("aria-expanded")) this.setAttribute("aria-expanded", String(open));
    // A .collapsible whose panel was removed (or that is the last child) has no
    // nextElementSibling; reading .style off null throws inside the handler.
    //
    // about/faq.html wraps each button in <h2 class="faq-q"> — the WAI-ARIA disclosure
    // pattern, and it fixes a heading-order defect. (It does NOT help text extraction:
    // measured across 16 extractors, readability and friends delete the button subtree
    // and keep the wrapper empty. See the note in scripts/build.js renderFaq.) The wrap
    // moves the panel to the WRAPPER's next sibling; `|| this` keeps the four un-wrapped
    // accordions on about/syllabus.html working unchanged.
    var content = (this.closest(".faq-q") || this).nextElementSibling;
    if (!content) return;
    if (content.style.maxHeight){
      content.style.maxHeight = null;
      // Paired with the aria-expanded above: see the .content rule in css/style.css for why
      // max-height alone is not enough to make "collapsed" true.
      content.style.visibility = "hidden";
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
      content.style.visibility = "visible";
    } 
  }); 
}


// Publish the fixed header's height as --header-h so CSS can offset anchor landings
// (html { scroll-padding-top }). Bootstrap owns the height and the lg breakpoint
// changes it, so measure rather than hardcode; re-measured on resize.
(function () {
  var header = document.querySelector(".navigation");
  if (!header) return;
  var collapse = header.querySelector(".navbar-collapse");
  var toggler = header.querySelector(".navbar-toggler");
  function publish() {
    // NEVER PUBLISH WHILE THE BURGER DRAWER IS OPEN. `.navigation` then measures the whole open menu —
    // 657px on a phone, against a 97px bar — and Bootstrap's collapse-close fires no resize, so a
    // resize taken while it was open would stick. Every consumer of --header-h wants the BAR: it feeds
    // html { scroll-padding-top }, so a poisoned value pushes every anchor landing hundreds of px off.
    if (collapse && collapse.classList.contains("show")) return;
    document.documentElement.style.setProperty(
      "--header-h", header.getBoundingClientRect().height + "px");
  }
  publish();
  window.addEventListener("resize", publish);
  // Re-measure after the drawer finishes closing, which covers the one case the guard above skips:
  // a breakpoint crossed while it was open. 400ms clears Bootstrap's 350ms collapse transition.
  // A click listener rather than `hidden.bs.collapse` because that is a jQuery event, and this block
  // is deliberately plain-DOM so it survives jQuery not loading.
  if (toggler) {
    toggler.addEventListener("click", function () { setTimeout(publish, 400); });
  }
})();
