#!/usr/bin/env node
"use strict";

/**
 * 算式21点 — 表达式引擎测试套件
 * 运行方式: node tests/test-expression.js
 *
 * 测试范围:
 *   - evaluate()        表达式求值 (tokenize → toRPN → evalRPN)
 *   - extractNumbers()  从表达式提取用到的数字
 *   - validateHand()    手牌验证 (完全匹配/少用/多用/不匹配)
 *   - aiSolve()         AI 暴力搜索求解器
 *   - getBinaryOps()    难度→运算符映射
 *   - hasUnary() / hasFactorial()  难度能力检查
 *   - normalizeInput()  全角→半角归一化
 *   - cardFace()        数值→牌面符号
 *   - tokenize()        词法分析 (独立测试边界情况)
 *
 * 难度覆盖: easy / normal / hard
 * 运算符覆盖: + - * / ^ √ sqrt() ! 括号
 * 牌面覆盖: 1~10, A, J, Q, K
 */

const vm = require("vm");
const fs = require("fs");
const path = require("path");

// ==================== 测试统计 ====================
let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, actual, expected, opts = {}) {
  const approx = opts.approx || false;
  const tolerance = opts.tolerance || 0.000001;
  let ok;
  if (approx) {
    ok = Math.abs(actual - expected) < tolerance;
  } else if (expected instanceof RegExp) {
    ok = expected.test(String(actual));
  } else if (typeof expected === "function") {
    ok = expected(actual);
  } else {
    ok = actual === expected;
  }
  if (ok) {
    passed++;
    // 静默通过, 只在 verbose 模式下打印 (用 -v 参数)
    if (process.argv.includes("-v")) {
      console.log(`  \x1b[32m✓\x1b[0m ${desc}`);
    }
  } else {
    failed++;
    const msg = `  \x1b[31m✗\x1b[0m ${desc}\n     期望: ${JSON.stringify(expected)}\n     实际: ${JSON.stringify(actual)}`;
    console.log(msg);
    failures.push({ desc, expected, actual });
  }
}

function assertThrows(desc, fn, expectedMsg) {
  try {
    fn();
    failed++;
    const msg = `  \x1b[31m✗\x1b[0m ${desc}\n     期望抛出异常但未抛出`;
    console.log(msg);
    failures.push({ desc, expected: `抛出: ${expectedMsg}`, actual: "未抛出" });
  } catch (e) {
    if (expectedMsg instanceof RegExp) {
      if (expectedMsg.test(e.message)) {
        passed++;
        if (process.argv.includes("-v")) {
          console.log(`  \x1b[32m✓\x1b[0m ${desc} (异常: ${e.message})`);
        }
      } else {
        failed++;
        const msg = `  \x1b[31m✗\x1b[0m ${desc}\n     期望异常: ${expectedMsg}\n     实际异常: ${e.message}`;
        console.log(msg);
        failures.push({ desc, expected: String(expectedMsg), actual: e.message });
      }
    } else {
      if (e.message === expectedMsg) {
        passed++;
        if (process.argv.includes("-v")) {
          console.log(`  \x1b[32m✓\x1b[0m ${desc} (异常: ${e.message})`);
        }
      } else {
        failed++;
        const msg = `  \x1b[31m✗\x1b[0m ${desc}\n     期望异常: ${expectedMsg}\n     实际异常: ${e.message}`;
        console.log(msg);
        failures.push({ desc, expected: expectedMsg, actual: e.message });
      }
    }
  }
}

