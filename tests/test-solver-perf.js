#!/usr/bin/env node
"use strict";

/**
 * Solver performance regression checks.
 *
 * Default mode is intentionally small enough for daily regression runs.
 * Use --stress --seed <n> --hands <n> when chasing rare slow hands.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const DEFAULT_SEED = 20260428;
const AI_BUDGET_MS = 300;
const AI_HARD_LIMIT_MS = 550;
const DETAILED_BUDGET_MS = 900;
const DETAILED_HARD_LIMIT_MS = 1250;

let passed = 0;
let failed = 0;
const failures = [];

function parseArgs(argv) {
  const out = { stress: false, json: false, seed: DEFAULT_SEED, hands: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--stress") out.stress = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--seed") out.seed = Number(argv[++i]);
    else if (arg === "--hands") out.hands = Number(argv[++i]);
  }
  if (!Number.isFinite(out.seed)) out.seed = DEFAULT_SEED;
  if (!Number.isFinite(out.hands)) out.hands = out.stress ? 1000 : 120;
  return out;
}

function assert(desc, actual, expected) {
  const ok = typeof expected === "function" ? expected(actual) : actual === expected;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push({ desc, expected, actual });
  }
}

function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function handKey(difficulty, hand) {
  return [difficulty, 21, hand.slice().sort((a, b) => a - b).join(",")].join("|");
}

function loadModules(difficulty) {
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8"), ctx, { filename: "js/config.js" });
  vm.runInContext(`game.difficulty = "${difficulty}";`, ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "expression.js"), "utf8"), ctx, { filename: "js/expression.js" });
  return ctx;
}

function clearCache(ctx) {
  if (typeof ctx.clearAiCache === "function") ctx.clearAiCache();
  else vm.runInContext("_aiCache = new Map(); _lastCheckedHand = '';", ctx);
}

function timed(fn) {
  const start = Date.now();
  const value = fn();
  return { value, elapsed: Date.now() - start };
}

function validateExpressions(ctx, label, hand, target, solutions) {
  for (const item of solutions) {
    const expr = typeof item === "string" ? item : item.expr;
    if (!expr) continue;
    let value;
    try {
      value = ctx.evaluate(expr);
    } catch (e) {
      assert(`${label}: ${expr} evaluates`, e.message, "no error");
      continue;
    }
    assert(`${label}: ${expr} reaches target`, Math.abs(value - target) < 0.000001, true);
    const handValidation = ctx.validateHand(expr, hand);
    assert(`${label}: ${expr} passes validateHand`, handValidation.valid, true);
  }
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(label, records) {
  const values = records.map(r => r.elapsed);
  return {
    label,
    count: records.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? Math.max(...values) : 0,
    timedOut: records.filter(r => r.timedOut).length,
    slowest: records.slice().sort((a, b) => b.elapsed - a.elapsed).slice(0, 10)
  };
}

function buildCases(opts) {
  const fixed = [
    { source: "fixed", name: "6332J-normal", difficulty: "normal", hand: [6, 3, 3, 2, 11] },
    { source: "fixed", name: "7-9-A-hard", difficulty: "hard", hand: [7, 9, 1] },
    { source: "fixed", name: "old-slow-normal", difficulty: "normal", hand: [1, 6, 13, 13, 8] },
    { source: "fixed", name: "repeat-king-normal", difficulty: "normal", hand: [13, 13, 13, 13, 13] },
    { source: "fixed", name: "face-heavy-hard", difficulty: "hard", hand: [11, 12, 13, 1, 6] },
    { source: "fixed", name: "factorial-hard", difficulty: "hard", hand: [4, 3, 1, 1] },
    { source: "fixed", name: "odd-hard", difficulty: "hard", hand: [5, 7, 9, 11, 13] },
    { source: "fixed", name: "simple-5-normal", difficulty: "normal", hand: [10, 10, 1, 1, 1] }
  ];

  const rng = makeRng(opts.seed);
  const randomCases = [];
  for (let i = 0; i < opts.hands; i++) {
    const difficulty = i % 2 === 0 ? "normal" : "hard";
    const len = 3 + (i % 3);
    const hand = Array.from({ length: len }, () => randomInt(rng, 1, 13));
    randomCases.push({ source: "seeded", name: `seed-${opts.seed}-${i}`, difficulty, hand });
  }
  return fixed.concat(randomCases);
}

function runCase(ctx, testCase, records) {
  const target = 21;
  const ops = ctx.getBinaryOps();
  const label = `${testCase.name} ${testCase.difficulty} [${testCase.hand.join(",")}]`;

  clearCache(ctx);
  const ai = timed(() => ctx.aiSolve(testCase.hand.slice(), target, ops, {
    maxMs: AI_BUDGET_MS,
    style: "simple",
    maxResults: 1
  }));
  const aiRecord = {
    kind: "aiSolve",
    label,
    source: testCase.source,
    difficulty: testCase.difficulty,
    hand: testCase.hand,
    handKey: handKey(testCase.difficulty, testCase.hand),
    elapsed: ai.elapsed,
    timedOut: !!ai.value.timedOut,
    count: ai.value.length
  };
  records.ai.push(aiRecord);
  assert(`${label}: aiSolve returns within hard limit`, ai.elapsed <= AI_HARD_LIMIT_MS, true);
  validateExpressions(ctx, `${label} aiSolve`, testCase.hand, target, ai.value);

  clearCache(ctx);
  const detailed = timed(() => ctx.solveHandDetailed(testCase.hand.slice(), target, ops, {
    maxMs: DETAILED_BUDGET_MS
  }));
  const detailedRecord = {
    kind: "solveHandDetailed",
    label,
    source: testCase.source,
    difficulty: testCase.difficulty,
    hand: testCase.hand,
    handKey: handKey(testCase.difficulty, testCase.hand),
    elapsed: detailed.elapsed,
    timedOut: !!detailed.value.timedOut,
    simpleCount: detailed.value.simpleSolutions.length,
    coolCount: detailed.value.coolSolutions.length
  };
  records.detailed.push(detailedRecord);
  assert(`${label}: solveHandDetailed returns within hard limit`, detailed.elapsed <= DETAILED_HARD_LIMIT_MS, true);
  validateExpressions(ctx, `${label} detailed simple`, testCase.hand, target, detailed.value.simpleSolutions);
  validateExpressions(ctx, `${label} detailed cool`, testCase.hand, target, detailed.value.coolSolutions);

  if (testCase.name === "6332J-normal") {
    assert("6332J aiSolve finds a stable simple solution", ai.value.length > 0 && !ai.value.timedOut, true);
    assert("6332J detailed has a simple solution", detailed.value.simpleSolutions.length > 0, true);
  }
  if (testCase.name === "7-9-A-hard") {
    assert("7,9,A hard detailed has a cool solution", detailed.value.coolSolutions.length > 0, true);
    assert("7,9,A hard cool solution can use factorial", detailed.value.coolSolutions.some(s => s.expr.includes("!")), true);
  }
}

function printSummary(summary) {
  console.log(`\n${summary.label}`);
  console.log(`  count=${summary.count} timedOut=${summary.timedOut} p50=${summary.p50}ms p95=${summary.p95}ms p99=${summary.p99}ms max=${summary.max}ms`);
  console.log("  slowest:");
  summary.slowest.forEach((r, idx) => {
    const counts = r.kind === "aiSolve" ? `count=${r.count}` : `simple=${r.simpleCount} cool=${r.coolCount}`;
    console.log(`    ${idx + 1}. ${r.elapsed}ms timedOut=${r.timedOut} ${counts} ${r.handKey} ${r.label}`);
  });
}

const opts = parseArgs(process.argv.slice(2));
const contexts = {
  normal: loadModules("normal"),
  hard: loadModules("hard")
};
const records = { ai: [], detailed: [] };
const cases = buildCases(opts);

for (const testCase of cases) {
  const ctx = contexts[testCase.difficulty];
  vm.runInContext(`game.difficulty = "${testCase.difficulty}";`, ctx);
  runCase(ctx, testCase, records);
}

const aiSummary = summarize("aiSolve", records.ai);
const detailedSummary = summarize("solveHandDetailed", records.detailed);

if (opts.json) {
  console.log(JSON.stringify({
    seed: opts.seed,
    hands: opts.hands,
    stress: opts.stress,
    budgets: {
      aiBudgetMs: AI_BUDGET_MS,
      aiHardLimitMs: AI_HARD_LIMIT_MS,
      detailedBudgetMs: DETAILED_BUDGET_MS,
      detailedHardLimitMs: DETAILED_HARD_LIMIT_MS
    },
    summaries: [aiSummary, detailedSummary],
    failures
  }, null, 2));
} else {
  console.log(`\nseed=${opts.seed} randomHands=${opts.hands} stress=${opts.stress}`);
  printSummary(aiSummary);
  printSummary(detailedSummary);
  console.log(`\npassed: \x1b[32m${passed}\x1b[0m`);
  console.log(`failed: \x1b[31m${failed}\x1b[0m`);
}

if (failures.length > 0) {
  if (!opts.json) {
    console.log("\nFailures:");
    failures.slice(0, 20).forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.desc}`);
      console.log(`     expected: ${JSON.stringify(f.expected)}`);
      console.log(`     actual: ${JSON.stringify(f.actual)}`);
    });
  }
  process.exit(1);
}

