const blogCardTemplate = document.querySelector("[data-blog-template]")
const blogCardContainer = document.querySelector("[data-blog-cards-container]")
const searchInput = document.getElementById("query");
const searchBtn = document.getElementById("search-btn");
const searchForm = document.getElementById("search");

let blogs = []
searchBtn.addEventListener("click", () => {
    displaySearch(searchInput.value.toLowerCase());
})
function displaySearch(value) {
    let c = 0;
    let maxnum = 0;
    blogs.forEach(blog => {
        const isVisible =
        blog.name.toLowerCase().includes(value) ||
        blog.description.toLowerCase().includes(value) ||
        (blog.tags && blog.tags.toLowerCase().includes(value))

        blog.element.className = "card wow fadeInLeft shadow";
        if(isVisible) {
            maxnum = Math.max(maxnum,(Math.floor(c/6)+1));
            blog.element.classList.toggle((Math.floor(c/6)+1).toString(), true);
            c++;
        } else {
            blog.element.classList.toggle(0, true)
        }
    })
    limitDisplay(1, maxnum)
}
searchForm.addEventListener("submit", e => {
    e.preventDefault();
    displaySearch(searchInput.value.toLowerCase());
})
// searchInput.addEventListener("input", e => {
//   const value = e.target.value.toLowerCase()
//   blogs.forEach(blog => {
//     const isVisible =
//       blog.name.toLowerCase().includes(value) ||
//       blog.description.toLowerCase().includes(value)
//     blog.element.classList.toggle("hide", !isVisible)
//   })
// })

fetch("./blogs/blogs.json")
    .then(res => res.json())
    .then(data => {
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
            date.textContent = blog.date
            //tags
            let taglist = blog.tags
            while(taglist) {
                const li = document.createElement("li");
                const ind = taglist.indexOf(" ")
                if(ind == -1) {
                    const val = taglist
                    li.appendChild(document.createTextNode(val));
                    li.onclick = () => {displaySearch(val); return false}
                    tags.appendChild(li);
                    break;
                }
                const val = taglist.substr(0, ind)
                li.appendChild(document.createTextNode(val));
                li.onclick = () => {displaySearch(val); return false}
                taglist = taglist.substr(ind+1, taglist.length)
                console.log(taglist)
                tags.appendChild(li);
            }
            //links and imgs
            card.href = blog.link;
            card.querySelector('[data-img]').src = blog.imglink
            blogCardContainer.append(card)
            //page number
            maxnum = Math.max(maxnum,(Math.floor(c/6)+1));
            card.classList.toggle((Math.floor(c/6)+1).toString(), true);
            c++;
            return { name: blog.name, description: blog.description, tags: blog.tags, element: card }
        })
        limitDisplay(1, maxnum);
    })

  function limitDisplay(num,maxnum) {
      console.log("limit")
        blogs.forEach(blog => {
            const isVisible = blog.element.classList.contains(num.toString());
            blog.element.classList.toggle("hide", !isVisible)            
        })
        const nums = document.querySelector("[data-blog-nums]");
        while (nums.firstChild) {
            nums.removeChild(nums.firstChild); 
        }
        if(maxnum>1) {
            for(let i=1;i<maxnum+1;i++) {
                const li = document.createElement("li");
                li.appendChild(document.createTextNode(i.toString()));
                li.classList.toggle("active-num", i==num);
                li.onclick = () => {document.querySelector("[data-resources]").scrollIntoView(); limitDisplay(i, maxnum)}
                nums.appendChild(li);
            }
        }
  }