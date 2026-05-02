#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { buildPages } = require("../tools/build-pages.cjs");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const TEST_URL = "https://equation-21-online.example.workers.dev/";

let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, ok, detail) {
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push({ desc, detail });
    console.log(`  \x1b[31m✗\x1b[0m ${desc}${detail ? "\n     " + detail : ""}`);
  }
}

function exists(rel) {
  return fs.existsSync(path.join(DIST, rel));
}

console.log("\n============================================================");
console.log("  pages build");
console.log("============================================================");

let buildResult = null;
try {
  buildResult = buildPages({ onlineUrl: TEST_URL, quiet: true });
  assert("build:pages exits successfully", true);
} catch (e) {
  assert("build:pages exits successfully", false, e && e.stack ? e.stack : String(e));
}
assert("build returns normalized Worker URL",
  buildResult && buildResult.onlineUrl === "https://equation-21-online.example.workers.dev",
  buildResult && buildResult.onlineUrl
);
assert("dist/index.html exists", exists("index.html"));
assert("dist/style.css exists", exists("style.css"));
assert("dist/manifest.json exists", exists("manifest.json"));
assert("dist/sw.js exists", exists("sw.js"));
assert("dist/robots.txt exists", exists("robots.txt"));
assert("dist/sitemap.xml exists", exists("sitemap.xml"));
assert("dist/assets/og-image.png exists", exists("assets/og-image.png"));
assert("dist/js directory exists", fs.existsSync(path.join(DIST, "js")) && fs.statSync(path.join(DIST, "js")).isDirectory());
assert("dist/js/online.js exists", exists("js/online.js"));
assert("dist/js/deploy-config.js exists", exists("js/deploy-config.js"));

if (exists("js/deploy-config.js")) {
  const config = fs.readFileSync(path.join(DIST, "js", "deploy-config.js"), "utf8");
  assert("deploy config contains normalized Worker URL",
    config.includes('window.EQ21_ONLINE_URL = "https://equation-21-online.example.workers.dev";'),
    config
  );
}

if (exists("index.html")) {
  const index = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  assert("dist index loads deploy config before online client",
    index.indexOf('src="js/deploy-config.js"') !== -1 &&
    index.indexOf('src="js/online.js"') !== -1 &&
    index.indexOf('src="js/deploy-config.js"') < index.indexOf('src="js/online.js"')
  );
  assert("dist index references production OG image",
    index.includes('content="https://eq21game.com/assets/og-image.png"')
  );
}

if (exists("robots.txt")) {
  const robots = fs.readFileSync(path.join(DIST, "robots.txt"), "utf8");
  assert("dist robots references sitemap", robots.includes("Sitemap: https://eq21game.com/sitemap.xml"), robots);
}

if (exists("sitemap.xml")) {
  const sitemap = fs.readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
  assert("dist sitemap lists production homepage", sitemap.includes("<loc>https://eq21game.com/</loc>"), sitemap);
}

try {
  buildPages({ onlineUrl: "", quiet: true });
  assert("build test restores fallback dist config", true);
} catch (e) {
  assert("build test restores fallback dist config", false, e && e.stack ? e.stack : String(e));
}

console.log("\n============================================================");
console.log("  pages build test result");
console.log("============================================================");
console.log(`  passed: \x1b[32m${passed}\x1b[0m`);
console.log(`  failed: \x1b[31m${failed}\x1b[0m`);
console.log(`  total: ${passed + failed}`);
console.log("============================================================");

if (failures.length > 0) process.exit(1);
console.log("\n\x1b[32mOK pages build checks passed\x1b[0m");