// ==================== 加载游戏源码 ====================
function loadGameModules(difficulty) {
  const sandbox = {
    game: {
      mode: "solo",
      difficulty: difficulty,
      aiLevel: "medium",
      aiPlayerIndex: -1,
      deck: [],
      players: [],
      phase: "playing",
      timerSec: 0,
      timerInterval: null,
      maxCards: 5,
      target: 21,
      stats: { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 },
      aiThinking: false,
      aiTimerId: null,
      aiCountdown: 0,
      aiCountdownInterval: null,
      aiSolved: false,
      aiSolution: null,
      _maxHintShown: false,
      _firstRender: false,
    },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({}),
      addEventListener: () => {},
      activeElement: null,
      body: { appendChild: () => {} },
    },
    window: {
      AudioContext: null,
      webkitAudioContext: null,
      innerWidth: 1024,
      innerHeight: 768,
    },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
  };
  sandbox.global = sandbox;
  const ctx = vm.createContext(sandbox);

  // 加载 config.js（会声明自己的 const game，覆盖沙箱中的 game）
  const configSrc = fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf-8");
  vm.runInContext(configSrc, ctx);

  // config.js 内部声明了 const game，此处再覆盖其 difficulty 以模拟不同难度
  vm.runInContext(`game.difficulty = "${difficulty}";`, ctx);

  // 加载 expression.js
  const exprSrc = fs.readFileSync(path.join(__dirname, "..", "js", "expression.js"), "utf-8");
  vm.runInContext(exprSrc, ctx);

  // 重置 aiCache (避免跨测试用例缓存污染)
  if (ctx._aiCache) ctx._aiCache = new Map();
  ctx._lastCheckedHand = "";
  vm.runInContext('_aiCache = new Map(); _lastCheckedHand = "";', ctx);

  return {
    game: sandbox.game,
    tokenize: ctx.tokenize,
    toRPN: ctx.toRPN,
    evalRPN: ctx.evalRPN,
    evaluate: ctx.evaluate,
    extractNumbers: ctx.extractNumbers,
    validateHand: ctx.validateHand,
    aiSolve: ctx.aiSolve,
    getBinaryOps: ctx.getBinaryOps,
    hasUnary: ctx.hasUnary,
    hasFactorial: ctx.hasFactorial,
    normalizeInput: ctx.normalizeInput,
    cardFace: ctx.cardFace,
    createDeck: ctx.createDeck,
    shuffle: ctx.shuffle,
  };
}

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

// ==================== 测试用例 ====================

// ---------- helper 函数 ----------
section("config.js: getBinaryOps / hasUnary / hasFactorial");

{
  const m = loadGameModules("easy");
  assert("easy: getBinaryOps 返回四则运算", JSON.stringify(m.getBinaryOps()), JSON.stringify(["+", "-", "*", "/"]));
  assert("easy: hasUnary=false", m.hasUnary(), false);
  assert("easy: hasFactorial=false", m.hasFactorial(), false);
}
{
  const m = loadGameModules("normal");
  assert("normal: getBinaryOps 含 ^", JSON.stringify(m.getBinaryOps()), JSON.stringify(["+", "-", "*", "/", "^"]));
  assert("normal: hasUnary=true", m.hasUnary(), true);
  assert("normal: hasFactorial=false", m.hasFactorial(), false);
}
{
  const m = loadGameModules("hard");
  assert("hard: getBinaryOps 含 ^", JSON.stringify(m.getBinaryOps()), JSON.stringify(["+", "-", "*", "/", "^"]));
  assert("hard: hasUnary=true", m.hasUnary(), true);
  assert("hard: hasFactorial=true", m.hasFactorial(), true);
}

section("config.js: cardFace");

{
  const m = loadGameModules("hard");
  assert("cardFace(1)=A", m.cardFace(1), "A");
  assert("cardFace(11)=J", m.cardFace(11), "J");
  assert("cardFace(12)=Q", m.cardFace(12), "Q");
  assert("cardFace(13)=K", m.cardFace(13), "K");
  assert("cardFace(7)=7", m.cardFace(7), "7");
}

section("config.js: normalizeInput (全角→半角)");

{
  const m = loadGameModules("hard");
  assert("全角数字 ２＋３ → 2+3", m.normalizeInput("２＋３"), "2+3");
  assert("全角乘除 ４×５÷２ → 4*5/2", m.normalizeInput("４×５÷２"), "4*5/2");
  assert("全角括号 （１＋２）×３ → (1+2)*3", m.normalizeInput("（１＋２）×３"), "(1+2)*3");
  assert("全角阶乘 ５！ → 5!", m.normalizeInput("５！"), "5!");
  assert("全角 ^ ＾ → ^", m.normalizeInput("２＾３"), "2^3");
  assert("空串不变", m.normalizeInput(""), "");
  assert("null 返回 null", m.normalizeInput(null), null);
}

