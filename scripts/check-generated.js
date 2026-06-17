#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status || 0;
}

const buildExit = run("npm", ["run", "build"]);
if (buildExit !== 0) process.exit(buildExit);

// After a build the working tree must be unchanged: every generated artifact
// (pre-rendered gallery/testimonials/blog cards, sitemap, and the static nav
// injected into every page from header.html) should already be committed.
const diffExit = run("git", ["diff", "--quiet"]);
if (diffExit !== 0) {
  console.error("\nGenerated output is stale. Run `npm run build` and commit the updates.");
}
process.exit(diffExit);
