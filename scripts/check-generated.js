#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const generatedFiles = [
  "explore.html",
  "explore/gallery.html",
  "explore/testimonials.html",
  "blog-main.html",
  "sitemap.xml",
];

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status || 0;
}

const buildExit = run("npm", ["run", "build"]);
if (buildExit !== 0) process.exit(buildExit);

const diffExit = run("git", ["diff", "--quiet", "--", ...generatedFiles]);
if (diffExit !== 0) {
  console.error("\nGenerated files are stale. Run `npm run build` and commit the updates.");
}
process.exit(diffExit);
