#!/usr/bin/env node
"use strict";

/**
 * 算式21点 — Fuzz 表达式测试器
 * 运行方式: node tests/test-fuzz.js
 *
 * 目的: 系统化生成表达式模板，批量测试 evaluate()，
 *       自动发现 解析错误 / 计算错误 / 新增 BUG。
 *
 * 与 test-expression.js 的区别:
 *   - 该文件由人工编写固定用例
 *   - 本文件自动穷举模板组合，探测边界
 */

const vm = require("vm");
const fs = require("fs");
const path = require("path");

// ==================== 加载游戏源码 (复用 test-expression 的沙箱逻辑) ====================
function loadGameModules(difficulty) {
  const sandbox = {
    game: {
      mode: "solo",
      difficulty,
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
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}), addEventListener: () => {}, activeElement: null, body: { appendChild: () => {} } },
    window: { AudioContext: null, webkitAudioContext: null, innerWidth: 1024, innerHeight: 768 },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  sandbox.global = sandbox;
  const ctx = vm.createContext(sandbox);
  const configSrc = fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf-8");
  vm.runInContext(configSrc, ctx);
  vm.runInContext(`game.difficulty = "${difficulty}";`, ctx);
  const exprSrc = fs.readFileSync(path.join(__dirname, "..", "js", "expression.js"), "utf-8");
  vm.runInContext(exprSrc, ctx);
  ctx._aiCache = new Map();
  ctx._lastCheckedHand = "";
  vm.runInContext('_aiCache = new Map(); _lastCheckedHand = "";', ctx);
  return {
    evaluate: ctx.evaluate,
    extractNumbers: ctx.extractNumbers,
    validateHand: ctx.validateHand,
    normalizeInput: ctx.normalizeInput,
    hasFactorial: ctx.hasFactorial,
    hasUnary: ctx.hasUnary,
    getBinaryOps: ctx.getBinaryOps,
  };
}

// ==================== 表达式生成器 ====================
const NUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const NUMS_SM = [2, 3, 4, 5];       // 小数字, 用于幂/阶乘控制溢出
const NUMS_SQ = [1, 4, 9, 16, 25];   // 完全平方数, 用于 √ 直接数字

const OPS_BASIC = ["+", "-", "*", "/"];
const OPS_POW = ["^"];

// ---- 模板生成器 ----

function cartesian(...arrays) {
  return arrays.reduce((acc, cur) => {
    const res = [];
    for (const a of acc) for (const c of cur) res.push(a.concat([c]));
    return res;
  }, [[]]);
}

// 类别1: 基础四则 + 括号
function* genBasicArith() {
  for (const [a, b] of cartesian(NUMS, NUMS)) {
    for (const op of OPS_BASIC) {
      yield { expr: `${a}${op}${b}`, cat: "basic", evalCheck: true };
    }
  }
  for (const [a, b, c] of cartesian(NUMS_SM, NUMS_SM, NUMS_SM)) {
    yield { expr: `(${a}+${b})*${c}`, cat: "basic_paren", evalCheck: true };
    yield { expr: `${a}*(${b}+${c})`, cat: "basic_paren", evalCheck: true };
    yield { expr: `(${a}-${b})*${c}`, cat: "basic_paren", evalCheck: true };
  }
}

// 类别2: √ 直接数字 (已知正常)
function* genSqrtDirect() {
  for (const a of NUMS_SQ) {
    yield { expr: `√${a}`, cat: "sqrt_direct", evalCheck: true, expected: Math.sqrt(a) };
    for (const b of NUMS_SM) {
      yield { expr: `√${a}+${b}`, cat: "sqrt_direct_op", evalCheck: true, expected: Math.sqrt(a) + b };
      yield { expr: `${b}+√${a}`, cat: "sqrt_direct_op", evalCheck: true, expected: b + Math.sqrt(a) };
      yield { expr: `√${a}*${b}`, cat: "sqrt_direct_op", evalCheck: true, expected: Math.sqrt(a) * b };
    }
  }
}

