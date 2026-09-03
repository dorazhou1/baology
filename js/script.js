
// WOW active. Exposed on window so dynamic re-renders (e.g. gallery filter
// changes, testimonials post-fetch) can call window.wow.sync() to re-scan the
// DOM for newly-inserted `wow ...` elements.
window.wow = new WOW();
window.wow.init();

(function ($) {
    'use strict';



    // Sticky Menu
    $(window).scroll(function () {
        if ($('.navigation').offset().top > 100) {
            $('.navigation').addClass('nav-bg');
        } else {
            $('.navigation').removeClass('nav-bg');
        }
    });

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


    // testimonial-slider
    $('.testimonial-slider').slick({
        dots: true,
        infinite: true,
        autoplay: true,
        autoplaySpeed: 10000,
        speed: 700,
        slidesToShow: 1,
        arrows: true,
        // adaptiveHeight: true
    });


})(jQuery);

// Collapsible

var coll = document.getElementsByClassName("collapsible");
var i;
for (i = 0; i < coll.length; i++) {
  coll[i].addEventListener("click", function() {
    this.classList.toggle("active");
    var content = this.nextElementSibling;
    if (content.style.maxHeight){
      content.style.maxHeight = null;
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
    } 
  }); 
}


// Publish the fixed header's own height as --header-h so CSS can offset anchor
// landings by it (html { scroll-padding-top }). The bar is 72px at lg and up and
// 97px collapsed, and Bootstrap owns both, so measuring beats writing either
// number down. Re-measured on resize because the breakpoint flips it.
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
