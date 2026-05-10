#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const TARGET = 21;
const DEFAULT_TIMEOUT_MS = 60000;

// ==================== 规则配置 ====================
const STRATEGY_RULESETS = {
  currentEasy: {
    difficulty: "easy",
    maxCards: 5,
    target: 21,
    maxCardValue: 10,
    deckCardsPerValue: 4,
    estimatedDrawTimeSec: 5,
    hasPow: false,
    hasSqrt: false,
    hasFactorial: false,
    solveBudgetMs: 800,
    label: "当前简单模式"
  },
  currentNormal: {
    difficulty: "normal",
    maxCards: 5,
    target: 21,
    maxCardValue: 13,
    deckCardsPerValue: 4,
    estimatedDrawTimeSec: 5,
    hasPow: true,
    hasSqrt: true,
    hasFactorial: false,
    solveBudgetMs: 800,
    label: "当前普通模式"
  },
  currentHard: {
    difficulty: "hard",
    maxCards: 5,
    target: 21,
    maxCardValue: 13,
    deckCardsPerValue: 4,
    estimatedDrawTimeSec: 5,
    hasPow: true,
    hasSqrt: true,
    hasFactorial: true,
    solveBudgetMs: 1000,
    label: "当前困难模式"
  }
};

// ==================== vm 模块加载 ====================
function loadContext(difficulty) {
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
      target: TARGET,
      stats: { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 },
      aiThinking: false,
      aiTimerId: null,
      aiCountdown: 0,
      aiCountdownInterval: null,
      aiSolved: false,
      aiSolution: null,
      _maxHintShown: false,
      _firstRender: false,
      solutionCache: { handKey: "", simple: [], cool: [], pending: false, timedOut: false, completed: false },
      soundEnabled: false
    },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({}),
      addEventListener: () => {},
      activeElement: null,
      body: { appendChild: () => {} }
    },
    window: {
      AudioContext: null,
      webkitAudioContext: null,
      innerWidth: 1024,
      innerHeight: 768
    },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
  };
  sandbox.global = sandbox;
  const ctx = vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8"), ctx, { filename: "js/config.js" });
  vm.runInContext('game.difficulty = "' + difficulty + '";', ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "expression.js"), "utf8"), ctx, { filename: "js/expression.js" });
  return ctx;
}

function setDifficulty(ctx, difficulty) {
  vm.runInContext('game.difficulty = "' + difficulty + '";', ctx);
  vm.runInContext("_aiCache = new Map(); _detailedSolveCache = new Map(); _lastCheckedHand = '';", ctx);
}

// ==================== 牌库建模 ====================
function initDeckCounts(difficulty) {
  const maxVal = difficulty === "easy" ? 10 : 13;
  const counts = {};
  for (let v = 1; v <= maxVal; v++) counts[v] = 4;
  return counts;
}

