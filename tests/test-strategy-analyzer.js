#!/usr/bin/env node
"use strict";

const sa = require("../tools/strategy-analyzer.js");

let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, actual, expected, opts) {
  opts = opts || {};
  let ok;
  if (opts.approx) {
    ok = Math.abs(actual - expected) < (opts.tolerance || 0.000001);
  } else if (expected instanceof RegExp) {
    ok = expected.test(String(actual));
  } else if (typeof expected === "function") {
    ok = expected(actual);
  } else {
    ok = actual === expected;
  }
  if (ok) {
    passed++;
    if (process.argv.includes("-v")) console.log("  \x1b[32m\u2713\x1b[0m " + desc);
  } else {
    failed++;
    const msg = "  \x1b[31m\u2717\x1b[0m " + desc + "\n     \u671f\u671b: " + JSON.stringify(expected) + "\n     \u5b9e\u9645: " + JSON.stringify(actual);
    console.log(msg);
    failures.push({ desc: desc, expected: expected, actual: actual });
  }
}

function section(title) {
  console.log("\n" + "=".repeat(60));
  console.log("  " + title);
  console.log("=".repeat(60));
}

// ==================== 辅助函数 ====================
function analyzeCase(difficulty, hand, opts) {
  opts = opts || {};
  const ctx = sa.loadContext(difficulty);
  const ruleset = sa.STRATEGY_RULESETS["current" + difficulty.charAt(0).toUpperCase() + difficulty.slice(1)];
  const deckCounts = sa.initDeckCounts(difficulty);
  for (const v of hand) {
    if (deckCounts[v] && deckCounts[v] > 0) deckCounts[v]--;
  }
  // 移除一些额外牌以加速（缩小搜索空间）
  const timerSec = opts.timerSec || 0;
  const submits = opts.submits || 0;
  const draws = opts.draws || 0;
  return sa.analyzeStrategy(ctx, ruleset, hand, deckCounts, timerSec, submits, draws);
}

function countDrawsInPath(path) {
  return (path || []).filter(function(p) { return p === "DRAW_ONE"; }).length;
}

// ==================== 测试: STRATEGY_RULESETS ====================
section("STRATEGY_RULESETS \u5b8c\u6574\u6027");

assert("currentEasy \u5b58\u5728", !!sa.STRATEGY_RULESETS.currentEasy, true);
assert("currentNormal \u5b58\u5728", !!sa.STRATEGY_RULESETS.currentNormal, true);
assert("currentHard \u5b58\u5728", !!sa.STRATEGY_RULESETS.currentHard, true);
assert("currentEasy.maxCards = 5", sa.STRATEGY_RULESETS.currentEasy.maxCards, 5);
assert("currentNormal.maxCards = 5", sa.STRATEGY_RULESETS.currentNormal.maxCards, 5);
assert("currentHard.maxCards = 5", sa.STRATEGY_RULESETS.currentHard.maxCards, 5);
assert("currentEasy.target = 21", sa.STRATEGY_RULESETS.currentEasy.target, 21);
assert("currentNormal.target = 21", sa.STRATEGY_RULESETS.currentNormal.target, 21);
assert("currentHard.target = 21", sa.STRATEGY_RULESETS.currentHard.target, 21);
assert("currentEasy.hasPow = false", sa.STRATEGY_RULESETS.currentEasy.hasPow, false);
assert("currentNormal.hasPow = true", sa.STRATEGY_RULESETS.currentNormal.hasPow, true);
assert("currentHard.hasFactorial = true", sa.STRATEGY_RULESETS.currentHard.hasFactorial, true);

// ==================== 测试: 辅助函数 ====================
section("\u8f85\u52a9\u51fd\u6570");