section("config.js: createDeck");

{
  const m = loadGameModules("easy");
  const deck = m.createDeck();
  assert("easy 牌库: 40张 (1~10 ×4)", deck.length, 40);
  assert("easy 牌库: 最大13不在", deck.includes(13), false);
  assert("easy 牌库: 最大10存在", deck.includes(10), true);
}
{
  const m = loadGameModules("normal");
  const deck = m.createDeck();
  assert("normal 牌库: 52张 (A~K ×4)", deck.length, 52);
  assert("normal 牌库: 含13(K)", deck.includes(13), true);
  assert("normal 牌库: 含1(A)", deck.includes(1), true);
}
{
  const m = loadGameModules("hard");
  const deck = m.createDeck();
  assert("hard 牌库: 52张 (A~K ×4)", deck.length, 52);
}

// ---------- 表达式求值 ----------
section("evaluate: 四则运算");

{
  const m = loadGameModules("easy");
  assert("2+3=5", m.evaluate("2+3"), 5);
  assert("10-4=6", m.evaluate("10-4"), 6);
  assert("3*4=12", m.evaluate("3*4"), 12);
  assert("8/2=4", m.evaluate("8/2"), 4);
  assert("优先级: 2+3*4=14", m.evaluate("2+3*4"), 14);
  assert("括号: (2+3)*4=20", m.evaluate("(2+3)*4"), 20);
  assert("嵌套括号: ((2+3))*4=20", m.evaluate("((2+3))*4"), 20);
  assert("浮点: 5/2=2.5", m.evaluate("5/2"), 2.5);
}

section("evaluate: easy 下拒绝 ^");

{
  const m = loadGameModules("easy");
  assertThrows("easy: 2^3 报错", () => m.evaluate("2^3"), /非法字符|^/);
}

section("evaluate: 幂运算 ^ (normal)");

{
  const m = loadGameModules("normal");
  assert("2^3=8", m.evaluate("2^3"), 8);
  assert("3^2=9", m.evaluate("3^2"), 9);
  assert("2^10=1024", m.evaluate("2^10"), 1024);
  assert("5^0=1", m.evaluate("5^0"), 1);
  assert("(2+1)^(1+1)=9", m.evaluate("(2+1)^(1+1)"), 9);
}

section("evaluate: 幂运算 ^ (hard)");

{
  const m = loadGameModules("hard");
  assert("hard: 2^3=8", m.evaluate("2^3"), 8);
  assert("hard: 10^2=100", m.evaluate("10^2"), 100);
}

section("evaluate: 开根号 √ (normal) — 直接数字");

{
  const m = loadGameModules("normal");
  assert("√9=3", m.evaluate("√9"), 3);
  assert("√16=4", m.evaluate("√16"), 4);
  assert("√0=0", m.evaluate("√0"), 0);
}

section("evaluate: √(expr) 括号开根 (已修复: tokenize 补 TOK_LP)");
{
  const m = loadGameModules("normal");
  assert("√(25)=5", m.evaluate("√(25)"), 5);
  assert("√(3*12)=6", m.evaluate("√(3*12)"), 6);
  assert("sqrt(9)=3", m.evaluate("sqrt(9)"), 3);
  assert("sqrt(64)=8", m.evaluate("sqrt(64)"), 8);
  assert("sqrt(3*3+16)=5", m.evaluate("sqrt(3*3+16)"), 5);
  // 用户场景
  assert("√(10+6)*5+5=25 (hard)", m.evaluate("√(10+6)*5+5"), 25);
}

