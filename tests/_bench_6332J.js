"use strict";
// Quick bench: 6332J solver performance

const vm = require("vm");
const fs = require("fs");
const path = require("path");

const configCode = fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf8");
const exprCode = fs.readFileSync(path.join(__dirname, "..", "js", "expression.js"), "utf8");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(configCode, ctx);
vm.runInContext(exprCode, ctx);

// Test 1: 6332J with 300ms budget
const t1 = Date.now();
const r1 = vm.runInContext(
  'aiSolve([6,3,3,2,11], 21, getBinaryOps(), { maxMs: 300 })', ctx);
const e1 = Date.now() - t1;
console.log("6332J 300ms:", "solutions=" + r1.length, "timedOut=" + r1.timedOut, "elapsed=" + e1 + "ms");
r1.forEach(function(s, i) {
  console.log("  [" + i + "]", s);
});

// Test 2: 80ms budget (auto hint simulation)
vm.runInContext('_aiCache.clear()', ctx);
const t2 = Date.now();
const r2 = vm.runInContext(
  'aiSolve([6,3,3,2,11], 21, getBinaryOps(), { maxMs: 80 })', ctx);
const e2 = Date.now() - t2;
console.log("\n6332J 80ms:", "solutions=" + r2.length, "timedOut=" + r2.timedOut, "elapsed=" + e2 + "ms");

// Test 3: cache hit after successful solve
const t3 = Date.now();
const r3 = vm.runInContext(
  'aiSolve([6,3,3,2,11], 21, getBinaryOps(), { maxMs: 300 })', ctx);
const e3 = Date.now() - t3;
console.log("\n2nd 300ms cache:", "solutions=" + r3.length, "timedOut=" + r3.timedOut, "elapsed=" + e3 + "ms",
  e3 < 2 ? "CACHE HIT" : "CACHE MISS");
