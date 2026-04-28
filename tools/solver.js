#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const TARGET = 21;
const DEFAULT_TIMEOUT = 3000;

function showHelp() {
  console.log([
    "用法:",
    "  node tools/solver.js <牌值...> [选项]",
    "  node tools/solver.js -x <表达式> <牌值...> [选项]",
    "",
    "牌值: 数字 (1-13) 或  A=1  J=11  Q=12  K=13",
    "",
    "选项:",
    "  -d <难度>    easy | normal (默认) | hard",
    "  -c           仅显示炫酷解法",
    "  -s           仅显示普通解法",
    "  -t <毫秒>    求解超时 (默认 3000)",
    "  -x <表达式>  验证给定表达式是否正确",
    "  -h           显示帮助",
    "",
    "示例:",
    "  node tools/solver.js 6 3 3 2 J",
    "  node tools/solver.js 6 3 3 2 J -d hard -c",
    "  node tools/solver.js -x \"(6+3)*3-2-11\" 6 3 3 2 J",
    ""
  ].join("\n"));
}

function parseCard(raw) {
  const upper = String(raw).toUpperCase();
  if (upper === "A") return 1;
  if (upper === "J") return 11;
  if (upper === "Q") return 12;
  if (upper === "K") return 13;
  const num = Number(upper);
  if (Number.isInteger(num) && num >= 1 && num <= 13) return num;
  return null;
}

function parseArgs(argv) {
  const result = {
    help: false,
    difficulty: "normal",
    coolOnly: false,
    simpleOnly: false,
    timeout: DEFAULT_TIMEOUT,
    evalExpr: null,
    hand: [],
    errors: []
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      result.help = true;
      i++;
    } else if (arg === "-d") {
      i++;
      const d = (argv[i] || "").toLowerCase();
      if (["easy", "normal", "hard"].includes(d)) result.difficulty = d;
      else result.errors.push("无效难度: " + d + " (应为 easy/normal/hard)");
      i++;
    } else if (arg === "-c") { result.coolOnly = true; i++; }
    else if (arg === "-s") { result.simpleOnly = true; i++; }
    else if (arg === "-t") {
      i++;
      const t = Number(argv[i]);
      if (t > 0) result.timeout = t;
      else result.errors.push("无效超时: " + argv[i]);
      i++;
    } else if (arg === "-x" || arg === "--eval") {
      i++;
      if (i < argv.length) result.evalExpr = argv[i];
      else result.errors.push("-x 缺少表达式参数");
      i++;
    } else {
      const card = parseCard(arg);
      if (card !== null) result.hand.push(card);
      else result.errors.push("无效牌值: " + arg + " (支持 1-13, A, J, Q, K)");
      i++;
    }
  }

  if (result.coolOnly && result.simpleOnly) result.errors.push("-c 和 -s 不能同时使用");

  return result;
}

function loadModules(difficulty) {
  const stubs = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({}),
      body: { appendChild: () => {} },
      addEventListener: () => {}
    },
    window: { AudioContext: null },
    navigator: { clipboard: { writeText: () => {} } }
  };
  stubs.global = stubs;
  vm.createContext(stubs);

  const configPath = path.join(ROOT, "js", "config.js");
  vm.runInContext(fs.readFileSync(configPath, "utf8"), stubs, { filename: "js/config.js" });
  vm.runInContext('game.difficulty = "' + difficulty + '"; game.target = ' + TARGET + ";", stubs);

  const exprPath = path.join(ROOT, "js", "expression.js");
  vm.runInContext(fs.readFileSync(exprPath, "utf8"), stubs, { filename: "js/expression.js" });
  return stubs;
}

function cardLabel(v) {
  if (v === 1) return "A";
  if (v === 11) return "J";
  if (v === 12) return "Q";
  if (v === 13) return "K";
  return String(v);
}

function opsLabel(ops) {
  const parts = [];
  if (ops.hasAdd) parts.push("+");
  if (ops.hasSub) parts.push("-");
  if (ops.hasMul) parts.push("*");
  if (ops.hasDiv) parts.push("÷");
  if (ops.hasPow) parts.push("ⁿ");
  if (ops.hasSqrt) parts.push("√");
  if (ops.hasFact) parts.push("!");
  return parts.join(" ");
}

function padLeft(s, len) {
  return String(s).padEnd(len, " ");
}