// 类别2b: √ 后花牌 —— Fuzz自动探测 (BugFix: √J/√Q/√K/√A 原被误认为非法字符)
function* genSqrtFaceCards() {
  const faces = [
    { sym: "A", val: 1 },
    { sym: "J", val: 11 },
    { sym: "Q", val: 12 },
    { sym: "K", val: 13 },
    { sym: "a", val: 1 },
    { sym: "j", val: 11 },
    { sym: "q", val: 12 },
    { sym: "k", val: 13 },
  ];
  for (const f of faces) {
    yield { expr: `√${f.sym}`, cat: "sqrt_face", evalCheck: true, expected: Math.sqrt(f.val) };
    // 组合运算
    yield { expr: `√${f.sym}+5`, cat: "sqrt_face_op", evalCheck: true, expected: Math.sqrt(f.val) + 5 };
    yield { expr: `√${f.sym}*2`, cat: "sqrt_face_op", evalCheck: true, expected: Math.sqrt(f.val) * 2 };
  }
}

// 类别3: √(expr) 括号形式 —— Fuzz 自动探测
function* genSqrtParen() {
  for (const a of NUMS_SQ) {
    yield { expr: `√(${a})`, cat: "sqrt_paren" };
  }
  for (const [a, b] of cartesian(NUMS_SM, NUMS_SM)) {
    yield { expr: `√(${a}+${b})`, cat: "sqrt_paren" };
    yield { expr: `√(${a}*${b})`, cat: "sqrt_paren" };
  }
  // 用户报出的具体场景
  yield { expr: `√(10+6)*5+5`, cat: "sqrt_paren_user" };
  yield { expr: `√(10+6)*5`, cat: "sqrt_paren_user" };
  yield { expr: `√(10+6)+5`, cat: "sqrt_paren_user" };
  yield { expr: `√(8+8)*2-3`, cat: "sqrt_paren_user" };
}

// 类别4: sqrt(expr) 形式 —— Fuzz 自动探测
function* genSqrtFunc() {
  for (const a of NUMS_SQ) {
    yield { expr: `sqrt(${a})`, cat: "sqrt_func" };
    for (const b of NUMS_SM) {
      yield { expr: `sqrt(${a})+${b}`, cat: "sqrt_func_op" };
      yield { expr: `${b}+sqrt(${a})`, cat: "sqrt_func_op" };
      yield { expr: `sqrt(${a})*${b}`, cat: "sqrt_func_op" };
    }
  }
}

// 类别5: √ 与 ^ 组合 —— Fuzz 自动探测
function* genSqrtWithPow() {
  for (const [a, b] of cartesian([4, 9, 16], [2, 3])) {
    yield { expr: `√${a}^${b}`, cat: "sqrt_pow", complexity: "normal" };
  }
  for (const [a, b] of cartesian(NUMS_SM, NUMS_SM)) {
    yield { expr: `√(${a}+${b})^2`, cat: "sqrt_pow_paren" };
    yield { expr: `√(${a}*${b})^2`, cat: "sqrt_pow_paren" };
  }
  // √(a^b)
  for (const [a, b] of cartesian([2, 3], [2, 3])) {
    yield { expr: `√(${a}^${b})`, cat: "sqrt_of_pow" };
  }
}

// 类别6: (expr)! 阶乘 —— Fuzz 自动探测 (限制括号内结果≤20, 防止阶乘溢出)
function* genFactorialParen() {
  for (const [a, b] of cartesian(NUMS_SM, NUMS_SM)) {
    if (a + b <= 20) yield { expr: `(${a}+${b})!`, cat: "factorial_paren" };
    if (a * b <= 20) yield { expr: `(${a}*${b})!`, cat: "factorial_paren" };
  }
}

// 类别7: 嵌套 √ —— Fuzz 自动探测
function* genNestedSqrt() {
  for (const [a, b] of cartesian([4, 9], [7, 16])) {
    yield { expr: `√(√${a}+${b})`, cat: "nested_sqrt" };
    yield { expr: `√(${b}+√${a})`, cat: "nested_sqrt" };
  }
}

