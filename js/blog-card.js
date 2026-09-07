function renderBlogCard(blog, templateEl) {
  const card = templateEl.content.cloneNode(true).children[0];
  card.querySelector("[data-header]").textContent = blog.name;
  card.querySelector("[data-subtitle]").textContent = blog.subtitle;
  card.querySelector("[data-body]").textContent = blog.description;
  card.querySelector("[data-date]").textContent = blog.date;
  const img = card.querySelector("[data-img]");
  img.src = blog.imglink;
  // Setting only .src left the runtime-built card with NO alt attribute at all,
  // while the same card baked by scripts/build.js shipped alt="". An empty alt
  // is right for this thumbnail -- the card's header, subtitle, body and date
  // carry the meaning and the whole card is one link, so the image is decorative
  // -- but a MISSING alt is not. `blog.alt || ""` is the same expression
  // js/gallery.js already uses for its tiles, so an alt added to blogs.json is
  // honoured here without a second convention.
  img.alt = blog.alt || "";
  card.href = blog.link;

  const tagsEl = card.querySelector("[data-taglist]");
  if (tagsEl && blog.tags) {
    blog.tags.split(" ").filter(Boolean).forEach(tag => {
      const li = document.createElement("li");
      li.textContent = tag;
      tagsEl.appendChild(li);
    });
  }
  return card;
}
