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
const swRegs = extractAll(/serviceWorker\.register\(["']([^"']+)["']\)/g, indexHtml);

assert("index.html references at least one stylesheet", stylesheets.length > 0);
assert("index.html references manifest.json", manifests.includes("./manifest.json") || manifests.includes("manifest.json"));
assert("index.html references game scripts", scripts.length >= 6, `found ${scripts.length}`);
assert("index.html registers sw.js", swRegs.includes("./sw.js") || swRegs.includes("sw.js"));
assert("index.html loads deploy config before online client",
  scripts.indexOf("js/deploy-config.js") !== -1 &&
  scripts.indexOf("js/online.js") !== -1 &&
  scripts.indexOf("js/deploy-config.js") < scripts.indexOf("js/online.js"),
  `scripts: ${scripts.join(", ")}`
);

for (const href of stylesheets) checkExists(href, "stylesheet exists");
for (const href of manifests) checkExists(href, "manifest exists");
for (const src of scripts) checkExists(src, "script exists");
for (const src of swRegs) checkExists(src, "service worker exists");

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
  assert("manifest start_url points to index.html", typeof manifest.start_url === "string" && manifest.start_url.includes("index.html"));
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
assert("sw.js caches index.html", swFiles.includes("./index.html"));
assert("sw.js caches manifest.json", swFiles.includes("./manifest.json"));
assert("sw.js does not precache deploy config", !swFiles.includes("./js/deploy-config.js"));

for (const file of swFiles) checkExists(file, "sw cache entry exists");

for (const href of stylesheets.concat(manifests, scripts)) {
  if (href.replace(/^\.\//, "") === "js/deploy-config.js") continue;
  const normalized = href.startsWith("./") ? href : "./" + href;
  assert(`sw cache includes ${href}`, swFiles.includes(normalized), `missing ${normalized} from FILES`);
}

console.log("\n============================================================");
console.log("  static: JavaScript syntax");
console.log("============================================================");

for (const script of scripts) checkNodeSyntax(script);
for (const file of swFiles.filter(file => file.endsWith(".js") && !scripts.includes(file.replace(/^\.\//, "")))) {
  checkNodeSyntax(file.replace(/^\.\//, ""));
}
checkNodeSyntax("sw.js");

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