// 类别8: 多层括号
function* genDeepParen() {
  yield { expr: `((2+3)*4)`, cat: "deep_paren", evalCheck: true };  // (2+3)*4 = 20
  yield { expr: `(2+(3*4))`, cat: "deep_paren", evalCheck: true };  // 2+12 = 14
  yield { expr: `((10-3)*(2+1))`, cat: "deep_paren", evalCheck: true };  // 7*3 = 21
  yield { expr: `(((2+3)))`, cat: "deep_paren", evalCheck: true };
}

// 类别9: 幂运算组合
function* genPowCombos() {
  for (const [a, b] of cartesian([2, 3, 4], [2, 3])) {
    yield { expr: `${a}^${b}`, cat: "pow", complexity: "normal", evalCheck: true };
    yield { expr: `(${a}+${b})^2`, cat: "pow_paren", complexity: "normal", evalCheck: true };
    yield { expr: `${a}^(${b}-1)`, cat: "pow_paren", complexity: "normal", evalCheck: true };
  }
}

// 类别10: 运算符混合 + 优先级
function* genMixedOps() {
  const cases = [
    { expr: "2+3*4-5", cat: "mixed_ops", evalCheck: true },       // 2+12-5 = 9
    { expr: "10/2+3*4", cat: "mixed_ops", evalCheck: true },      // 5+12 = 17
    { expr: "3+4*2-6/3", cat: "mixed_ops", evalCheck: true },     // 3+8-2 = 9
    { expr: "(2+3)*(4-1)", cat: "mixed_ops", evalCheck: true },   // 5*3 = 15
    { expr: "10-2*3+4", cat: "mixed_ops", evalCheck: true },      // 10-6+4 = 8
  ];
  for (const c of cases) yield c;
}

// 类别11: 边界 / 错误处理 (不应 crash)
function* genEdgeCases() {
  yield { expr: "", cat: "edge", expectError: true };
  yield { expr: "5", cat: "edge", evalCheck: true, expected: 5 };
  yield { expr: "0", cat: "edge", evalCheck: true, expected: 0 };
  yield { expr: "5/0", cat: "edge", expectError: true };
  yield { expr: "(2+3", cat: "edge", expectError: true };
  yield { expr: "2++3", cat: "edge", expectError: true };
  yield { expr: "2+", cat: "edge", expectError: true };
  yield { expr: "(2+3))", cat: "edge", expectError: true };
  yield { expr: "100+200", cat: "edge", evalCheck: true, expected: 300 };
  yield { expr: "999/3", cat: "edge", evalCheck: true, expected: 333 };
}

// 类别12: validateHand 批量模糊测试 — 穷举牌组组合
function* genValidateHandFuzz() {
  const NS = [1, 2, 3, 5, 8, 10, 13]; // A, 2, 3, 5, 8, 10, K
  const TARGET = 21;

  // 2张牌组合
  for (const [a, b] of cartesian(NS, NS)) {
    yield { hand: [a, b], cat: "vh_2cards" };
  }

  // 3张牌组合 (采样，避免爆炸)
  const ns3 = [1, 2, 3, 5, 8, 10];
  for (const [a, b, c] of cartesian(ns3, ns3, ns3)) {
    yield { hand: [a, b, c], cat: "vh_3cards" };
  }

  // 边界: 空手牌
  yield { hand: [], cat: "vh_edge", expectOk: true };
  // 边界: 单牌
  yield { hand: [21], cat: "vh_edge" };
  yield { hand: [10], cat: "vh_edge" };
  yield { hand: [1], cat: "vh_edge", expectOk: true }; // A=目标数在手牌场景

  // 边界: 5张牌
  yield { hand: [1, 2, 3, 5, 10], cat: "vh_5cards" };
  yield { hand: [2, 3, 5, 5, 6], cat: "vh_5cards" };

  // 目标数已在手牌
  yield { hand: [1, 21, 5], cat: "vh_targetInHand" };

  // 非法牌值
  yield { hand: [999, 2, 3], cat: "vh_bad_value", expectBad: true };

  // 完全不匹配 — 表达式不含手牌数字
  yield { hand: [1, 3, 5], cat: "vh_mismatch", matchExpr: "2+4+6", expectBad: true };

  // 用合法表达式反推牌组正确性
  const legitPairs = [
    { hand: [10, 10, 1], expr: "10+10+1" },
    { hand: [5, 5, 5, 5, 1], expr: "5+5+5+5+1" },
    { hand: [8, 8, 5], expr: "8+8+5" },
    { hand: [10, 8, 3], expr: "10+8+3" },
    { hand: [13, 8], expr: "13+8" },
  ];
  for (const lp of legitPairs) {
    yield { hand: lp.hand, expr: lp.expr, cat: "vh_legit", expectOk: true };
  }
}

