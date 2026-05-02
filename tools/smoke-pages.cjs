#!/usr/bin/env node
"use strict";

const DEFAULT_URL = "https://eq21game.com";
const baseUrl = normalizeBaseUrl(process.argv[2] || process.env.EQ21_SITE_URL || DEFAULT_URL);

let passed = 0;
let failed = 0;
const failures = [];

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_URL).trim().replace(/\/+$/, "");
}

function assert(desc, ok, detail) {
  if (ok) {
    passed++;
    console.log("  \x1b[32mOK\x1b[0m " + desc);
  } else {
    failed++;
    failures.push({ desc, detail });
    console.log("  \x1b[31mFAIL\x1b[0m " + desc + (detail ? "\n     " + detail : ""));
  }
}

function makeUrl(path) {
  return baseUrl + path;
}

async function fetchText(path, options) {
  const response = await fetch(makeUrl(path), Object.assign({
    cache: "no-store",
    redirect: "manual"
  }, options || {}));
  const text = await response.text();
  return { response, text };
}

function header(response, name) {
  return response.headers.get(name) || "";
}

async function main() {
  console.log("\n============================================================");
  console.log("  pages production smoke");
  console.log("============================================================");
  console.log("  target: " + baseUrl);

  const home = await fetchText("/");
  assert("/ returns 200", home.response.status === 200, String(home.response.status));
  assert("/ returns HTML", /text\/html/i.test(header(home.response, "content-type")), header(home.response, "content-type"));
  assert("/ has a real app shell", home.text.includes("serviceWorker.register") && home.text.includes("js/main.js"));

  const index = await fetchText("/index.html");
  assert("/index.html is not required as the app shell",
    index.response.status === 200 || [301, 302, 307, 308].includes(index.response.status),
    String(index.response.status)
  );
  if ([301, 302, 307, 308].includes(index.response.status)) {
    assert("/index.html redirects to root when redirected",
      (header(index.response, "location") || "").replace(baseUrl, "") === "/",
      header(index.response, "location")
    );
  }

  const manifest = await fetchText("/manifest.json");
  let manifestJson = null;
  try {
    manifestJson = JSON.parse(manifest.text);
    assert("/manifest.json parses", true);
  } catch (e) {
    assert("/manifest.json parses", false, e.message);
  }
  if (manifestJson) {
    assert("manifest start_url avoids redirected index.html",
      manifestJson.start_url === "./" || manifestJson.start_url === "/",
      manifestJson.start_url
    );
  }

  const sw = await fetchText("/sw.js");
  const swCacheControl = header(sw.response, "cache-control");
  const cacheName = (sw.text.match(/const\s+CACHE\s*=\s*["']([^"']+)["']/) || [null, ""])[1];
  assert("/sw.js returns 200", sw.response.status === 200, String(sw.response.status));
  assert("/sw.js is no-store", /no-store/i.test(swCacheControl), swCacheControl);
  assert("/sw.js uses generated cache version", /^equation21-v-[a-z0-9-]+$/i.test(cacheName) && cacheName !== "equation21-v29", cacheName);
  assert("service worker precaches root app shell", sw.text.includes("'./'") || sw.text.includes('"./"'));
  assert("service worker does not precache redirected index.html", !sw.text.includes("./index.html"));
  assert("service worker bypasses reset-sw recovery URL", /searchParams\.has\(['"]reset-sw['"]\)/.test(sw.text));

  for (const path of ["/style.css", "/js/main.js", "/js/game.js", "/js/ui.js", "/js/solver-worker.js"]) {
    const asset = await fetchText(path);
    assert(path + " returns 200", asset.response.status === 200, String(asset.response.status));
    assert(path + " is not HTML", !/text\/html/i.test(header(asset.response, "content-type")), header(asset.response, "content-type"));
  }

  const deployConfig = await fetchText("/js/deploy-config.js");
  assert("/js/deploy-config.js returns 200", deployConfig.response.status === 200, String(deployConfig.response.status));
  assert("/js/deploy-config.js is no-store", /no-store/i.test(header(deployConfig.response, "cache-control")), header(deployConfig.response, "cache-control"));

  console.log("\n============================================================");
  console.log("  smoke result");
  console.log("============================================================");
  console.log("  passed: \x1b[32m" + passed + "\x1b[0m");
  console.log("  failed: \x1b[31m" + failed + "\x1b[0m");
  console.log("  total: " + (passed + failed));
  console.log("============================================================");

  if (failures.length > 0) process.exit(1);
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