function printSolutions(ctx, args) {
  const hand = args.hand;
  const handDisplay = hand.map(cardLabel).join(" ");
  const diffLabel = { easy: "简单", normal: "普通", hard: "困难" }[args.difficulty];

  console.log("  牌面: " + handDisplay + "    目标: " + TARGET + "    难度: " + diffLabel + "    超时: " + args.timeout + "ms");
  console.log("");

  try {
    const result = ctx.solveHandDetailed(
      hand.slice(),
      TARGET,
      ctx.getBinaryOps(),
      { maxMs: args.timeout }
    );
    if (!result) {
      console.log("  ⚠ 求解器返回空结果");
      return;
    }

    const showSimple = !args.coolOnly;
    const showCool = !args.simpleOnly;

    if (showSimple && result.simpleSolutions && result.simpleSolutions.length > 0) {
      console.log("  ► 普通解法 " + "─".repeat(36));
      result.simpleSolutions.forEach(function(s) {
        const rating = ctx.rateSolution(s.expr, args.difficulty, hand.length);
        const tags = rating.tags.length ? "  " + rating.tags.join(" ") : "";
        console.log("  " + padLeft(s.expr, 28) + " 评分:" + padLeft(String(rating.score), 5) + tags);
      });
      console.log("");
    }

    if (showCool && result.coolSolutions && result.coolSolutions.length > 0) {
      console.log("  ► 炫酷解法 " + "─".repeat(36));
      result.coolSolutions.forEach(function(s) {
        const rating = ctx.rateSolution(s.expr, args.difficulty, hand.length);
        const tags = rating.tags.length ? "  " + rating.tags.join(" ") : "";
        console.log("  " + padLeft(s.expr, 28) + " 评分:" + padLeft(String(rating.score), 5) + tags);
        console.log("     → 使用了: " + opsLabel(rating.ops));
      });
      console.log("");
    }

    if ((!result.simpleSolutions || result.simpleSolutions.length === 0) &&
        (!result.coolSolutions || result.coolSolutions.length === 0)) {
      if (result.timedOut) {
        console.log("  ⏱ 超时！在 " + args.timeout + "ms 内未找到解法");
        console.log("    提示：增加超时时间 -t " + (args.timeout * 2));
      } else {
        console.log("  ✗ 未找到任何解法（该手牌无解）");
      }
    }

    if (result.timedOut) console.log("  ⏱ 求解已超时（可能还有更多解未找到）");
    if (result.cached) console.log("  📦 结果来自缓存");

  } catch (err) {
    console.log("  ✗ 求解出错: " + (err && err.message ? err.message : String(err)));
  }
}

function printEval(ctx, args) {
  const expr = String(args.evalExpr || "").trim();
  if (!expr) {
    console.log("  ✗ 表达式为空");
    return;
  }

  console.log("  表达式: " + expr);
  console.log("");

  try {
    const result = ctx.evaluate(expr);
    console.log("  计算结果: " + ctx.formatNum(result));
    console.log("  是否等于目标(" + TARGET + "): " + (Math.abs(result - TARGET) < 0.000001 ? "✓ 是" : "✗ 否 (差 " + (result - TARGET).toFixed(6).replace(/\.?0+$/, "") + ")"));
    console.log("");

    const used = ctx.extractNumbers(expr);
    const usedDisplay = used.length ? used.map(cardLabel).join(" ") : "(空)";
    console.log("  使用牌值: [" + usedDisplay + "]");
    console.log("  手牌要求: [" + args.hand.map(cardLabel).join(" ") + "]");
    console.log("");

    if (args.hand.length > 0) {
      const validation = ctx.validateHand(expr, args.hand.slice());
      if (validation.valid) {
        console.log("  手牌匹配: ✓ 完全匹配");
      } else {
        const reasons = {
          notAllUsed: "还有 " + validation.missing + " 张牌未使用",
          extraCards: "多用了 " + validation.extra + " 张牌",
          noMatch: "没有用到自己的手牌",
          mismatch: "牌值不完全匹配",
          invalidNumbers: "使用了不存在的牌值 " + (validation.invalidVals || []).join(", ")
        };
        console.log("  手牌匹配: ✗ " + (reasons[validation.reason] || validation.reason));
      }
    }

    if (Math.abs(result - TARGET) < 0.000001) {
      const rating = ctx.rateSolution(expr, args.difficulty, args.hand.length || ctx.extractNumbers(expr).length);
      if (rating.tags.length > 0) console.log("  评级: " + rating.tags.join(" ") + " (评分 " + rating.score + ")");
    }

  } catch (err) {
    console.log("  ✗ 求值出错: " + (err && err.message ? err.message : String(err)));
  }
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) { showHelp(); process.exit(0); }
  if (args.errors.length > 0) {
    args.errors.forEach(e => console.log("错误: " + e));
    console.log("使用 -h 查看帮助");
    process.exit(1);
  }
  if (!args.evalExpr && args.hand.length === 0) {
    console.log("错误: 请提供至少一个手牌值");
    console.log("使用 -h 查看帮助");
    process.exit(1);
  }

  const ctx = loadModules(args.difficulty);

  if (args.evalExpr) printEval(ctx, args);
  else printSolutions(ctx, args);
}

main();