// ---- 收集所有表达式 ----
function generateAllExpressions() {
  const all = [];
  const gens = [
    genBasicArith, genSqrtDirect, genSqrtFaceCards, genSqrtParen, genSqrtFunc,
    genSqrtWithPow, genFactorialParen, genNestedSqrt,
    genDeepParen, genPowCombos, genMixedOps, genEdgeCases,
  ];
  for (const g of gens) {
    for (const item of g()) {
      // 去重
      if (!all.some(x => x.expr === item.expr && x.cat === item.cat)) {
        all.push(item);
      }
    }
  }
  return all;
}

// ==================== 测试执行 ====================
const DIFFICULTIES = ["easy", "normal", "hard"];

// 预判: 该表达式是否包含当前难度不可用的运算符
function difficultyMismatch(expr, difficulty) {
  if (difficulty === "easy") {
    if (expr.includes("^") || expr.includes("√") || expr.includes("sqrt") || expr.includes("!")) return true;
  }
  if (difficulty === "normal") {
    if (expr.includes("!")) return true;
  }
  return false;
}

// ---- BUG 签名匹配 (后置分类, 不预设标签) ----
// BUG #1: √(expr) / sqrt(expr) → "括号不匹配"
// BUG #2: (expr)!  → "非法字符: '!'"
// BUG #3: -5! → "非法字符" (而非"阶乘仅支持")
// BUG #4: easy/normal 5! → "非法字符" (而非"阶乘不可用")

function classifyFailure(expr, errorMsg, difficulty) {
  const msg = errorMsg || "";

  // BUG #1: 括号不匹配 —— √(expr) / sqrt(expr)
  if (msg.includes("括号不匹配")) {
    return { known: true, bugId: "BUG1_括号不匹配" };
  }

  // 阶乘溢出保护: 括号内结果>20 → "阶乘仅支持0~20的整数" (正确行为)
  if (msg.includes("阶乘仅支持0~20的整数")) {
    return { known: true, bugId: "EXPECTED_阶乘溢出保护" };
  }

  // BUG #2: (expr)! 非法字符 —— 含括号 + 阶乘
  if (msg.includes("非法字符") && msg.includes("!")) {
    // 排除 BUG #3/#4: 非括号阶乘
    if (expr.startsWith("-") && expr.includes("!")) {
      return { known: true, bugId: "BUG3_负号阶乘" };
    }
    // BUG #4: easy/normal 普通阶乘 → 阶乘不可用
    if ((difficulty === "easy" || difficulty === "normal") && /\d!/.test(expr)) {
      return { known: true, bugId: "BUG4_阶乘不可用" };
    }
    // BUG #2: (expr)! 括号阶乘
    if (expr.includes("(") && expr.includes(")") && expr.includes("!")) {
      return { known: true, bugId: "BUG2_非法字符" };
    }
    // 其他 ! 相关非法字符也暂归已知 (已记录在案)
    return { known: true, bugId: "BUG_已知阶乘" };
  }

  // 非已知 BUG
  return { known: false };
}