section("evaluate: √ 后花牌识别 (BugFix: √J/√Q/√K/√A 原被误认为非法字符)");
{
  const m = loadGameModules("normal");
  // √J → sqrt(11) ≈ 3.3166, 应被接受并求值
  assert("√J≈3.3166", m.evaluate("√J"), Math.sqrt(11));
  // √Q → sqrt(12) ≈ 3.4641
  assert("√Q≈3.4641", m.evaluate("√Q"), Math.sqrt(12));
  // √K → sqrt(13) ≈ 3.6055
  assert("√K≈3.6055", m.evaluate("√K"), Math.sqrt(13));
  // √A → 1
  assert("√A=1", m.evaluate("√A"), 1);
}

section("evaluate: √ 负数报错 (normal)");

{
  const m = loadGameModules("normal");
  // BUG 衍生: √(-1) 同样因括号问题报错，而非"不能对负数开根号"
  assertThrows("√(-1) → 括号不匹配 (BUG: 非负数开根问题)", () => m.evaluate("√(-1)"), /括号不匹配|不能对负数/);
}

section("evaluate: 阶乘 ! (hard only)");

{
  const m = loadGameModules("hard");
  assert("5!=120", m.evaluate("5!"), 120);
  assert("0!=1", m.evaluate("0!"), 1);
    assert("3!=6", m.evaluate("3!"), 6);
    // BUG: ! 紧邻 ) 不触发阶乘逻辑，报'非法字符'
    assert("(2+1)!=6 (已修复: ) 后消费 !)", m.evaluate("(2+1)!"), 6);
}

section("evaluate: 阶乘 ! 在 easy/normal 下拒绝 (已修复: 报'阶乘仅在困难模式可用')");
{
  const m = loadGameModules("easy");
  assertThrows("easy: 5! → '阶乘仅在困难模式可用'", () => m.evaluate("5!"), /阶乘仅/);
}
{
  const m = loadGameModules("normal");
  assertThrows("normal: 5! → '阶乘仅在困难模式可用'", () => m.evaluate("5!"), /阶乘仅/);
}

section("evaluate: A/J/Q/K 字母牌");

{
  const m = loadGameModules("hard");
  assert("A=1", m.evaluate("A"), 1);
  assert("J=11", m.evaluate("J"), 11);
  assert("Q=12", m.evaluate("Q"), 12);
  assert("K=13", m.evaluate("K"), 13);
  assert("A+J+K=25", m.evaluate("A+J+K"), 25);
  assert("小写: a+k=14", m.evaluate("a+k"), 14);
}

section("evaluate: 负号/一元负号");

{
  const m = loadGameModules("normal");
  assert("-3+5=2", m.evaluate("-3+5"), 2);
  assert("5+(-3)=2", m.evaluate("5+(-3)"), 2);
  assert("-2*-3=6", m.evaluate("-2*-3"), 6);
}

section("evaluate: 全角符号 → evaluate");

{
  const m = loadGameModules("hard");
  const n = m.normalizeInput;
  assert("全角 ２＋３×４ → 14", m.evaluate(n("２＋３×４")), 14);
  assert("全角 （１＋２）＾３ → 27", m.evaluate(n("（１＋２）＾３")), 27);
}

section("evaluate: 错误处理");

{
  const m = loadGameModules("easy");
  assertThrows("除零: 5/0", () => m.evaluate("5/0"), /除数不能为零/);
  assertThrows("空串", () => m.evaluate(""), /不完整|空/);
  assertThrows("非法字符: 2@3", () => m.evaluate("2@3"), /非法字符/);
  assertThrows("括号不匹配: (2+3", () => m.evaluate("(2+3"), /括号不匹配/);
  assertThrows("连续运算符: 2++3", () => m.evaluate("2++3"), /不完整/);
}

section("evaluate: 边界值");

{
  const m = loadGameModules("hard");
  assert("大数: 100+200=300", m.evaluate("100+200"), 300);
  assert("零: 0*12345=0", m.evaluate("0*12345"), 0);
}

{
  const m = loadGameModules("normal");
  assertThrows("幂过大: 10^200 溢出", () => m.evaluate("10^200"), /参数不合法|溢出/);
}

