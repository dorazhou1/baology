const blogCardTemplate = document.querySelector("[data-blog-template]")
const blogCardContainer = document.querySelector("[data-blog-cards-container]")
const searchInput = document.getElementById("query");
const searchBtn = document.getElementById("search-btn");
const searchForm = document.getElementById("search");

// How many cards make a page. scripts/build.js owns the number: it cuts the
// baked pages with it and publishes it on the container as data-page-size, which
// is what this reads. 6 is only the fallback for a page served before the build
// ever ran (the <template> path below).
const BLOG_PAGE_SIZE = Number(blogCardContainer && blogCardContainer.dataset.pageSize) || 6;

// Which page a card sits on is STATE, not styling, so it lives in data-page.
// It used to be a class literally named "1"/"0", which no stylesheet can select
// without escaping (`.\31 `), and clearing it meant re-authoring className --
// which silently wiped the classes the build owns (is-raised, wow, fadeInLeft).
// Write only this attribute; never touch the element's class list except for
// `hide`, the one visibility flag this file owns.
function setPage(el, page) {
  if (page) el.dataset.page = String(page);
  else delete el.dataset.page;
}

// A tag chip filters by its own text. Both render paths below bind through this
// one function so they cannot drift apart again; displaySearch owns the
// normalisation. `return false` is what cancels the click, since every chip sits
// inside the card's <a href> and would otherwise navigate away.
function bindTagFilter(li, text) {
  li.onclick = () => { displaySearch(text); return false; };
}

let blogs = []

// Every hook below is attached only when its element is actually on the page.
// This file is one top-level chain, so an unguarded `searchBtn.addEventListener`
// on a null #search-btn threw BEFORE the submit handler and the fetch() further
// down ever ran -- a page missing just the search widget would have lost the
// blog list, the pagination and the tag chips with it. That is the same
// throw-before-registration failure js/script.js was hardened against last
// round. Guarding each hook keeps one absent element to one absent feature.
if (searchBtn && searchInput) {
    searchBtn.addEventListener("click", () => {
        displaySearch(searchInput.value);
    })
}
// Every entry point funnels through here -- the button, the form, and a tag chip
// whose text is capitalised in blogs.json ("USABO", "Campbells", "Jason") -- so
// the term is normalised HERE, once, instead of at each call site. The card
// fields below are compared lower-cased; a term that skipped the same treatment
// matched nothing and emptied the whole page, which is exactly what a tag click
// used to do. Trimming is part of the same normalisation: a trailing space typed
// (or auto-inserted on mobile) after a real word must not zero the results.
function displaySearch(value) {
    const query = String(value == null ? "" : value).trim().toLowerCase();
    let c = 0;
    let maxnum = 0;
    blogs.forEach(blog => {
        const isVisible =
        blog.name.toLowerCase().includes(query) ||
        blog.description.toLowerCase().includes(query) ||
        (blog.tags && blog.tags.toLowerCase().includes(query))

        if(isVisible) {
            const page = Math.floor(c / BLOG_PAGE_SIZE) + 1;
            maxnum = Math.max(maxnum, page);
            setPage(blog.element, page);
            c++;
        } else {
            setPage(blog.element, 0);
        }
    })
    limitDisplay(1, maxnum)
}
if (searchForm && searchInput) {
    searchForm.addEventListener("submit", e => {
        e.preventDefault();
        displaySearch(searchInput.value);
    })
}
// searchInput.addEventListener("input", e => {
//   const value = e.target.value.toLowerCase()
//   blogs.forEach(blog => {
//     const isVisible =
//       blog.name.toLowerCase().includes(value) ||
//       blog.description.toLowerCase().includes(value)
//     blog.element.classList.toggle("hide", !isVisible)
//   })
// })

