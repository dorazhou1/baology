function renderBlogCard(blog, templateEl) {
  const card = templateEl.content.cloneNode(true).children[0];
  card.querySelector("[data-header]").textContent = blog.name;
  card.querySelector("[data-subtitle]").textContent = blog.subtitle;
  card.querySelector("[data-body]").textContent = blog.description;
  card.querySelector("[data-date]").textContent = blog.date;
  card.querySelector("[data-img]").src = blog.imglink;
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
