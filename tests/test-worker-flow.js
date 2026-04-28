#!/usr/bin/env node
"use strict";

/**
 * Solver worker contract tests.
 *
 * Runs js/solver-worker.js inside a Node vm with a tiny importScripts/self
 * harness. This does not start a browser and does not use worker_threads.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, actual, expected) {
  const ok = typeof expected === "function" ? expected(actual) : actual === expected;
  if (ok) {
    passed++;
    if (process.argv.includes("-v")) console.log(`  \x1b[32mOK\x1b[0m ${desc}`);
  } else {
    failed++;
    const msg = `  \x1b[31mFAIL\x1b[0m ${desc}\n     expected: ${JSON.stringify(expected)}\n     actual: ${JSON.stringify(actual)}`;
    console.log(msg);
    failures.push({ desc, expected, actual });
  }
}

function createWorkerEnv() {
  const messages = [];
  const ctx = {
    console,
    self: {
      postMessage(message) {
        messages.push(message);
      }
    },
    importScripts(...names) {
      for (const name of names) {
        const file = path.join(ROOT, "js", name.replace(/^js[\\/]/, ""));
        vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: `js/${path.basename(name)}` });
      }
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "solver-worker.js"), "utf8"), ctx, {
    filename: "js/solver-worker.js"
  });

  return {
    ctx,
    send(data) {
      messages.length = 0;
      const start = Date.now();
      ctx.self.onmessage({ data });
      return { response: messages[0], elapsed: Date.now() - start };
    }
  };
}

function validateSolutions(ctx, difficulty, hand, solutions) {
  vm.runInContext(`game.difficulty = "${difficulty}";`, ctx);
  for (const solution of solutions) {
    const expr = solution.expr;
    assert(`worker solution has expr: ${expr}`, typeof expr, "string");
    assert(`worker solution reaches target: ${expr}`, Math.abs(ctx.evaluate(expr) - 21) < 0.000001, true);
    assert(`worker solution passes validateHand: ${expr}`, ctx.validateHand(expr, hand).valid, true);
  }
}

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

section("worker returns hard cool solutions for 7,9,A");
{
  const env = createWorkerEnv();
  const msg = {
    id: 101,
    handKey: "hard|21|1,7,9",
    hand: [7, 9, 1],
    target: 21,
    difficulty: "hard",
    maxMs: 1000
  };
  const { response, elapsed } = env.send(msg);

  assert("worker responds", !!response, true);
  assert("worker echoes id", response.id, msg.id);
  assert("worker echoes handKey", response.handKey, msg.handKey);
  assert("worker simpleSolutions is array", Array.isArray(response.simpleSolutions), true);
  assert("worker coolSolutions is array", Array.isArray(response.coolSolutions), true);
  assert("worker returns promptly", elapsed <= 1250, true);
  assert("worker returns a cool solution", response.coolSolutions.length > 0, true);
  assert("worker cool solution may use factorial", response.coolSolutions.some(s => s.expr.includes("!")), true);
  validateSolutions(env.ctx, "hard", msg.hand, response.simpleSolutions.concat(response.coolSolutions));
}

section("worker low budget timeout stays bounded");
{
  const env = createWorkerEnv();
  const msg = {
    id: 102,
    handKey: "normal|21|13,13,13,13,13",
    hand: [13, 13, 13, 13, 13],
    target: 21,
    difficulty: "normal",
    maxMs: 1
  };
  const { response, elapsed } = env.send(msg);

  assert("low-budget worker responds", !!response, true);
  assert("low-budget worker echoes id", response.id, msg.id);
  assert("low-budget worker is bounded", elapsed <= 550, true);
  assert("low-budget worker marks timedOut", response.timedOut, true);
  validateSolutions(env.ctx, "normal", msg.hand, response.simpleSolutions.concat(response.coolSolutions));
}

section("worker catches malformed input");
{
  const env = createWorkerEnv();
  const { response, elapsed } = env.send({
    id: 103,
    handKey: "bad",
    hand: "bad-hand",
    target: 21,
    difficulty: "hard",
    maxMs: 100
  });

  assert("bad input worker responds", !!response, true);
  assert("bad input echoes id", response.id, 103);
  assert("bad input returns empty simple list", response.simpleSolutions.length, 0);
  assert("bad input returns empty cool list", response.coolSolutions.length, 0);
  assert("bad input marks timedOut/error path", response.timedOut, true);
  assert("bad input includes error message", typeof response.error, "string");
  assert("bad input is bounded", elapsed <= 550, true);
}

console.log(`\n${"=".repeat(60)}`);
console.log("  worker flow test result");
console.log(`${"=".repeat(60)}`);
console.log(`  passed: \x1b[32m${passed}\x1b[0m`);
console.log(`  failed: \x1b[31m${failed}\x1b[0m`);
console.log(`  total: ${passed + failed}`);
console.log(`${"=".repeat(60)}`);

if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.desc}`);
    console.log(`     expected: ${JSON.stringify(f.expected)}`);
    console.log(`     actual: ${JSON.stringify(f.actual)}`);
  });
  process.exit(1);
}

console.log("\n\x1b[32mOK worker flow checks passed\x1b[0m");