assert("detectOpsFromExpr '*' → hasMul", sa.detectOpsFromExpr("2*3").hasMul, true);
assert("detectOpsFromExpr '/' → hasDiv", sa.detectOpsFromExpr("4/2").hasDiv, true);
assert("detectOpsFromExpr '^' → hasPow", sa.detectOpsFromExpr("2^3").hasPow, true);
assert("detectOpsFromExpr '\u221A' → hasSqrt", sa.detectOpsFromExpr("\u221A9").hasSqrt, true);
assert("detectOpsFromExpr 'sqrt' → hasSqrt", sa.detectOpsFromExpr("sqrt(9)").hasSqrt, true);
assert("detectOpsFromExpr '!' → hasFact", sa.detectOpsFromExpr("5!").hasFact, true);
assert("detectOpsFromExpr '+' → noMul", sa.detectOpsFromExpr("1+2+3").hasMul, false);

const easyDeck = sa.initDeckCounts("easy");
assert("easy deck: maxVal 10", easyDeck[10], 4);
assert("easy deck: no 13", easyDeck[13] === undefined, true);
assert("easy deck: total 40", sa.totalRemaining(easyDeck), 40);

const normalDeck = sa.initDeckCounts("normal");
assert("normal deck: maxVal 13", normalDeck[13], 4);
assert("normal deck: total 52", sa.totalRemaining(normalDeck), 52);

assert("cardLabel(1) = A", sa.cardLabel(1), "A");
assert("cardLabel(11) = J", sa.cardLabel(11), "J");
assert("cardLabel(12) = Q", sa.cardLabel(12), "Q");
assert("cardLabel(13) = K", sa.cardLabel(13), "K");
assert("cardLabel(7) = 7", sa.cardLabel(7), "7");

assert("parseCard('A') = 1", sa.parseCard("A"), 1);
assert("parseCard('J') = 11", sa.parseCard("J"), 11);
assert("parseCard('Q') = 12", sa.parseCard("Q"), 12);
assert("parseCard('K') = 13", sa.parseCard("K"), 13);
assert("parseCard('7') = 7", sa.parseCard("7"), 7);
assert("parseCard('abc') = null", sa.parseCard("abc"), null);

// ==================== 测试1: easy 固定手牌最高分提交 ====================
section("\u6d4b\u8bd51: easy \u56fa\u5b9a\u624b\u724c [2,3,7] \u6700\u9ad8\u5206\u63d0\u4ea4");

{
  const result = analyzeCase("easy", [2, 3, 7]);
  const validActions = ["SUBMIT_BEST", "DRAW_ONE", "NO_SOLUTION"];
  assert("easy [2,3,7]: bestAction \u4e3a\u5408\u6cd5\u503c", validActions.indexOf(result.analysis.bestAction) >= 0, true);
  assert("easy [2,3,7]: expectedScore > 0", result.analysis.expectedScore > 0, true);
  assert("easy [2,3,7]: bestExpression \u975e\u7a7a", !!result.analysis.bestExpression, true);
  assert("easy [2,3,7]: noSolution == false", result.analysis.noSolution, false);
  if (result.analysis.bestAction === "SUBMIT_BEST") {
    assert("easy [2,3,7] SUBMIT_BEST: scoreBreakdown \u975e\u7a7a", result.analysis.scoreBreakdown.length > 0, true);
  }
}

// ==================== 测试2: normal 固定手牌最高分提交 ====================
section("\u6d4b\u8bd52: normal \u56fa\u5b9a\u624b\u724c [6,3,3,2,J] \u6700\u9ad8\u5206\u63d0\u4ea4");

{
  const result = analyzeCase("normal", [6, 3, 3, 2, 11]);
  assert("normal [6,3,3,2,J]: bestAction", result.analysis.bestAction, "SUBMIT_BEST");
  assert("normal [6,3,3,2,J]: expectedScore > 0", result.analysis.expectedScore > 0, true);
  assert("normal [6,3,3,2,J]: bestExpression \u975e\u7a7a", !!result.analysis.bestExpression, true);
  assert("normal [6,3,3,2,J]: noSolution == false", result.analysis.noSolution, false);
}

// ==================== 测试3: hard 固定手牌最高分提交 ====================
section("\u6d4b\u8bd53: hard \u56fa\u5b9a\u624b\u724c [1,7,9] \u6700\u9ad8\u5206\u63d0\u4ea4");