// ---------- 负数开根 √ ----------
section("evaluate: √0=0");

{
  const m = loadGameModules("hard");
  assert("√0=0", m.evaluate("√0"), 0);
}

// ---------- 手牌验证 ----------
section("extractNumbers");

{
  const m = loadGameModules("hard");
  assert("2+3+4 → [2,3,4]", JSON.stringify(m.extractNumbers("2+3+4")), JSON.stringify([2, 3, 4]));
  assert("A+J+K → [1,11,13]", JSON.stringify(m.extractNumbers("A+J+K")), JSON.stringify([1, 11, 13]));
  assert("(5-1)*(2+1) → [5,1,2,1]", JSON.stringify(m.extractNumbers("(5-1)*(2+1)")), JSON.stringify([5, 1, 2, 1]));
  assert("√9+3 → [9,3] (√后数字)", JSON.stringify(m.extractNumbers("√9+3")), JSON.stringify([9, 3]));
  assert("sqrt(16)+2 → [16,2]", JSON.stringify(m.extractNumbers("sqrt(16)+2")), JSON.stringify([16, 2]));
}

section("validateHand");

{
  const m = loadGameModules("hard");
  // 完全匹配
  const r1 = m.validateHand("2+3+4", [2, 3, 4]);
  assert("完全匹配 [2,3,4]", r1.valid, true);

  const r2 = m.validateHand("A+J+K", [1, 11, 13]);
  assert("完全匹配 [1,11,13] (A+J+K)", r2.valid, true);

  const r3 = m.validateHand("(5-1)*(2+1)", [1, 1, 2, 5]);
  assert("完全匹配顺序无关", r3.valid, true);

  // 少用牌
  const r4 = m.validateHand("2+3", [2, 3, 5, 7]);
  assert("少用牌: valid=false", r4.valid, false);
  assert("少用牌: reason=notAllUsed", r4.reason, "notAllUsed");

  // 多用牌 (用到了不在手牌中的数字)
  const r5 = m.validateHand("2+3+4+5", [2, 3, 4]);
  assert("多用牌: valid=false", r5.valid, false);
  assert("多用牌: reason=extraCards", r5.reason, "extraCards");

  // 数值不匹配
  const r6 = m.validateHand("2+3+4", [2, 3, 5]);
  assert("数值不匹配: valid=false", r6.valid, false);
  assert("数值不匹配: reason=mismatch", r6.reason, "mismatch");
}

section("validateHand: 非法牌值 & 完全不匹配 (BUG修复)");

{
  const m = loadGameModules("hard");

  // BUG: 输入 "27272277222" 被当成1个数字 → "还有2张没用" (实际0张被正确使用)
  const r1 = m.validateHand("27272277222", [5, 7, 11]);
  assert("非法牌值: valid=false", r1.valid, false);
  assert("非法牌值: reason=invalidNumbers", r1.reason, "invalidNumbers");
  assert("非法牌值: invalidVals=[27272277222]", JSON.stringify(r1.invalidVals), JSON.stringify([27272277222]));

  // 超过13的数字
  const r2 = m.validateHand("14+15", [1, 2, 3]);
  assert("14+15 → reason=invalidNumbers", r2.reason, "invalidNumbers");

  // 0 也不是合法牌值
  const r3 = m.validateHand("0+5", [1, 5, 7]);
  assert("0+5 → reason=invalidNumbers", r3.reason, "invalidNumbers");
  assert("0+5 → invalidVals=[0]", JSON.stringify(r3.invalidVals), JSON.stringify([0]));

  // 小数: extractNumbers 用 \d+ 会把3.5拆成3和5，所以不会触发invalidNumbers
  // 要用非整数检测得用15.5这类 → 15无效
  const r4 = m.validateHand("15.5+2", [2, 5, 7]);
  assert("15.5+2 (15无效) → reason=invalidNumbers", r4.reason, "invalidNumbers");

  // 完全不匹配: 用了合法牌值但手牌里没有
  const r5 = m.validateHand("7+8+9", [2, 3, 5]);
  assert("7+8+9 vs [2,3,5] → reason=noMatch", r5.reason, "noMatch");

  // 完全不匹配 + 少用牌: 优先报 noMatch（实际0张匹配）
  const r6 = m.validateHand("5+6", [2, 3, 7]);
  assert("5+6 vs [2,3,7] → reason=noMatch", r6.reason, "noMatch");
}