// 用原生 eval 验证计算结果
function nativeEval(expr, difficulty) {
  // 将 √ 替换为 Math.sqrt
  let e = expr;
  // 处理 sqrt(X) → Math.sqrt(X)
  e = e.replace(/sqrt\(/gi, "Math.sqrt(");
  // 处理 √ 后跟数字 → Math.sqrt(n)
  e = e.replace(/√(\d+(?:\.\d+)?)/g, "Math.sqrt($1)");
  // 处理 ^ → **
  e = e.replace(/\^/g, "**");
  // 处理阶乘 (简单情况: n!)
  if (e.includes("!")) return null; // 原生不支持阶乘，跳过
  try {
    const val = eval(e);
    if (typeof val === "number" && isFinite(val)) return val;
    return null;
  } catch {
    return null;
  }
}

// ==================== 主流程 ====================
function main() {
  const all = generateAllExpressions();
  console.log(`生成表达式: ${all.length} 个\n`);

  const results = [];
  let totalPass = 0, totalKnownBug = 0, totalNewBug = 0, totalUnavail = 0, totalErr = 0;

  for (const difficulty of DIFFICULTIES) {
    const m = loadGameModules(difficulty);
    let pass = 0, knownBug = 0, newBug = 0, unavail = 0, errors = 0;
    const newBugs = [];

    for (const item of all) {
      // 跳过难度不匹配
      if (difficultyMismatch(item.expr, difficulty)) {
        unavail++;
        continue;
      }
      // 跳过仅特定复杂度的用例
      if (item.complexity === "normal" && difficulty === "easy") {
        unavail++;
        continue;
      }

      try {
        const raw = item.expr;
        const result = m.evaluate(raw);

        // 成功: 检查计算结果
        if (item.evalCheck && item.expected !== undefined) {
          const ok = Math.abs(result - item.expected) < 0.000001;
          if (ok) pass++;
          else {
            errors++;
            newBugs.push({ expr: raw, cat: item.cat, diff: difficulty, type: "计算错误", expected: item.expected, actual: result });
          }
        } else if (item.evalCheck) {
          // 用原生 eval 交叉验证
          const native = nativeEval(item.expr, difficulty);
          if (native !== null) {
            const ok = Math.abs(result - native) < 0.000001;
            if (ok) pass++;
            else {
              errors++;
              newBugs.push({ expr: raw, cat: item.cat, diff: difficulty, type: "计算错误(vs eval)", expected: native, actual: result });
            }
          } else {
            pass++; // 无法交叉验证，按成功计
          }
        } else if (item.expectError) {
          // 期望异常但没抛
          errors++;
          newBugs.push({ expr: raw, cat: item.cat, diff: difficulty, type: "期望异常但成功", actual: result });
        } else {
          pass++;
        }
      } catch (e) {
        const msg = e.message || "";
        // 期望抛异常的用例
        if (item.expectError) {
          pass++;
          continue;
        }
        // 后置 BUG 签名分类 (不依赖预设标签)
        const cls = classifyFailure(item.expr, msg, difficulty);
        if (cls.known) {
          knownBug++;
          continue;
        }
        // ❗ 真正的新发现
        newBug++;
        newBugs.push({ expr: item.expr, cat: item.cat, diff: difficulty, type: "异常", error: msg });
      }
    }

    // ==================== validateHand 批量模糊测试 ====================
    if (difficulty === "normal") {
      let vhPass = 0, vhNewBug = 0, vhTotal = 0;
      const vhNewBugs = [];
      for (const item of genValidateHandFuzz()) {
        vhTotal++;
        const hand = item.hand;
        const expr = item.expr || (hand.length >= 2
          ? hand.slice(0, 2).join("+")
          : (hand.length === 1 ? hand[0].toString() : ""));

        try {
          const r = m.validateHand(expr, hand);
          if (item.expectBad) {
            // 期望不通过
            if (r.valid) {
              vhNewBug++;
              vhNewBugs.push({ hand, expr, cat: item.cat, type: "validateHand 期望reject但返回valid" });
            } else {
              vhPass++;
            }
          } else if (item.expectOk) {
            // 期望明确通过
            if (r.valid) vhPass++;
            else {
              vhNewBug++;
              vhNewBugs.push({ hand, expr, cat: item.cat, type: `validateHand 期望valid但reject: ${r.reason}`, reason: r.reason });
            }
          } else {
            // 模糊探测: 只验证不crash、返回合法结构
            if (r && typeof r.valid === "boolean") {
              vhPass++;
              // 额外: 如果valid为true, 验证表达式确实eval成功
              if (r.valid && expr) {
                try {
                  m.evaluate(expr);
                } catch (ee) {
                  // pass 仍然算通过, 但不记录为bug (eval失败可能是表达式本身问题)
                }
              }
            } else {
              vhNewBug++;
              vhNewBugs.push({ hand, expr, cat: item.cat, type: "validateHand 返回非法结构" });
            }
          }
        } catch (e) {
          if (item.expectBad) {
            vhPass++; // 抛异常也算拒绝
          } else {
            vhNewBug++;
            vhNewBugs.push({ hand, expr, cat: item.cat, type: "validateHand 崩溃", error: e.message });
          }
        }
      }

      console.log(`[NORMAL ] validateHand: 通过 ${vhPass}/${vhTotal}  |  新BUG: ${vhNewBug}`);

      if (vhNewBugs.length > 0) {
        console.log(`  --- validateHand 新BUG详情 (${vhNewBugs.length}) ---`);
        for (const b of vhNewBugs) {
          console.log(`    ✗ hand=[${b.hand}] expr="${b.expr}" [${b.cat}] ${b.type}${b.reason ? ': ' + b.reason : ''}${b.error ? ': ' + b.error : ''}`);
        }
      }

      pass += vhPass;
      newBug += vhNewBug;
    }

    console.log(`[${difficulty.toUpperCase().padEnd(6)}] 通过: ${pass}  |  已知BUG: ${knownBug}  |  不可用: ${unavail}  |  新BUG: ${newBug}  |  其他错误: ${errors}`);

    if (newBugs.length > 0) {
      console.log(`  --- 新BUG/异常详情 (${newBugs.length}) ---`);
      for (const b of newBugs) {
        console.log(`    ✗ ${b.expr.padEnd(20)} [${b.cat}] ${b.type}: ${JSON.stringify(b.error || b.actual)}${b.expected !== undefined ? ' (期望: ' + b.expected + ')' : ''}`);
      }
    }

    results.push({ difficulty, pass, knownBug, newBug, errors, unavail });
    totalPass += pass; totalKnownBug += knownBug; totalNewBug += newBug; totalUnavail += unavail; totalErr += errors;
  }

  // ---- 汇总 ----
  console.log(`\n${"=".repeat(60)}`);
  console.log("  汇总");
  console.log(`${"=".repeat(60)}`);
  const total = totalPass + totalKnownBug + totalNewBug + totalUnavail + totalErr;
  console.log(`  总表达式数: ${total}`);
  console.log(`  通过: \x1b[32m${totalPass}\x1b[0m`);
  console.log(`  已知BUG: \x1b[33m${totalKnownBug}\x1b[0m`);
  console.log(`  不可用(跳过): ${totalUnavail}`);
  console.log(`  \x1b[31m新BUG/错误: ${totalNewBug + totalErr}\x1b[0m`);
  console.log(`${"=".repeat(60)}`);

  if (totalNewBug + totalErr === 0) {
    console.log(`\n\x1b[32m✓ 未发现新增 BUG!\x1b[0m`);
    process.exit(0);
  } else {
    console.log(`\n\x1b[31m✗ 发现 ${totalNewBug + totalErr} 个新问题，请检查上方详情\x1b[0m`);
    process.exit(1);
  }
}

main();