#!/usr/bin/env node
"use strict";

/**
 * Equation 21 static health checks.
 *
 * This is intentionally dependency-free. It verifies resource references,
 * PWA metadata, Service Worker cache entries, and JavaScript syntax without
 * opening a browser or writing files.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function resolveLocal(ref) {
  const clean = ref.replace(/^\.\//, "");
  return path.join(ROOT, clean);
}

function assert(desc, ok, detail) {
  if (ok) {
    passed++;
    if (process.argv.includes("-v")) {
      console.log(`  \x1b[32m✓\x1b[0m ${desc}`);
    }
  } else {
    failed++;
    const msg = `  \x1b[31m✗\x1b[0m ${desc}${detail ? "\n     " + detail : ""}`;
    console.log(msg);
    failures.push({ desc, detail });
  }
}

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function extractAll(regex, text, groupIndex = 1) {
  const out = [];
  let match;
  while ((match = regex.exec(text)) !== null) out.push(match[groupIndex]);
  return out;
}

function attrValue(tag, attr) {
  const match = tag.match(new RegExp("\\b" + attr + "=[\"']([^\"']+)[\"']", "i"));
  return match ? match[1] : "";
}

function findMeta(attr, value) {
  const tags = indexHtml.match(/<meta\b[^>]*>/gi) || [];
  return tags.find(tag => attrValue(tag, attr) === value) || "";
}

function metaContent(attr, value) {
  return attrValue(findMeta(attr, value), "content");
}

function findLinkRel(rel) {
  const tags = indexHtml.match(/<link\b[^>]*>/gi) || [];
  return tags.find(tag => attrValue(tag, "rel") === rel) || "";
}

function checkExists(ref, desc) {
  const filePath = resolveLocal(ref);
  assert(`${desc}: ${ref}`, fs.existsSync(filePath), `missing ${rel(filePath)}`);
}

function checkNodeSyntax(file) {
  const filePath = path.join(ROOT, file);
  try {
    new vm.Script(fs.readFileSync(filePath, "utf8"), { filename: file });
    assert(`syntax check: ${file}`, true);
  } catch (e) {
    assert(`syntax check: ${file}`, false, e.message);
  }
}

console.log("\n============================================================");
console.log("  static: index.html resources");
console.log("============================================================");

const indexHtml = readText("index.html");
const stylesheets = extractAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, indexHtml);
const manifests = extractAll(/<link\b[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["'][^>]*>/gi, indexHtml);
const scripts = extractAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi, indexHtml);
const swRegs = extractAll(/serviceWorker\.register\(["']([^"']+)["']/g, indexHtml);

assert("index.html references at least one stylesheet", stylesheets.length > 0);
assert("index.html references manifest.json", manifests.includes("./manifest.json") || manifests.includes("manifest.json"));
assert("index.html references game scripts", scripts.length >= 6, `found ${scripts.length}`);
assert("index.html registers sw.js", swRegs.includes("./sw.js") || swRegs.includes("sw.js"));
assert("index.html exposes reset-sw recovery hook",
  /searchParams\.delete\(['"]reset-sw['"]\)/.test(indexHtml) &&
  /getRegistrations\(\)/.test(indexHtml) &&
  /caches\.keys\(\)/.test(indexHtml),
  "expected ?reset-sw=1 to unregister service workers and clear cache storage"
);
assert("index.html loads deploy config before online client",
  scripts.indexOf("js/deploy-config.js") !== -1 &&
  scripts.indexOf("js/online.js") !== -1 &&
  scripts.indexOf("js/deploy-config.js") < scripts.indexOf("js/online.js"),
  `scripts: ${scripts.join(", ")}`
);
assert("index.html loads local icon helper before UI script",
  scripts.indexOf("js/icons.js") !== -1 &&
  scripts.indexOf("js/ui.js") !== -1 &&
  scripts.indexOf("js/icons.js") < scripts.indexOf("js/ui.js"),
  `scripts: ${scripts.join(", ")}`
);
assert("main menu uses full-screen home surface",
  /id=["']menu-overlay["']\s+class=["']home-screen["']/.test(indexHtml),
  "menu-overlay should not reuse the generic dark overlay"
);
assert("core navigation and mode entry icons use local SVG hooks",
  !/[📖🔊🔇📜🐣🦊🧠⚔️🏆🤝]/u.test((indexHtml.match(/<div id=["']header-bar["'][\s\S]*?<div id=["']rules-overlay["']/) || [""])[0]),
  "header/menu/setup/result markup should avoid emoji entry icons"
);
assert("result icon is initialized through SVG icon hook",
  /id=["']result-icon["'][^>]*data-icon=["']trophy["']/.test(indexHtml),
  "missing data-icon on result icon"
);

for (const href of stylesheets) checkExists(href, "stylesheet exists");
for (const href of manifests) checkExists(href, "manifest exists");
for (const src of scripts) checkExists(src, "script exists");
for (const src of swRegs) checkExists(src, "service worker exists");

console.log("\n============================================================");
console.log("  static: SEO metadata");
console.log("============================================================");

const title = (indexHtml.match(/<title>([^<]+)<\/title>/i) || [null, ""])[1];
const description = metaContent("name", "description");
const canonical = attrValue(findLinkRel("canonical"), "href");
const robots = metaContent("name", "robots");
const ogImage = metaContent("property", "og:image");

assert("SEO title names brand and game category",
  title.includes("算式21点") && title.includes("Equation 21") && title.includes("在线数学纸牌游戏"),
  title
);
assert("meta description covers core gameplay",
  description.includes("在线数学纸牌游戏") && description.includes("21") && description.includes("AI 对战") && description.length <= 180,
  description
);
assert("canonical URL points to production domain", canonical === "https://eq21game.com/", canonical);
assert("robots meta allows indexing", robots === "index,follow", robots);
for (const prop of ["og:type", "og:site_name", "og:title", "og:description", "og:url", "og:image"]) {
  assert(`Open Graph tag exists: ${prop}`, !!metaContent("property", prop));
}
for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
  assert(`Twitter card tag exists: ${name}`, !!metaContent("name", name));
}
assert("social share image uses production asset URL",
  ogImage === "https://eq21game.com/assets/og-image.jpg" &&
  metaContent("name", "twitter:image") === ogImage,
  ogImage
);
checkExists("assets/og-image.jpg", "social share image exists");
assert("homepage has one visible h1 brand heading", /<h1\b[^>]*class=["'][^"']*\blogo-main\b/.test(indexHtml));

const troubleshootingDoc = readText("docs/DEPLOYMENT_TROUBLESHOOTING.md");
assert("deployment troubleshooting doc covers reset-sw recovery", troubleshootingDoc.includes("?reset-sw=1"));
assert("deployment troubleshooting doc covers production smoke checks", troubleshootingDoc.includes("smoke:pages"));

const jsonLdBlocks = extractAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, indexHtml);
assert("index.html includes JSON-LD structured data", jsonLdBlocks.length > 0);
let appSchema = null;
try {
  appSchema = JSON.parse(jsonLdBlocks[0]);
  assert("JSON-LD parses as JSON", true);
} catch (e) {
  assert("JSON-LD parses as JSON", false, e.message);
}
if (appSchema) {
  const schemaTypes = Array.isArray(appSchema["@type"]) ? appSchema["@type"] : [appSchema["@type"]];
  assert("JSON-LD co-types app as VideoGame and WebApplication",
    schemaTypes.includes("VideoGame") && schemaTypes.includes("WebApplication"),
    schemaTypes.join(", ")
  );
  assert("JSON-LD has required app fields",
    appSchema.name === "Equation 21" &&
    appSchema.url === "https://eq21game.com/" &&
    appSchema.applicationCategory === "GameApplication" &&
    appSchema.operatingSystem === "Web browser" &&
    appSchema.offers &&
    appSchema.offers.price === "0",
    JSON.stringify(appSchema)
  );
}

const robotsTxt = readText("robots.txt");
const sitemapXml = readText("sitemap.xml");
assert("robots.txt allows public crawling", /User-agent:\s*\*\s+Allow:\s*\//i.test(robotsTxt), robotsTxt);
assert("robots.txt references production sitemap", robotsTxt.includes("Sitemap: https://eq21game.com/sitemap.xml"), robotsTxt);
assert("sitemap.xml lists production homepage", sitemapXml.includes("<loc>https://eq21game.com/</loc>"), sitemapXml);

console.log("\n============================================================");
console.log("  static: manifest.json");
console.log("============================================================");

let manifest = null;
try {
  manifest = JSON.parse(readText("manifest.json"));
  assert("manifest.json parses as JSON", true);
} catch (e) {
  assert("manifest.json parses as JSON", false, e.message);
}

if (manifest) {
  assert("manifest has name", typeof manifest.name === "string" && manifest.name.length > 0);
  assert("manifest has short_name", typeof manifest.short_name === "string" && manifest.short_name.length > 0);
  assert("manifest start_url avoids redirected index.html", manifest.start_url === "./" || manifest.start_url === "/");
  assert("manifest display is standalone", manifest.display === "standalone");
  assert("manifest has at least one icon", Array.isArray(manifest.icons) && manifest.icons.length > 0);
}

console.log("\n============================================================");
console.log("  static: service worker cache entries");
console.log("============================================================");

const sw = readText("sw.js");
const filesMatch = sw.match(/const\s+FILES\s*=\s*\[([\s\S]*?)\];/);
assert("sw.js declares FILES cache list", !!filesMatch);

const swFiles = filesMatch ? extractAll(/["']([^"']+)["']/g, filesMatch[1]) : [];
assert("sw.js caches root app shell instead of redirected index.html", swFiles.includes("./") && !swFiles.includes("./index.html"));
assert("sw.js caches manifest.json", swFiles.includes("./manifest.json"));
assert("sw.js does not precache deploy config", !swFiles.includes("./js/deploy-config.js"));
assert("sw.js no longer uses fixed v29 cache", !/equation21-v29/.test(sw));
assert("sw.js ignores cross-origin requests", /url\.origin\s*!==\s*self\.location\.origin/.test(sw));
assert("sw.js fetches deploy config without browser cache", /DEPLOY_CONFIG_PATH/.test(sw) && /cache:\s*['"]no-store['"]/.test(sw));
assert("sw.js cleans old equation21 caches", /key\.indexOf\(['"]equation21-['"]\)\s*===\s*0/.test(sw));
assert("sw.js bypasses reset-sw recovery navigations", /searchParams\.has\(['"]reset-sw['"]\)/.test(sw));

for (const file of swFiles) checkExists(file, "sw cache entry exists");

for (const href of stylesheets.concat(manifests, scripts)) {
  if (href.replace(/^\.\//, "") === "js/deploy-config.js") continue;
  const normalized = href.startsWith("./") ? href : "./" + href;
  assert(`sw cache includes ${href}`, swFiles.includes(normalized), `missing ${normalized} from FILES`);
}

assert("sw.js precaches with cache:reload to bypass HTTP cache",
  /\bcache:\s*['"]reload['"]/.test(sw),
  "install handler should use Request with cache:'reload'"
);
assert("index.html registers SW with updateViaCache:'none'",
  /updateViaCache:\s*['"]none['"]/.test(indexHtml),
  "service worker registration should use updateViaCache:'none'"
);
assert("index.html listens for controllerchange auto-refresh",
  /controllerchange/.test(indexHtml) &&
  /location\.reload\(\)/.test(indexHtml) &&
  /sessionStorage\.(?:get|set)Item\(/.test(indexHtml),
  "page should reload on controllerchange with sessionStorage guard"
);

console.log("\n============================================================");
console.log("  static: JavaScript syntax");
console.log("============================================================");

for (const script of scripts) checkNodeSyntax(script);
for (const file of swFiles.filter(file => file.endsWith(".js") && !scripts.includes(file.replace(/^\.\//, "")))) {
  checkNodeSyntax(file.replace(/^\.\//, ""));
}
checkNodeSyntax("sw.js");
checkNodeSyntax("tools/smoke-pages.cjs");

console.log("\n============================================================");
console.log("  static test result");
console.log("============================================================");
console.log(`  passed: \x1b[32m${passed}\x1b[0m`);
console.log(`  failed: \x1b[31m${failed}\x1b[0m`);
console.log(`  total: ${passed + failed}`);
console.log("============================================================");

if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.desc}`);
    if (f.detail) console.log(`     ${f.detail}`);
  });
  process.exit(1);
}

console.log("\n\x1b[32m✓ static checks passed\x1b[0m");
