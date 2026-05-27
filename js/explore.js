(function () {
  initTestimonialsCarousel();
  initGalleryPreview();
  initRecentBlogs();
})();

function initTestimonialsCarousel() {
  const slider = document.querySelector("[data-testimonial-slider]");
  if (!slider) return;

  fetch("data/testimonials.json")
    .then(res => res.json())
    .then(data => {
      const featured = data.filter(t => t.featured);
      const pool = featured.length ? featured : [...data].sort((a, b) => b.year - a.year).slice(0, 5);

      pool.forEach(t => {
        const slide = document.createElement("div");
        slide.className = "text-center testimonial-content";
        slide.innerHTML = `
          <i class="fa-solid fa-quote-left icon mb-4 d-inline-block"></i>
          <p class="text-white mb-4">${escapeHtml(t.quote)}</p>
          <h4 class="text-white">${escapeHtml(t.name)}</h4>
          <h6 class="text-secondary mb-4">${escapeHtml(t.placement)} · ${t.year}</h6>
        `;
        slider.appendChild(slide);
      });

      jQuery(slider).slick({
        dots: true,
        infinite: true,
        autoplay: true,
        autoplaySpeed: 5000,
        pauseOnHover: true,
        speed: 700,
        slidesToShow: 1,
        arrows: true,
        prevArrow: '<button class="slick-prev" aria-label="Previous" type="button">Previous</button>',
        nextArrow: '<button class="slick-next" aria-label="Next" type="button">Next</button>'
      });
    });
}

function initGalleryPreview() {
  const row = document.querySelector("[data-gallery-preview]");
  if (!row) return;

  fetch("data/gallery.json")
    .then(res => res.json())
    .then(data => {
      const shuffled = shuffle([...data]).slice(0, 6);
      shuffled.forEach(photo => {
        const slide = document.createElement("div");
        slide.className = "gallery-slide";
        slide.innerHTML = `
          <a class="gallery-tile" href="explore/gallery.html">
            <img src="${photo.src}" alt="${escapeAttr(photo.alt)}">
            <div class="gallery-tile-caption">
              <div class="loc">${escapeHtml(photo.location)}</div>
              <div class="desc">${escapeHtml(formatDate(photo.date))} · ${escapeHtml(photo.description)}</div>
            </div>
          </a>
        `;
        row.appendChild(slide);
      });

      const $frame = jQuery(row).parent();
      jQuery(row).slick({
        arrows: true,
        dots: false,
        infinite: true,
        autoplay: true,
        autoplaySpeed: 2500,
        speed: 400,
        waitForAnimate: false,
        pauseOnHover: true,
        draggable: true,
        swipeToSlide: true,
        slidesToShow: 4,
        slidesToScroll: 1,
        prevArrow: $frame.find('.gallery-arrow-prev'),
        nextArrow: $frame.find('.gallery-arrow-next'),
        responsive: [
          { breakpoint: 1100, settings: { slidesToShow: 3 } },
          { breakpoint: 768, settings: { slidesToShow: 2 } },
          { breakpoint: 480, settings: { slidesToShow: 1 } }
        ]
      });
    });
}

function initRecentBlogs() {
  const container = document.querySelector("[data-blog-cards-container]");
  const template = document.querySelector("[data-blog-template]");
  if (!container || !template) return;

  fetch("blogs/blogs.json")
    .then(res => res.json())
    .then(data => {
      const sorted = [...data].sort((a, b) => parseDate(b.date) - parseDate(a.date));
      sorted.slice(0, 3).forEach(blog => {
        const card = renderBlogCard(blog, template);
        container.appendChild(card);
      });
    });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseDate(str) {
  if (!str) return 0;
  if (str.includes("/")) {
    const [m, d, y] = str.split("/").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return new Date(str).getTime();
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
