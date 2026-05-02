#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { buildPages } = require("../tools/build-pages.cjs");
const packageJson = require("../package.json");

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

function read(rel) {
  return fs.readFileSync(path.join(DIST, rel), "utf8");
}

function extractCacheName(sw) {
  const match = String(sw || "").match(/const\s+CACHE\s*=\s*["']([^"']+)["']/);
  return match ? match[1] : "";
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
assert("dist/_headers exists", exists("_headers"));
assert("dist/robots.txt exists", exists("robots.txt"));
assert("dist/sitemap.xml exists", exists("sitemap.xml"));
assert("dist/assets/og-image.jpg exists", exists("assets/og-image.jpg"));
assert("dist/js directory exists", fs.existsSync(path.join(DIST, "js")) && fs.statSync(path.join(DIST, "js")).isDirectory());
assert("dist/js/online.js exists", exists("js/online.js"));
assert("dist/js/deploy-config.js exists", exists("js/deploy-config.js"));
assert("package exposes Pages smoke script",
  packageJson.scripts && packageJson.scripts["smoke:pages"] === "node tools/smoke-pages.cjs",
  packageJson.scripts && packageJson.scripts["smoke:pages"]
);

if (exists("js/deploy-config.js")) {
  const config = read("js/deploy-config.js");
  assert("deploy config contains normalized Worker URL",
    config.includes('window.EQ21_ONLINE_URL = "https://equation-21-online.example.workers.dev";'),
    config
  );
}

let firstCacheName = "";
if (exists("sw.js")) {
  const sw = read("sw.js");
  firstCacheName = extractCacheName(sw);
  assert("dist service worker gets generated cache name",
    /^equation21-v-[a-z0-9-]+$/i.test(firstCacheName) && firstCacheName !== "equation21-v29",
    firstCacheName
  );
  assert("dist service worker keeps deploy config out of precache",
    !sw.includes("'./js/deploy-config.js'") && !sw.includes('"./js/deploy-config.js"'),
    sw
  );
  assert("dist service worker precaches with cache:reload",
    /\bcache:\s*['"]reload['"]/.test(sw),
    "built sw.js should force-fetch with cache:reload"
  );
}

if (exists("_headers")) {
  const headers = read("_headers");
  assert("dist headers disable sw.js caching",
    /\/sw\.js[\s\S]*Cache-Control:\s*no-cache,\s*no-store,\s*must-revalidate/i.test(headers),
    headers
  );
  assert("dist headers disable deploy config caching",
    /\/js\/deploy-config\.js[\s\S]*Cache-Control:\s*no-store/i.test(headers),
    headers
  );
}

if (exists("index.html")) {
  const index = read("index.html");
  assert("dist index loads deploy config before online client",
    index.indexOf('src="js/deploy-config.js"') !== -1 &&
    index.indexOf('src="js/online.js"') !== -1 &&
    index.indexOf('src="js/deploy-config.js"') < index.indexOf('src="js/online.js"')
  );
  assert("dist index references production OG image",
    index.includes('content="https://eq21game.com/assets/og-image.jpg"')
  );
  assert("dist index registers SW with updateViaCache:'none'",
    /updateViaCache:\s*['"]none['"]/.test(index),
    "built index.html should use updateViaCache:none on register"
  );
  assert("dist index has controllerchange auto-refresh",
    /controllerchange/.test(index) &&
    /sessionStorage\.(?:get|set)Item\(/.test(index) &&
    /location\.reload\(\)/.test(index),
    "built index.html should auto-reload on controller change"
  );
}

if (exists("robots.txt")) {
  const robots = read("robots.txt");
  assert("dist robots references sitemap", robots.includes("Sitemap: https://eq21game.com/sitemap.xml"), robots);
}

if (exists("sitemap.xml")) {
  const sitemap = read("sitemap.xml");
  assert("dist sitemap lists production homepage", sitemap.includes("<loc>https://eq21game.com/</loc>"), sitemap);
}

try {
  const secondBuild = buildPages({ onlineUrl: "", quiet: true });
  assert("build test restores fallback dist config", true);
  const secondCacheName = exists("sw.js") ? extractCacheName(read("sw.js")) : "";
  assert("successive builds generate a fresh sw cache name",
    !!firstCacheName && secondCacheName && secondCacheName !== firstCacheName && secondCacheName === secondBuild.cacheName,
    `${firstCacheName} -> ${secondCacheName}`
  );
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