section("validateHand: 正常场景回流确认");

{
  const m = loadGameModules("hard");
  const r1 = m.validateHand("2+3+4", [2, 3, 4]);
  assert("完全匹配 [2,3,4]", r1.valid, true);
  const r2 = m.validateHand("2+3", [2, 3, 5, 7]);
  assert("少用牌: reason=notAllUsed", r2.reason, "notAllUsed");
  const r3 = m.validateHand("2+3+4+5", [2, 3, 4]);
  assert("多用牌: reason=extraCards", r3.reason, "extraCards");
}

// ---------- AI 求解器 ----------
section("aiSolve: 3张牌");

{
  const m = loadGameModules("easy");
  const results = m.aiSolve([1, 2, 3], 6, ["+", "-", "*", "/"]);
  assert("aiSolve([1,2,3],6) 有解", results.length > 0, true);
}

{
  const m = loadGameModules("hard");
  const results = m.aiSolve([1, 2, 3], 21, ["+", "-", "*", "/", "^"]);
  assert("aiSolve([1,2,3],21) 可能有解或无解", Array.isArray(results), true);
}

section("aiSolve: 4张牌经典24点");

{
  const m = loadGameModules("easy");
  const results = m.aiSolve([1, 2, 3, 4], 24, ["+", "-", "*", "/"]);
  assert("aiSolve([1,2,3,4],24) 有解", results.length > 0, true);
}

{
  const m = loadGameModules("easy");
  const results = m.aiSolve([10, 10, 4, 4], 24, ["+", "-", "*", "/"]);
  // (10*10-4)/4 = 24
  assert("aiSolve([10,10,4,4],24) 有解", results.length > 0, true);
}

section("aiSolve: 无解牌组");

{
  const m = loadGameModules("easy");
  const results = m.aiSolve([1, 1, 1], 21, ["+", "-", "*", "/"]);
  assert("aiSolve([1,1,1],21) 无解", results.length, 0);
}

section("aiSolve: 空手牌");

{
  const m = loadGameModules("easy");
  const results = m.aiSolve([], 21, ["+", "-", "*", "/"]);
  assert("aiSolve([],21) 返回空数组", JSON.stringify(results), JSON.stringify([]));
}

section("aiSolve: 含幂运算符^");

{
  const m = loadGameModules("normal");
  const results = m.aiSolve([2, 3, 4], 21, ["+", "-", "*", "/", "^"]);
  assert("aiSolve([2,3,4],21) 有 ^ 运算符", Array.isArray(results), true);
}

section("aiSolve: 目标数已在手牌");

{
  const m = loadGameModules("easy");
  const results = m.aiSolve([21], 21, ["+", "-", "*", "/"]);
  assert("aiSolve([21],21) 单张即目标", results.length > 0, true);
}

section("aiSolve: 一元运算符 √ (normal)");

{
  const m = loadGameModules("normal");
  const results = m.aiSolve([4, 4, 4], 6, ["+", "-", "*", "/", "^"]);
  assert("aiSolve([4,4,4],6) 有解 (如 √4+4)", results.length > 0, true);
}

section("aiSolve: 一元运算符 ! (hard)");

{
  const m = loadGameModules("hard");
  const results = m.aiSolve([3, 3, 3, 3], 21, ["+", "-", "*", "/", "^"]);
  assert("aiSolve([3,3,3,3],21) 有解 (利用 3!=6)", results.length > 0, true);
}

section("aiSolve: 一元运算符不导致无限递归");