function totalRemaining(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function cloneDeck(counts) {
  return Object.assign({}, counts);
}

// ==================== 表达式运算符检测 ====================
function detectOpsFromExpr(expr) {
  const s = String(expr || "");
  return {
    hasMul: s.includes("*"),
    hasDiv: s.includes("/"),
    hasPow: s.includes("^"),
    hasSqrt: s.includes("\u221A") || s.toLowerCase().includes("sqrt"),
    hasFact: s.includes("!")
  };
}

// ==================== 游戏分数计算 (基于 history.js:calculateScore 思想) ====================
function computeGameScore(rateSolutionFn, expr, difficulty, handLength, submits, timerSec) {
  const breakdown = [];
  let total = 500;
  breakdown.push({ label: "获胜底分", score: 500 });

  const ops = detectOpsFromExpr(expr);
  if (ops.hasMul || ops.hasDiv) {
    total += 50;
    breakdown.push({ label: "乘除巧算", score: 50 });
  }
  if (ops.hasPow) {
    total += 150;
    breakdown.push({ label: "幂指神算", score: 150 });
  }
  if (ops.hasSqrt) {
    total += 200;
    breakdown.push({ label: "开方妙用", score: 200 });
  }
  if (ops.hasFact) {
    total += 300;
    breakdown.push({ label: "阶乘狂人", score: 300 });
  }

  let solutionRating = null;
  if (typeof rateSolutionFn === "function") {
    const rating = rateSolutionFn(expr, difficulty, handLength);
    if (rating) {
      solutionRating = {
        score: rating.score,
        tags: (rating.tags || []).slice(),
        complexity: rating.complexity,
        ops: Object.assign({}, rating.ops || {})
      };
      if (rating.score >= 160) {
        const coolBonus = Math.min(500, Math.round(rating.score / 2));
        total += coolBonus;
        breakdown.push({ label: "妙解加分", score: coolBonus });
      }
    }
  }

  if (handLength <= 3) {
    total += 150;
    breakdown.push({ label: "三牌封喉", score: 150 });
  }

  if (submits === 1) {
    total += 200;
    breakdown.push({ label: "一击必杀", score: 200 });
  }

  if (timerSec <= 15) {
    total += 200;
    breakdown.push({ label: "闪电心算", score: 200 });
  } else if (timerSec <= 30) {
    total += 100;
    breakdown.push({ label: "速算达人", score: 100 });
  }

  return { total, breakdown, solutionRating };
}

// ==================== 内层：找手牌的最佳表达式 ====================
function findBestExpression(ctx, hand, target, ops, difficulty, maxMs) {
  if (!hand || hand.length === 0) return { expr: null, rating: null, timedOut: false, noSolution: true };

  let result;
  try {
    result = ctx.solveHandDetailed(hand.slice(), target, ops, { maxMs: maxMs || 800 });
  } catch (e) {
    return { expr: null, rating: null, timedOut: false, noSolution: true, error: e.message };
  }

  const all = [];
  if (result.simpleSolutions) {
    for (const s of result.simpleSolutions) all.push(s);
  }
  if (result.coolSolutions) {
    for (const s of result.coolSolutions) all.push(s);
  }

  if (all.length === 0) {
    return { expr: null, rating: null, timedOut: !!result.timedOut, noSolution: true };
  }

  const difficultyRef = ctx.game ? ctx.game.difficulty : difficulty;
  all.sort((a, b) => {
    const ra = ctx.rateSolution(a.expr, difficultyRef, hand.length);
    const rb = ctx.rateSolution(b.expr, difficultyRef, hand.length);
    return (rb.score || 0) - (ra.score || 0);
  });

  const best = all[0];
  return {
    expr: best.expr,
    rating: ctx.rateSolution(best.expr, difficultyRef, hand.length),
    style: best.style,
    timedOut: !!result.timedOut,
    noSolution: false,
    allExpressions: all
  };
}

// ==================== 外层：递归状态评估 ====================
function makeStateKey(state) {
  const sortedHand = (state.hand || []).slice().sort((a, b) => a - b).join(",");
  const deckEntries = Object.keys(state.deckCounts || {}).sort((a, b) => Number(a) - Number(b));
  const deckStr = deckEntries.map(k => k + ":" + (state.deckCounts[k] || 0)).join(",");
  const timerBucket = Math.floor((state.timerSec || 0) / 5) * 5;
  return [
    state.difficulty || "normal",
    sortedHand,
    deckStr,
    timerBucket,
    state.submits || 0,
    state.draws || 0
  ].join("|");
}

function evaluateState(ctx, state, ruleset, memo, deadline, stats) {
  if (deadline && Date.now() >= deadline) {
    return {
      action: "TIMEOUT",
      score: 0,
      scoreBreakdown: [],
      children: [],
      path: [],
      bestExpression: null,
      timedOut: true
    };
  }

  const key = makeStateKey(state);
  if (memo.has(key)) return memo.get(key);

  if (stats) stats.evaluated = (stats.evaluated || 0) + 1;

  const hand = state.hand || [];
  const deckCounts = state.deckCounts || {};
  const remaining = totalRemaining(deckCounts);
  const maxCards = ruleset.maxCards || 5;

  setDifficulty(ctx, state.difficulty);
  const ops = ctx.getBinaryOps();

  // --- SUBMIT_BEST ---
  let submitResult = null;
  const best = findBestExpression(ctx, hand, ruleset.target, ops, state.difficulty, ruleset.solveBudgetMs || 800);

  if (best.expr) {
    const finalSubmits = (state.submits || 0) + 1;
    const timerForScoring = state.timerSec || 0;
    const scoreResult = computeGameScore(
      ctx.rateSolution,
      best.expr,
      state.difficulty,
      hand.length,
      finalSubmits,
      timerForScoring
    );
    submitResult = {
      action: "SUBMIT_BEST",
      score: scoreResult.total,
      scoreBreakdown: scoreResult.breakdown,
      bestExpression: best.expr,
      rating: best.rating,
      path: ["SUBMIT_BEST"],
      children: [],
      noSolution: false,
      timedOut: best.timedOut
    };
  }

  // --- DRAW_ONE ---
  let drawResult = null;
  const canDraw = hand.length < maxCards && remaining > 0;

  if (canDraw) {
    let expectedScore = 0;
    const children = [];
    const totalWeight = remaining;

    for (const vStr of Object.keys(deckCounts)) {
      const v = Number(vStr);
      const count = deckCounts[v];
      if (!count || count <= 0) continue;

      const prob = count / totalWeight;
      const newDeck = cloneDeck(deckCounts);
      newDeck[v] = count - 1;

      const childState = {
        difficulty: state.difficulty,
        hand: [...hand, v],
        deckCounts: newDeck,
        timerSec: (state.timerSec || 0) + (ruleset.estimatedDrawTimeSec || 5),
        submits: state.submits || 0,
        draws: (state.draws || 0) + 1
      };

      const childResult = evaluateState(ctx, childState, ruleset, memo, deadline, stats);
      children.push({
        drawValue: v,
        probability: prob,
        child: childResult
      });
      expectedScore += prob * (childResult.score || 0);
    }

    const bestChild = children.reduce((best, c) => {
      return (c.child.score || 0) > (best.child.score || 0) ? c : best;
    }, children[0]);

    drawResult = {
      action: "DRAW_ONE",
      score: Math.round(expectedScore * 100) / 100,
      scoreBreakdown: [],
      bestExpression: bestChild ? bestChild.child.bestExpression : null,
      path: ["DRAW_ONE"],
      children: children,
      noSolution: false,
      timedOut: false
    };
  }

  // --- 决定最佳动作 ---
  let result;
  if (submitResult && drawResult) {
    result = (submitResult.score >= drawResult.score) ? submitResult : drawResult;
  } else if (submitResult) {
    result = submitResult;
  } else if (drawResult) {
    result = drawResult;
  } else {
    result = {
      action: "NO_SOLUTION",
      score: 0,
      scoreBreakdown: [],
      bestExpression: null,
      path: [],
      children: [],
      noSolution: true,
      timedOut: best.timedOut
    };
  }

  // 扩充 path
  if (result !== submitResult && result !== drawResult) {
    // NO_SOLUTION, path stays empty
  } else if (result === drawResult && drawResult.children.length > 0) {
    // 将每个 child 的 path 前置 DRAW_ONE
    for (const child of drawResult.children) {
      child.child.path = ["DRAW_ONE"].concat(child.child.path || []);
    }
  }

  memo.set(key, result);
  return result;
}

// ==================== 主入口 ====================
function analyzeStrategy(ctx, ruleset, hand, deckCounts, timerSec, submits, draws) {
  const state = {
    difficulty: ruleset.difficulty || "normal",
    hand: hand || [],
    deckCounts: deckCounts || initDeckCounts(ruleset.difficulty),
    timerSec: timerSec || 0,
    submits: submits || 0,
    draws: draws || 0
  };

  const memo = new Map();
  const deadline = Date.now() + (ruleset.timeoutMs || DEFAULT_TIMEOUT_MS);
  const stats = { evaluated: 0 };
  const startTime = Date.now();

  const result = evaluateState(ctx, state, ruleset, memo, deadline, stats);
  const timeMs = Date.now() - startTime;

  function walkBestChild(r) {
    if (!r) return null;
    if (r.action === "DRAW_ONE" && r.children && r.children.length > 0) {
      const best = r.children.reduce((b, c) =>
        (c.child.score || 0) > (b.child.score || 0) ? c : b, r.children[0]);
      return walkBestChild(best.child);
    }
    return r;
  }

  function walkBestPath(r) {
    if (!r) return [];
    if (r.action === "DRAW_ONE" && r.children && r.children.length > 0) {
      const best = r.children.reduce((b, c) =>
        (c.child.score || 0) > (b.child.score || 0) ? c : b, r.children[0]);
      return ["DRAW_ONE"].concat(walkBestPath(best.child));
    }
    return r.path || [];
  }

  const terminal = walkBestChild(result);
  const bestExpression = terminal ? (terminal.bestExpression || null) : (result.bestExpression || null);
  const scoreBreakdown = terminal ? (terminal.scoreBreakdown || []) : (result.scoreBreakdown || []);
  const bestPath = walkBestPath(result);

  return {
    ruleset: ruleset.label || ruleset.difficulty,
    initialHand: hand,
    difficulty: ruleset.difficulty,
    analysis: {
      bestAction: result.action,
      expectedScore: result.score,
      path: bestPath,
      bestExpression: bestExpression,
      scoreBreakdown: scoreBreakdown,
      noSolution: !!result.noSolution,
      timedOut: !!result.timedOut
    },
    fullResult: result,
    meta: {
      statesEvaluated: stats.evaluated,
      timeMs: timeMs
    }
  };
}

// ==================== CLI ====================
function printHelp() {
  console.log([
    "用法:",
    "  node tools/strategy-analyzer.js <牌值...> [选项]",
    "",
    "牌值: 数字 (1-13) 或 A=1 J=11 Q=12 K=13",
    "",
    "选项:",
    "  -d <难度>    easy | normal (默认) | hard",
    "  -r <规则集>  规则集名称 (默认 currentNormal，见 STRATEGY_RULESETS)",
    "  -t <秒>     初始已用时间 (默认 0)",
    "  -s <次数>   初始失败提交次数 (默认 0)",
    "  --json      仅输出 JSON (默认 pretty-print)",
    "  --timeout <ms> 全局分析超时 (默认 60000)",
    "  -h          显示帮助",
    "",
    "规则集:",
    "  currentEasy    简单模式 (1-10, +-*/)",
    "  currentNormal  普通模式 (1-13, +-*/^√)",
    "  currentHard    困难模式 (1-13, +-*/^√!)",
    "",
    "示例:",
    "  node tools/strategy-analyzer.js 2 5 7 -d easy",
    "  node tools/strategy-analyzer.js 6 3 3 2 J -d normal --json",
    "  node tools/strategy-analyzer.js A K 5 -d hard",
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

function cardLabel(v) {
  if (v === 1) return "A";
  if (v === 11) return "J";
  if (v === 12) return "Q";
  if (v === 13) return "K";
  return String(v);
}

function parseArgs(argv) {
  const result = {
    help: false,
    difficulty: "normal",
    ruleset: "currentNormal",
    timerSec: 0,
    submits: 0,
    json: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
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
      if (["easy", "normal", "hard"].includes(d)) {
        result.difficulty = d;
        result.ruleset = "current" + d.charAt(0).toUpperCase() + d.slice(1);
      } else {
        result.errors.push("无效难度: " + d + " (应为 easy/normal/hard)");
      }
      i++;
    } else if (arg === "-r") {
      i++;
      const r = argv[i] || "";
      if (STRATEGY_RULESETS[r]) {
        result.ruleset = r;
        result.difficulty = STRATEGY_RULESETS[r].difficulty;
      } else {
        result.errors.push("无效规则集: " + r + " (可用: " + Object.keys(STRATEGY_RULESETS).join(", ") + ")");
      }
      i++;
    } else if (arg === "-t") {
      i++;
      result.timerSec = Math.max(0, Number(argv[i]) || 0);
      i++;
    } else if (arg === "-s") {
      i++;
      result.submits = Math.max(0, Number(argv[i]) || 0);
      i++;
    } else if (arg === "--json") {
      result.json = true;
      i++;
    } else if (arg === "--timeout") {
      i++;
      result.timeoutMs = Math.max(1000, Number(argv[i]) || DEFAULT_TIMEOUT_MS);
      i++;
    } else {
      const card = parseCard(arg);
      if (card !== null) result.hand.push(card);
      else result.errors.push("无效牌值: " + arg + " (支持 1-13, A, J, Q, K)");
      i++;
    }
  }

  return result;
}

function prettyPrint(output) {
  const a = output.analysis;
  console.log("策略分析报告");
  console.log("=".repeat(50));
  console.log("  规则集: " + output.ruleset);
  console.log("  难度:   " + output.difficulty);
  console.log("  手牌:   " + (output.initialHand || []).map(cardLabel).join(" "));
  console.log("  目标:   21");
  console.log("");
  console.log("最优动作: " + a.bestAction);
  console.log("期望分值: " + a.expectedScore);
  if (a.bestExpression) {
    console.log("最佳算式: " + a.bestExpression + " = " + TARGET);
  }
  console.log("最佳路径: " + (a.path || []).join(" → "));
  if (a.noSolution) console.log("  状态:   当前手牌无解");
  if (a.timedOut) console.log("  状态:   求解超时");

  if (a.scoreBreakdown && a.scoreBreakdown.length > 0) {
    console.log("\n分值明细:");
    for (const item of a.scoreBreakdown) {
      console.log("  +" + String(item.score).padStart(5) + "  " + item.label);
    }
  }

  if (output.fullResult && output.fullResult.action === "DRAW_ONE" && output.fullResult.children) {
    console.log("\n抽牌期望分支 (top 5):");
    const sorted = output.fullResult.children
      .slice()
      .sort((a, b) => (b.child.score || 0) - (a.child.score || 0))
      .slice(0, 5);
    for (const c of sorted) {
      console.log("  抽到 " + cardLabel(c.drawValue).padEnd(3) +
        " (概率 " + (c.probability * 100).toFixed(1) + "%)" +
        " → " + c.child.action + " 期望 " + c.child.score);
    }
  }

  console.log("\n统计:");
  console.log("  评估状态数: " + (output.meta.statesEvaluated || 0));
  console.log("  耗时:       " + (output.meta.timeMs || 0) + "ms");
  console.log("=".repeat(50));
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) { printHelp(); process.exit(0); }
  if (args.errors.length > 0) {
    args.errors.forEach(e => console.log("错误: " + e));
    console.log("使用 -h 查看帮助");
    process.exit(1);
  }
  if (args.hand.length === 0) {
    console.log("错误: 请提供至少一个手牌值");
    console.log("使用 -h 查看帮助");
    process.exit(1);
  }

  const ruleset = STRATEGY_RULESETS[args.ruleset];
  if (!ruleset) {
    console.log("错误: 无效规则集: " + args.ruleset);
    process.exit(1);
  }

  const ctx = loadContext(args.difficulty);
  const deckCounts = initDeckCounts(args.difficulty);

  // 从牌库中移除手牌
  for (const v of args.hand) {
    if (deckCounts[v] && deckCounts[v] > 0) deckCounts[v]--;
  }

  ruleset.timeoutMs = args.timeoutMs;
  const output = analyzeStrategy(ctx, ruleset, args.hand, deckCounts, args.timerSec, args.submits, 0);

  if (args.json) {
    console.log(JSON.stringify({
      ruleset: output.ruleset,
      difficulty: output.difficulty,
      initialHand: output.initialHand,
      analysis: output.analysis,
      meta: output.meta
    }, null, 2));
  } else {
    prettyPrint(output);
  }
}

// ==================== 模块导出 ====================
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STRATEGY_RULESETS,
    loadContext,
    setDifficulty,
    initDeckCounts,
    totalRemaining,
    cloneDeck,
    detectOpsFromExpr,
    computeGameScore,
    findBestExpression,
    makeStateKey,
    evaluateState,
    analyzeStrategy,
    parseCard,
    cardLabel,
    DEFAULT_TIMEOUT_MS
  };
}

if (require.main === module) main();