// The container is what every branch below writes into; without it there is
// nothing this file can do, and querySelectorAll on null is a TypeError.
if (blogCardContainer) fetch("./blogs/blogs.json")
    .then(res => res.json())
    .then(data => {
        const existingCards = [...blogCardContainer.querySelectorAll(".card")];
        if (existingCards.length > 0) {
            // Pre-rendered cards from scripts/build.js — bind search to existing
            // DOM instead of rebuilding from scratch (so SEO content stays in HTML
            // and there's no flash on load). Tag click handlers can't be baked
            // into static HTML, so re-attach them here.
            //
            // build.js sorts the cards newest-first before baking them; blogs.json
            // keeps whatever order it was edited in. So data[i] is NOT reliably the
            // record for existingCards[i] — pairing them by position made a search
            // light up somebody else's card the moment the two orders diverged.
            // `link` is the one field both sides carry, and build.js writes it
            // straight into href, so it is the key. Iterating the CARDS keeps DOM
            // order, which is the order the visitor reads and the order pages are
            // cut from.
            const byLink = new Map(data.map(blog => [blog.link, blog]));
            let maxnum = 1;
            blogs = existingCards.map((card, i) => {
                const blog = byLink.get(card.getAttribute("href")) || data[i];
                if (!blog) return null;
                card.querySelectorAll(".taglist li").forEach(li => {
                    bindTagFilter(li, (li.textContent || "").trim());
                });
                const page = Math.floor(i / BLOG_PAGE_SIZE) + 1;
                maxnum = Math.max(maxnum, page);
                setPage(card, page);
                return { name: blog.name, description: blog.description, tags: blog.tags, element: card };
            }).filter(Boolean);
            limitDisplay(1, maxnum);
            return;
        }

        // Fallback for when build script hasn't been run. It clones the
        // <template>, so it needs one -- the pre-rendered branch above does not.
        if (!blogCardTemplate) return;

        let c = 0;
        let maxnum = 1;
        blogs = data.map(blog => {
            //content
            const card = blogCardTemplate.content.cloneNode(true).children[0]
            const header = card.querySelector("[data-header]")
            const subtitle = card.querySelector("[data-subtitle]")
            const body = card.querySelector("[data-body]")
            const tags = card.querySelector("[data-taglist]")
            const date = card.querySelector("[data-date]")
            header.textContent = blog.name
            subtitle.textContent = blog.subtitle
            body.textContent = blog.description
            date.textContent = blog.date;
            //tags — same split scripts/build.js bakes with, so this branch and
            //the pre-rendered one produce the same chips from the same string.
            //The hand-rolled indexOf/substr walk it replaces emitted an empty
            //chip for any double or leading space, and an empty chip filters to
            //everything.
            (blog.tags || "").split(" ").filter(Boolean).forEach(val => {
                const li = document.createElement("li");
                li.appendChild(document.createTextNode(val));
                bindTagFilter(li, val);
                tags.appendChild(li);
            })
            //links and imgs
            card.href = blog.link;
            const img = card.querySelector('[data-img]')
            img.src = blog.imglink
            // Setting only .src left this runtime-built card with NO alt
            // attribute, while the same card baked by scripts/build.js ships
            // alt="". An empty alt is correct here -- header, subtitle, body and
            // date carry the meaning and the whole card is one link -- but a
            // missing alt is not. Same expression js/blog-card.js and
            // js/gallery.js use, so all three card paths agree.
            img.alt = blog.alt || ""
            blogCardContainer.append(card)
            //page number
            const page = Math.floor(c / BLOG_PAGE_SIZE) + 1;
            maxnum = Math.max(maxnum, page);
            setPage(card, page);
            c++;
            return { name: blog.name, description: blog.description, tags: blog.tags, element: card }
        })
        limitDisplay(1, maxnum);
    })
    .catch(err => console.error("search.js: could not load blogs.json", err))

  function limitDisplay(num,maxnum) {
        blogs.forEach(blog => {
            const isVisible = blog.element.dataset.page === num.toString();
            blog.element.classList.toggle("hide", !isVisible)            
        })
        // The card visibility above is the load-bearing half and has already
        // run. The pager is optional chrome: a page with cards but no
        // [data-blog-nums] used to TypeError here, which killed the caller --
        // including the initial render that had just shown page 1.
        const nums = document.querySelector("[data-blog-nums]");
        if (!nums) return;
        while (nums.firstChild) {
            nums.removeChild(nums.firstChild); 
        }
        if(maxnum>1) {
            for(let i=1;i<maxnum+1;i++) {
                const li = document.createElement("li");
                li.appendChild(document.createTextNode(i.toString()));
                li.classList.toggle("active-num", i==num);
                li.onclick = () => {
                    // [data-resources] is the scroll anchor, not the pager's
                    // reason to exist: paging must still work without it.
                    const anchor = document.querySelector("[data-resources]");
                    if (anchor) anchor.scrollIntoView();
                    limitDisplay(i, maxnum);
                }
                nums.appendChild(li);
            }
        }
  }