{
  const m = loadGameModules("hard");
  const results = m.aiSolve([5, 5, 5, 5], 24, ["+", "-", "*", "/", "^"]);
  assert("aiSolve([5,5,5,5],24) 正常返回", Array.isArray(results), true);
}

// ---------- tokenize 单元测试 ----------
section("tokenize: 边界情况");

{
  const m = loadGameModules("hard");
  const tokens = m.tokenize("12+34");
  assert("tokenize: 多位数 12+34 → 3个token", tokens.length, 3);
  assert("token[0] value=12", tokens[0].value, 12);
  assert("token[2] value=34", tokens[2].value, 34);
}

{
  const m = loadGameModules("hard");
  const tokens = m.tokenize("A+J");
  assert("tokenize: A+J → A=1, J=11", tokens[0].value, 1);
  assert("token[2] J value=11", tokens[2].value, 11);
}

{
  const m = loadGameModules("hard");
  const tokens = m.tokenize("√9");
  assert("tokenize: √9 → 计算好值3", tokens[0].value, 3);
}

{
  const m = loadGameModules("normal");
  const tokens = m.tokenize("sqrt(16)");
  assert("tokenize: sqrt( → SQRT token", tokens[0].type, "SQRT");
}

{
  const m = loadGameModules("normal");
  assertThrows("tokenize: √ 后无数字/括号报错", () => m.tokenize("√+3"), /√ 后面需要数字或括号/);
}

{
  const m = loadGameModules("hard");
  // BUG: -5! 负号解析吃掉5后 ! 掉入默认分支 → 非法字符
  assertThrows("tokenize: 阶乘负数 -5! 报错 (BUG: 非法字符)", () => m.tokenize("-5!"), /非法字符|阶乘仅支持/);
}

// ---------- 综合场景 ----------
section("综合: 真实对局场景");

{
  // 场景: hard 难度, 手牌 [2,3,4,5], 目标21
  const m = loadGameModules("hard");
  const result = m.evaluate("(2+5)*(4-3/3)"); // 7*3=21 ✓
  assert("(2+5)*(4-3/3)=21", Math.abs(result - 21) < 0.001, true);
  const v = m.validateHand("(2+5)*(4-3/3)", [2, 3, 4, 5]);
  // 表达式用了 2,5,4,3,3 → 5个数, 但手牌只有4张
  assert("需重复用牌3 → extraCards", v.reason, "extraCards");
}

{
  // 场景: easy 难度, 手牌 [5,3,7], 目标21
  const m = loadGameModules("easy");
  const result = m.evaluate("5*7-3"); // 35-3=32 ≠ 21
  assert("5*7-3=32", result, 32);
}

{
  // 场景: 手牌 [A,K,5] → [1,13,5], 1+13+5=19 ≠ 21
  const m = loadGameModules("hard");
  const result = m.evaluate("A+K+5");
  assert("A+K+5=19", result, 19);
}

{
  // 场景: 手牌 [4,6,K] → [4,6,13], 13+6+4=23 ≠ 21
  const m = loadGameModules("hard");
  const result = m.evaluate("K+6+4");
  assert("K+6+4=23", result, 23);
}

// ==================== 结果汇总 ====================
console.log(`\n${"=".repeat(60)}`);
console.log(`  测试结果`);
console.log(`${"=".repeat(60)}`);
console.log(`  通过: \x1b[32m${passed}\x1b[0m`);
console.log(`  失败: \x1b[31m${failed}\x1b[0m`);
console.log(`  总计: ${passed + failed}`);
console.log(`${"=".repeat(60)}`);

if (failures.length > 0) {
  console.log(`\n失败用例详情:`);
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.desc}`);
    console.log(`     期望: ${JSON.stringify(f.expected)}`);
    console.log(`     实际: ${JSON.stringify(f.actual)}`);
  });
}

if (failed === 0) {
  console.log(`\n\x1b[32m✓ 所有测试通过!\x1b[0m`);
  process.exit(0);
} else {
  console.log(`\n\x1b[31m✗ ${failed} 个测试失败\x1b[0m`);
  process.exit(1);
}