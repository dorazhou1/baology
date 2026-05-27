(function () {
  const grid = document.querySelector("[data-testimonial-grid]");
  const template = document.querySelector("[data-testimonial-template]");
  if (!grid || !template) return;

  fetch("../data/testimonials.json")
    .then(res => res.json())
    .then(data => {
      const sorted = [...data].sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return placementRank(b.placement) - placementRank(a.placement);
      });

      sorted.forEach((t, i) => {
        const card = template.content.cloneNode(true).children[0];
        card.querySelector("[data-quote]").textContent = `“${t.quote}”`;
        card.querySelector("[data-name]").textContent = t.name;
        card.querySelector("[data-placement]").textContent = `${t.placement} · ${t.year}`;
        // Stagger the WOW reveal so the grid animates in nicely
        card.setAttribute("data-wow-delay", `${Math.min(i * 0.08, 0.6)}s`);
        grid.appendChild(card);
      });
    });
})();

function placementRank(placement) {
  const s = (placement || "").toLowerCase();
  if (s.includes("gold")) return 5;
  if (s.includes("silver")) return 4;
  if (s.includes("bronze")) return 3;
  if (s.includes("finalist") && !s.includes("semi")) return 2;
  if (s.includes("semifinalist")) return 1;
  return 0;
}
