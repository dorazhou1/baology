# baology

**Live:** <https://baology.org> · **Local preview:** <http://localhost:8000/> (see [Preview locally](#preview-locally))

Static site for Baology Prep, served by **GitHub Pages straight from the `main`
branch** (Settings → Pages → "Deploy from a branch", `main` / root). There is no
CI build step — whatever is committed to `main` is what goes live.

## Preview locally

The shared header/footer are injected with `fetch()` and the demo page embeds
YouTube — neither works from a `file://` page — so preview through a local web
server, **started from the repo root**:

```sh
python3 -m http.server 8000     # serve; then open http://localhost:8000/
```

Stop it with **`Ctrl+C`** in that terminal. If you backgrounded it (or a stale
server is still holding the port), kill it by port instead:

```sh
lsof -ti:8000 | xargs kill      # kill whatever is serving on port 8000
```

Any static server works (`npx serve`, `php -S localhost:8000`, the VS Code "Live
Server" extension, etc.). Serving from the root is what makes the site-relative
links, the injected nav, and the video embeds resolve exactly as they do on
baology.org. Edit a file, save, refresh the browser — **no build needed for plain
HTML / CSS / JS changes** (layout, styling, copy, the demo page).

## Editing content

Gallery and testimonials are data-driven:

- **Gallery** — edit `data/gallery.csv` (one row per photo: `src,alt,location,date,description`).
- **Testimonials** — edit `data/testimonials.yaml`.
- **Blog posts** — edit `blogs/blogs.json`.

## Build before you commit (important)

**You only need the build when you change `data/*` or `blogs/blogs.json`** — those
are the data-driven parts. Editing HTML/CSS/JS directly needs no build (see
"Preview locally" above).

A small Node script pre-renders that data into the HTML so search engines and AI
crawlers — which don't run JavaScript — can index the gallery, testimonials, and
blog cards. It also regenerates `sitemap.xml` (including an image sitemap of every
gallery photo). Because we deploy straight from the branch, **the rendered output
has to be committed.**

```sh
npm install        # once, to get the build's dev dependencies
npm run build      # re-render the HTML + sitemap from data/
git add -A && git commit && git push   # to main → live in ~1 min
```

If you change `data/*` but forget to run `npm run build`, the live site keeps
showing the old content. When in doubt, run the build — it's deterministic, so
running it with no data changes produces no diff.

### Automate it

A git pre-commit hook in `.githooks/` runs the build and stages the regenerated
HTML + sitemap on every commit, so they can never go stale. **`npm install`
enables it automatically** (via the `prepare` script) — no extra step. To enable
it by hand if needed:

```sh
git config core.hooksPath .githooks
```

After that, every `git commit` regenerates and includes the fresh output.
Bypass in an emergency with `git commit --no-verify`.

> The build writes only between the `<!-- BUILD:name -->` markers in the HTML;
> everything outside those markers is hand-edited normally. `explore/gallery.html`
> is marked `linguist-generated` in `.gitattributes` so GitHub collapses its large
> generated diff in pull requests.