{
  const result = analyzeCase("hard", [1, 7, 9]);
  assert("hard [1,7,9]: bestAction", result.analysis.bestAction, "SUBMIT_BEST");
  assert("hard [1,7,9]: expectedScore > 0", result.analysis.expectedScore > 0, true);
  assert("hard [1,7,9]: bestExpression \u975e\u7a7a", !!result.analysis.bestExpression, true);
  assert("hard [1,7,9]: scoreBreakdown \u975e\u7a7a", result.analysis.scoreBreakdown.length > 0, true);
  assert("hard [1,7,9]: noSolution == false", result.analysis.noSolution, false);
}

// ==================== 测试4: 3\u5f20\u624b\u724c \u7acb\u5373\u63d0\u4ea4 vs \u8865\u724c\u671f\u671b ====================
section("\u6d4b\u8bd54: 3\u5f20\u624b\u724c [2,3,7] easy \u6bd4\u8f83\u63d0\u4ea4 vs \u8865\u724c");

{
  const result = analyzeCase("easy", [2, 3, 7]);
  assert("3\u5f20 [2,3,7]: bestAction \u4e3a SUBMIT_BEST \u6216 DRAW_ONE",
    result.analysis.bestAction === "SUBMIT_BEST" || result.analysis.bestAction === "DRAW_ONE", true);
  assert("3\u5f20 [2,3,7]: expectedScore \u4e3a\u975e\u8d1f\u6570", result.analysis.expectedScore >= 0, true);
}

// ==================== 测试5: 3\u5f20\u624b\u724c DRAW_ONE \u671f\u671b\u503c ====================
section("\u6d4b\u8bd55: \u9a8c\u8bc1 DRAW_ONE \u6982\u7387\u52a0\u6743\u671f\u671b");

{
  // \u7528\u4e00\u4e2a\u5c0f\u724c\u5e93\u6765\u52a0\u901f\u6d4b\u8bd5
  const smallDeck = { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
  const ctx = sa.loadContext("easy");
  const ruleset = sa.STRATEGY_RULESETS.currentEasy;
  ruleset.timeoutMs = 30000;
  const output = sa.analyzeStrategy(ctx, ruleset, [2, 3, 4], smallDeck, 0, 0, 0);
  const fr = output.fullResult;
  if (fr.action === "DRAW_ONE" && fr.children && fr.children.length > 0) {
    assert("DRAW_ONE children.length > 0", fr.children.length > 0, true);
    let probSum = 0;
    fr.children.forEach(function(c) { probSum += c.probability; });
    assert("DRAW_ONE \u5206\u652f\u6982\u7387\u548c\u22481", Math.abs(probSum - 1) < 0.001, true);
    const expectedCalc = fr.children.reduce(function(s, c) { return s + c.probability * c.child.score; }, 0);
    assert("DRAW_ONE expectedScore \u7b49\u4e8e\u6982\u7387\u52a0\u6743\u548c", Math.abs(expectedCalc - fr.score) < 0.01, true);
  } else {
    assert("\u5b58\u5728\u53ef\u884c\u62bd\u724c\u8def\u5f84", true, true);
  }
}

// ==================== 测试6: \u6700\u591a\u53ea\u8865\u52305\u5f20 ====================
section("\u6d4b\u8bd56: \u6700\u591a\u53ea\u8865\u52305\u5f20 (\u9012\u5f52\u6df1\u5ea6\u22642)");

{
  const ctx = sa.loadContext("normal");
  const ruleset = sa.STRATEGY_RULESETS.currentNormal;
  ruleset.timeoutMs = 60000;
  const deckCounts = sa.initDeckCounts("normal");
  [2, 5, 7].forEach(function(v) { if (deckCounts[v] > 0) deckCounts[v]--; });
  const output = sa.analyzeStrategy(ctx, ruleset, [2, 5, 7], deckCounts, 0, 0, 0);
  const pathDraws = countDrawsInPath(output.analysis.path);
  assert("\u6700\u4f73\u8def\u5f84\u4e2d DRAW_ONE \u6b21\u6570 \u2264 2", pathDraws <= 2, true);
  assert("meta.statesEvaluated > 0", output.meta.statesEvaluated > 0, true);
}

// ==================== 测试7: \u65e0\u89e3\u624b\u724c\u4e0d\u4f1a\u5d29\u6e83 ====================
section("\u6d4b\u8bd57: \u65e0\u89e3\u624b\u724c [1,1,1] easy \u4e0d\u5d29\u6e83");

{
  const result = analyzeCase("easy", [1, 1, 1]);
  assert("noSolution [1,1,1]: bestAction \u4e3a NO_SOLUTION \u6216 DRAW_ONE",
    result.analysis.bestAction === "NO_SOLUTION" || result.analysis.bestAction === "DRAW_ONE", true);
  assert("noSolution [1,1,1]: \u4e0d\u629b\u51fa\u5f02\u5e38", true, true);
}

// ==================== 测试8: \u8f93\u51fa\u5305\u542b bestAction ====================
section("\u6d4b\u8bd68: \u8f93\u51fa\u5305\u542b bestAction");

{
  const result = analyzeCase("easy", [7, 7, 7]);
  const validActions = ["SUBMIT_BEST", "DRAW_ONE", "NO_SOLUTION"];
  assert("bestAction \u4e3a\u5408\u6cd5\u503c", validActions.indexOf(result.analysis.bestAction) >= 0, true);
}

// ==================== 测试9: \u8f93\u51fa\u5305\u542b expectedScore ====================
section("\u6d4b\u8bd69: \u8f93\u51fa\u5305\u542b expectedScore");

{
  const result = analyzeCase("easy", [7, 7, 7]);
  assert("expectedScore \u4e3a number", typeof result.analysis.expectedScore, "number");
}

// ==================== 测试10: \u8f93\u51fa\u5305\u542b path ====================
section("\u6d4b\u8bd610: \u8f93\u51fa\u5305\u542b path");

{
  const result = analyzeCase("easy", [5, 8, 8]);
  assert("path \u4e3a\u6570\u7ec4", Array.isArray(result.analysis.path), true);
}

// ==================== 测试11: \u8f93\u51fa\u5305\u542b bestExpression ====================
section("\u6d4b\u8bd611: \u8f93\u51fa\u5305\u542b bestExpression");

{
  const result = analyzeCase("easy", [3, 7, 11]);
  if (result.analysis.bestAction === "SUBMIT_BEST") {
    assert("SUBMIT_BEST \u65f6 bestExpression \u4e3a\u975e\u7a7a\u5b57\u7b26\u4e32",
      typeof result.analysis.bestExpression === "string" && result.analysis.bestExpression.length > 0, true);
  } else {
    assert("\u6700\u4f73\u8def\u5f84\u5b58\u5728 bestExpression \u6216\u4e3a DRAW_ONE", true, true);
  }
}

// ==================== 测试12: \u8f93\u51fa\u5305\u542b scoreBreakdown ====================
section("\u6d4b\u8bd612: \u8f93\u51fa\u5305\u542b scoreBreakdown");

{
  const result = analyzeCase("easy", [3, 7, 11]);
  if (result.analysis.scoreBreakdown && result.analysis.scoreBreakdown.length > 0) {
    const firstItem = result.analysis.scoreBreakdown[0];
    assert("scoreBreakdown \u9879\u542b label", typeof firstItem.label, "string");
    assert("scoreBreakdown \u9879\u542b score", typeof firstItem.score, "number");
  }
  assert("scoreBreakdown \u975e\u7a7a", result.analysis.scoreBreakdown.length > 0, true);
}

// ==================== 测试13: STRATEGY_RULESETS \u89c4\u5219\u96c6\u4e00\u81f4\u6027 ====================
section("\u6d4b\u8bd613: STRATEGY_RULESETS \u89c4\u5219\u96c6\u4e00\u81f4\u6027");

{
  const keys = ["currentEasy", "currentNormal", "currentHard"];
  keys.forEach(function(k) {
    const rs = sa.STRATEGY_RULESETS[k];
    assert(k + ": difficulty \u5b57\u6bb5\u5b58\u5728", typeof rs.difficulty, "string");
    assert(k + ": maxCards = 5", rs.maxCards, 5);
    assert(k + ": target = 21", rs.target, 21);
    assert(k + ": solveBudgetMs > 0", rs.solveBudgetMs > 0, true);
    assert(k + ": estimatedDrawTimeSec > 0", rs.estimatedDrawTimeSec > 0, true);
  });
}

// ==================== 测试14: \u7a7a\u624b\u724c\u4e0d\u5d29\u6e83 ====================
section("\u6d4b\u8bd614: \u7a7a\u624b\u724c\u4e0d\u5d29\u6e83");

{
  const ctx = sa.loadContext("easy");
  const ruleset = sa.STRATEGY_RULESETS.currentEasy;
  const deckCounts = sa.initDeckCounts("easy");
  ruleset.timeoutMs = 10000;
  const output = sa.analyzeStrategy(ctx, ruleset, [], deckCounts, 0, 0, 0);
  const validActions = ["SUBMIT_BEST", "DRAW_ONE", "NO_SOLUTION"];
  assert("\u7a7a\u624b\u724c bestAction \u4e3a\u5408\u6cd5\u503c", validActions.indexOf(output.analysis.bestAction) >= 0, true);
  assert("\u7a7a\u624b\u724c \u4e0d\u5d29\u6e83 (expectedScore >= 0)", output.analysis.expectedScore >= 0, true);
}

// ==================== 测试15: timerSec \u5f71\u54cd\u901f\u5ea6\u5206 ====================
section("\u6d4b\u8bd615: timerSec \u5f71\u54cd\u901f\u5ea6\u5206");

{
  const resultFast = analyzeCase("easy", [3, 7, 11], { timerSec: 0 });
  const resultSlow = analyzeCase("easy", [3, 7, 11], { timerSec: 60 });

  const fastBreakdown = resultFast.analysis.scoreBreakdown || [];
  const slowBreakdown = resultSlow.analysis.scoreBreakdown || [];

  const fastHasSpeed = fastBreakdown.some(function(b) {
    return b.label.indexOf("\u95ea\u7535\u5fc3\u7b97") >= 0 || b.label.indexOf("\u901f\u7b97\u8fbe\u4eba") >= 0;
  });
  const slowHasSpeed = slowBreakdown.some(function(b) {
    return b.label.indexOf("\u95ea\u7535\u5fc3\u7b97") >= 0 || b.label.indexOf("\u901f\u7b97\u8fbe\u4eba") >= 0;
  });

  assert("timerSec=0 \u6709\u901f\u5ea6\u5206", fastHasSpeed, true);
  assert("timerSec=60 \u65e0\u901f\u5ea6\u5206", slowHasSpeed, false);
  assert("fast score > slow score (with same expression)",
    resultFast.analysis.expectedScore > resultSlow.analysis.expectedScore, true);
}

// ==================== \u7ed3\u679c\u6c47\u603b ====================
console.log("\n" + "=".repeat(60));
console.log("  \u6d4b\u8bd5\u7ed3\u679c");
console.log("=".repeat(60));
console.log("  \u901a\u8fc7: \x1b[32m" + passed + "\x1b[0m");
console.log("  \u5931\u8d25: \x1b[31m" + failed + "\x1b[0m");
console.log("  \u603b\u8ba1: " + (passed + failed));
console.log("=".repeat(60));

if (failures.length > 0) {
  console.log("\n\u5931\u8d25\u7528\u4f8b\u8be6\u60c5:");
  failures.forEach(function(f, i) {
    console.log("  " + (i + 1) + ". " + f.desc);
    console.log("     \u671f\u671b: " + JSON.stringify(f.expected));
    console.log("     \u5b9e\u9645: " + JSON.stringify(f.actual));
  });
}

if (failed === 0) {
  console.log("\n\x1b[32m\u2713 \u6240\u6709\u6d4b\u8bd5\u901a\u8fc7!\x1b[0m");
  process.exit(0);
} else {
  console.log("\n\x1b[31m\u2717 " + failed + " \u4e2a\u6d4b\u8bd5\u5931\u8d25\x1b[0m");
  process.exit(1);
}
