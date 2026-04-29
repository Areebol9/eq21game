"use strict";
// ==================== 表达式求值 ====================
const TOK_NUM = 'NUM', TOK_OP = 'OP', TOK_LP = 'LP', TOK_RP = 'RP', TOK_SQRT = 'SQRT', TOK_NEG = 'NEG';
const OP_PREC = Object.fromEntries(Object.entries(OPERATORS).map(([k, v]) => [k, v.prec]));

function tokenize(expr) {
  const tokens = []; let i = 0; const s = expr.trim();
  function pushFaceToken(value, raw) {
    i++;
    if (i < s.length && s[i] === '!') {
      if (!hasFactorial()) throw new Error('阶乘仅在困难模式可用');
      i++;
      let f = 1; for (let k = 2; k <= value; k++) f *= k;
      tokens.push({ type: TOK_NUM, value: f, raw: raw + '!' });
    } else {
      tokens.push({ type: TOK_NUM, value: value, raw: raw });
    }
  }
  function canStartNegativeNumber() {
    if (!tokens.length) return true;
    const prev = tokens[tokens.length - 1];
    return prev.type === TOK_LP || (prev.type === TOK_OP && prev.value !== '!');
  }
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') { i++; continue; }
    if (ch === 'A' || ch === 'a') { pushFaceToken(1, 'A'); continue; }
    if (ch === 'J' || ch === 'j') { pushFaceToken(11, 'J'); continue; }
    if (ch === 'Q' || ch === 'q') { pushFaceToken(12, 'Q'); continue; }
    if (ch === 'K' || ch === 'k') { pushFaceToken(13, 'K'); continue; }
    if (ch === '\u221A') {
      i++; let num = ''; while (i < s.length && s[i] >= '0' && s[i] <= '9') { num += s[i]; i++; }
      if (num) { tokens.push({ type: TOK_NUM, value: Math.sqrt(Number(num)), raw: '\u221A' + num }); }
      else if (i < s.length && s[i] === '(') { tokens.push({ type: TOK_SQRT, value: '\u221A', raw: '\u221A' }); tokens.push({ type: TOK_LP, value: '(', raw: '(' }); i++; }
      else if (i < s.length) {
        const nc = s[i];
        if (nc === 'A' || nc === 'a') { tokens.push({ type: TOK_NUM, value: Math.sqrt(1), raw: '\u221AA' }); i++; }
        else if (nc === 'J' || nc === 'j') { tokens.push({ type: TOK_NUM, value: Math.sqrt(11), raw: '\u221AJ' }); i++; }
        else if (nc === 'Q' || nc === 'q') { tokens.push({ type: TOK_NUM, value: Math.sqrt(12), raw: '\u221AQ' }); i++; }
        else if (nc === 'K' || nc === 'k') { tokens.push({ type: TOK_NUM, value: Math.sqrt(13), raw: '\u221AK' }); i++; }
        else throw new Error('√ 后面需要数字或括号');
      }
      else throw new Error('√ 后面需要数字或括号');
      continue;
    }
    if (ch === 's' && s.substr(i, 5).toLowerCase() === 'sqrt(') { tokens.push({ type: TOK_SQRT, value: 'sqrt', raw: 'sqrt' }); tokens.push({ type: TOK_LP, value: '(', raw: '(' }); i += 5; continue; }
    if (ch >= '0' && ch <= '9') {
      let num = ''; while (i < s.length && s[i] >= '0' && s[i] <= '9') { num += s[i]; i++; }
      if (i < s.length && s[i] === '!') {
        if (!hasFactorial()) throw new Error('阶乘仅在困难模式可用');
        i++; let n = Number(num);
        if (!Number.isInteger(n) || n < 0 || n > 20) throw new Error('阶乘仅支持0~20的整数');
        let f = 1; for (let k = 2; k <= n; k++) f *= k;
        tokens.push({ type: TOK_NUM, value: f, raw: num + '!' });
      } else { tokens.push({ type: TOK_NUM, value: Number(num), raw: num }); }
      continue;
    }
    if (ch === '^' && game.difficulty !== 'easy') { tokens.push({ type: TOK_OP, value: '^', raw: '^' }); i++; continue; }
    if ('+-*/'.includes(ch)) {
      if (ch === '-' && canStartNegativeNumber()) {
        i++; let num = ''; while (i < s.length && s[i] >= '0' && s[i] <= '9') { num += s[i]; i++; }
        if (!num) throw new Error('负号后需要数字');
        if (i < s.length && s[i] === '!') throw new Error('阶乘仅支持非负整数');
        tokens.push({ type: TOK_NUM, value: -Number(num), raw: '-' + num });
      } else { tokens.push({ type: TOK_OP, value: ch, raw: ch }); i++; }
      continue;
    }
    if (ch === '(') { tokens.push({ type: TOK_LP, value: '(', raw: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TOK_RP, value: ')', raw: ')' }); i++;
      if (i < s.length && s[i] === '!') {
        if (!hasFactorial()) throw new Error('阶乘仅在困难模式可用');
        tokens.push({ type: TOK_OP, value: '!', raw: '!' }); i++;
      }
      continue; }
    throw new Error('非法字符: \'' + ch + '\'');
  }
  return tokens;
}

function toRPN(tokens) {
  const out = [], st = [];
  for (const t of tokens) {
    if (t.type === TOK_NUM) { out.push(t); }
    else if (t.type === TOK_SQRT) { st.push(t); }
    else if (t.type === TOK_OP) {
      while (st.length > 0) {
        const top = st[st.length - 1];
        if (top.type === TOK_SQRT || (top.type === TOK_OP && (OP_PREC[top.value] > OP_PREC[t.value] || (OP_PREC[top.value] === OP_PREC[t.value] && t.value !== '^')))) {
          out.push(st.pop());
        } else break;
      }
      st.push(t);
    } else if (t.type === TOK_LP) { st.push(t); }
    else if (t.type === TOK_RP) {
      while (st.length > 0 && st[st.length - 1].type !== TOK_LP) out.push(st.pop());
      if (!st.length) throw new Error('括号不匹配');
      st.pop();
    }
  }
  while (st.length > 0) {
    const top = st.pop();
    if (top.type === TOK_LP || top.type === TOK_RP) throw new Error('括号不匹配');
    out.push(top);
  }
  return out;
}

function evalRPN(rpn) {
  const st = [];
  for (const t of rpn) {
    if (t.type === TOK_NUM) { st.push(t.value); }
    else if (t.type === TOK_SQRT) {
      if (st.length < 1) throw new Error('√ 需要操作数');
      const v = st.pop(); if (v < 0) throw new Error('不能对负数开根号');
      st.push(Math.sqrt(v));
    } else if (t.type === TOK_OP) {
      const op = OPERATORS[t.value];
      if (!op) throw new Error('未知运算符');
      if (op.arity === 1) {
        if (st.length < 1) throw new Error('表达式不完整');
        const v = st.pop();
        st.push(op.fn(v));
      } else {
        if (st.length < 2) throw new Error('表达式不完整');
        const b = st.pop(), a = st.pop();
        const r = op.fn(a, b);
        if (!isFinite(r) || isNaN(r)) throw new Error('计算结果溢出');
        st.push(r);
      }
    }
  }
  if (st.length !== 1) throw new Error('表达式不完整');
  return st[0];
}

function evaluate(expr) { return evalRPN(toRPN(tokenize(expr))); }

// ==================== 手牌验证 ====================
function extractNumbers(expr) {
  const cleaned = expr.replace(/sqrt\(/gi, '').replace(/\u221A/g, '');
  const upper = cleaned.toUpperCase();
  const vals = [];
  for (let i = 0; i < upper.length; i++) {
    if (upper[i] === 'A') vals.push(1);
    else if (upper[i] === 'J') vals.push(11);
    else if (upper[i] === 'Q') vals.push(12);
    else if (upper[i] === 'K') vals.push(13);
  }
  const re = /\d+/g; let m;
  while ((m = re.exec(cleaned)) !== null) vals.push(Number(m[0]));
  return vals;
}
function validateHand(expr, hand) {
  const used = extractNumbers(expr);
  const a = [...used].sort((x, y) => x - y), b = [...hand].sort((x, y) => x - y);

  // 检测非法牌值 (不在 1-13 范围内)
  const invalidVals = used.filter(v => !Number.isInteger(v) || v < 1 || v > 13);
  if (invalidVals.length > 0) {
    return { valid: false, reason: 'invalidNumbers', invalidVals: [...new Set(invalidVals)] };
  }

  // 检测用的牌与手牌完全不匹配
  const handSet = new Set(hand);
  const anyMatch = used.some(v => handSet.has(v));
  if (used.length > 0 && !anyMatch) {
    return { valid: false, reason: 'noMatch' };
  }

  if (a.length !== b.length) {
    if (a.length < b.length) return { valid: false, reason: 'notAllUsed', missing: b.length - a.length };
    else return { valid: false, reason: 'extraCards', extra: a.length - b.length };
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return { valid: false, reason: 'mismatch' };
  }
  return { valid: true };
}

// ==================== AI 求解器（按难度支持四则/幂/开方/阶乘） ====================
const MAX_UNARY_DEPTH = 2;
let _aiCache = new Map(), _detailedSolveCache = new Map(), _lastCheckedHand = '';

function clearAiCache() {
  _aiCache.clear();
  _detailedSolveCache.clear();
  _lastCheckedHand = '';
}

function analyzeSolutionOps(expr) {
  expr = String(expr || '');
  return {
    hasAdd: expr.includes('+'),
    hasSub: expr.includes('-'),
    hasMul: expr.includes('*'),
    hasDiv: expr.includes('/'),
    hasPow: expr.includes('^'),
    hasSqrt: expr.includes('√') || expr.toLowerCase().includes('sqrt'),
    hasFact: expr.includes('!'),
    opCount: (expr.match(/[+\-*\/^!√]/g) || []).length
  };
}

function rateSolution(expr, difficulty, handLength) {
  const ops = analyzeSolutionOps(expr);
  const tags = [];
  let score = 0;
  if (ops.hasMul || ops.hasDiv) score += 30;
  if (ops.hasPow) { score += 180; tags.push('🔮幂指神算'); }
  if (ops.hasSqrt) { score += 200; tags.push('📐开方妙用'); }
  if (ops.hasFact) { score += 300; tags.push('💥阶乘狂人'); }
  if (handLength >= 5) { score += 80; tags.push('五牌逆转'); }
  if (difficulty === 'normal' && (ops.hasPow || ops.hasSqrt)) score += 80;
  if (difficulty === 'hard' && ops.hasFact) score += 100;
  if (ops.hasDiv && /\/[23456789JQK)]/.test(expr)) score += 40;
  if (/\b20\b|\b24\b|\b7\*3\b|\b3\*7\b/.test(expr)) score += 60;
  if (score >= 420) tags.push('妙手天成');
  else if (score >= 260) tags.push('✨炫技解法');
  else if (score >= 160) tags.push('奇思妙算');
  return { score, tags, ops, complexity: ops.opCount + Math.floor(String(expr || '').length / 8) };
}

function makeSolutionInfo(expr, style, difficulty, handLength) {
  const rating = rateSolution(expr, difficulty, handLength);
  return {
    expr,
    score: rating.score,
    tags: rating.tags,
    ops: rating.ops,
    complexity: rating.complexity,
    style
  };
}

function aiSolve(hand, target, ops, options) {
  options = options || {};
  const style = options.style === 'cool' ? 'cool' : 'simple';
  const maxResults = options.maxResults || (Number.isFinite(Number(options.maxMs)) ? 1 : 5);
  const maxMs = Number(options.maxMs);
  const hasBudget = Number.isFinite(maxMs) && maxMs >= 0;
  const deadline = hasBudget ? Date.now() + maxMs : 0;
  const key = [
    game.difficulty,
    hasUnary() ? 'u1' : 'u0',
    hasFactorial() ? 'f1' : 'f0',
    hand.slice().sort((a, b) => a - b).join(','),
    target,
    ops.join(''),
    style,
    maxResults
  ].join('_');
  if (_aiCache.has(key)) return _aiCache.get(key);

  const results = [], seen = new Set();
  const visitedMultisets = new Set();
  results.timedOut = false;
  const opRank = style === 'cool'
    ? { '^': 0, '*': 1, '/': 2, '+': 3, '-': 4 }
    : { '+': 0, '-': 1, '*': 2, '/': 3, '^': 4 };
  const binaryOps = Object.values(OPERATORS)
    .filter(o => o.arity === 2 && ops.includes(o.sym))
    .sort((a, b) => (opRank[a.sym] || 9) - (opRank[b.sym] || 9));
  const vals = hand.map(v => ({ value: v, expr: cardFace(v) }));
  const n = vals.length;
  if (n === 0) { _aiCache.set(key, results); return results; }

  function checkTimeout() {
    if (hasBudget && Date.now() >= deadline) {
      results.timedOut = true;
      return true;
    }
    return false;
  }

  function tryUnary(arr, unaryDepth) {
    if (!hasUnary() || results.length >= maxResults || unaryDepth >= MAX_UNARY_DEPTH) return;
    for (let i = 0; i < arr.length; i++) {
      if (checkTimeout()) return;
      const v = arr[i];
      if (v.expr.startsWith('√') || v.expr.endsWith('!')) continue;
      const rest = arr.filter((_, k) => k !== i);
      if (style === 'cool' && hasFactorial() && Number.isInteger(v.value) && v.value >= 0 && v.value <= 20) {
        let f = 1; for (let k = 2; k <= v.value; k++) f *= k;
        helper(rest.concat({ value: f, expr: v.expr + '!' }), unaryDepth + 1);
        if (results.timedOut || results.length >= maxResults) return;
      }
      if (v.value >= 0) {
        const r = Math.sqrt(v.value);
        helper(rest.concat({ value: r, expr: '√(' + v.expr + ')' }), unaryDepth + 1);
      }
      if (results.timedOut || results.length >= maxResults) return;
      if (style !== 'cool' && hasFactorial() && Number.isInteger(v.value) && v.value >= 0 && v.value <= 20) {
        let f = 1; for (let k = 2; k <= v.value; k++) f *= k;
        helper(rest.concat({ value: f, expr: v.expr + '!' }), unaryDepth + 1);
      }
      if (results.timedOut || results.length >= maxResults) return;
    }
  }

  function tryFactorialOnly(arr, unaryDepth) {
    if (!hasFactorial() || unaryDepth >= MAX_UNARY_DEPTH) return;
    for (let i = 0; i < arr.length; i++) {
      if (checkTimeout()) return;
      const v = arr[i];
      if (v.expr.endsWith('!')) continue;
      if (Number.isInteger(v.value) && v.value >= 0 && v.value <= 20) {
        const rest = arr.filter((_, k) => k !== i);
        let f = 1; for (let k = 2; k <= v.value; k++) f *= k;
        helper(rest.concat({ value: f, expr: v.expr + '!' }), unaryDepth + 1);
        if (results.timedOut || results.length >= maxResults) return;
      }
    }
  }

  function helper(arr, unaryDepth = 0) {
    if (checkTimeout()) return;
    const mkey = arr.map(v => Math.round(v.value * 1e9) / 1e9).sort((a, b) => a - b).join(',');
    if (visitedMultisets.has(mkey)) return;
    visitedMultisets.add(mkey);
    if (arr.length === 1) {
      const val = arr[0].value;
      if (Math.abs(val - target) < 0.000001) {
        const expr = arr[0].expr;
        if (!seen.has(expr)) { seen.add(expr); results.push(expr); }
      }
      return;
    }
    if (results.length >= maxResults) return;

    if (style === 'cool') {
      tryFactorialOnly(arr, unaryDepth);
      if (results.timedOut || results.length >= maxResults) return;
    }

    for (let i = 0; i < arr.length; i++) {
      if (checkTimeout()) return;
      for (let j = i + 1; j < arr.length; j++) {
        if (checkTimeout()) return;
        const a = arr[i], b = arr[j];
        const rest = arr.filter((_, k) => k !== i && k !== j);

        for (const op of binaryOps) {
          if (checkTimeout()) return;
          try {
            const r = op.fn(a.value, b.value);
            if (isFinite(r) && !isNaN(r) && Math.abs(r) < 1e10) {
              helper(rest.concat({ value: r, expr: '(' + a.expr + op.sym + b.expr + ')' }), unaryDepth);
              if (results.timedOut || results.length >= maxResults) return;
            }
          } catch (e) { /* skip invalid operation */ }
          if (op.sym === '-' || op.sym === '/' || op.sym === '^') {
            try {
              const r2 = op.fn(b.value, a.value);
              if (isFinite(r2) && !isNaN(r2) && Math.abs(r2) < 1e10) {
                helper(rest.concat({ value: r2, expr: '(' + b.expr + op.sym + a.expr + ')' }), unaryDepth);
                if (results.timedOut || results.length >= maxResults) return;
              }
            } catch (e) { /* skip invalid operation */ }
          }
        }
        if (results.length >= maxResults) return;
      }
    }

    if (style !== 'cool') tryUnary(arr, unaryDepth);
  }
  helper(vals);
  if (!results.timedOut) _aiCache.set(key, results);
  return results;
}

function findCoolExpressionsDP(hand, target, ops, options) {
  options = options || {};
  const maxMs = Number(options.maxMs);
  const hasBudget = Number.isFinite(maxMs) && maxMs >= 0;
  const deadline = hasBudget ? Date.now() + maxMs : 0;
  const out = [];
  out.timedOut = false;
  const n = hand.length;
  if (!n) return out;

  function timedOut() {
    if (hasBudget && Date.now() >= deadline) {
      out.timedOut = true;
      return true;
    }
    return false;
  }
  function valueKey(value) {
    return String(Math.round(value * 1e9) / 1e9);
  }
  function rankExpr(expr, value) {
    const rating = rateSolution(expr, game.difficulty, hand.length);
    const distance = Math.abs(value - target);
    const closeBonus = Math.max(0, 180 - Math.min(180, distance * 12));
    return rating.score * 10 + closeBonus - String(expr).length * 2;
  }
  function addState(map, value, expr) {
    if (!isFinite(value) || isNaN(value) || Math.abs(value) > 1e10) return;
    const key = valueKey(value);
    const rank = rankExpr(expr, value);
    const old = map.get(key);
    if (!old || rank > old.rank) map.set(key, { value, expr, rank });
  }
  function trimMap(map) {
    if (map.size <= 180) return map;
    const trimmed = new Map();
    Array.from(map.values())
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 180)
      .forEach(s => trimmed.set(valueKey(s.value), s));
    return trimmed;
  }

  const dp = Array(1 << n).fill(null).map(() => new Map());
  for (let i = 0; i < n; i++) {
    const v = hand[i];
    const face = cardFace(v);
    addState(dp[1 << i], v, face);
    if (hasUnary() && v >= 0) addState(dp[1 << i], Math.sqrt(v), '√(' + face + ')');
    if (hasFactorial() && Number.isInteger(v) && v >= 0 && v <= 20) {
      let f = 1; for (let k = 2; k <= v; k++) f *= k;
      addState(dp[1 << i], f, face + '!');
    }
  }

  for (let mask = 1; mask < (1 << n); mask++) {
    if (timedOut()) return out;
    for (let sub = (mask - 1) & mask; sub; sub = (sub - 1) & mask) {
      const other = mask ^ sub;
      if (!other || sub > other) continue;
      for (const a of dp[sub].values()) {
        for (const b of dp[other].values()) {
          if (timedOut()) return out;
          const targetMap = dp[mask];
          if (ops.includes('+')) addState(targetMap, a.value + b.value, '(' + a.expr + '+' + b.expr + ')');
          if (ops.includes('-')) {
            addState(targetMap, a.value - b.value, '(' + a.expr + '-' + b.expr + ')');
            addState(targetMap, b.value - a.value, '(' + b.expr + '-' + a.expr + ')');
          }
          if (ops.includes('*')) addState(targetMap, a.value * b.value, '(' + a.expr + '*' + b.expr + ')');
          if (ops.includes('/')) {
            if (Math.abs(b.value) > 1e-9) addState(targetMap, a.value / b.value, '(' + a.expr + '/' + b.expr + ')');
            if (Math.abs(a.value) > 1e-9) addState(targetMap, b.value / a.value, '(' + b.expr + '/' + a.expr + ')');
          }
          if (ops.includes('^')) {
            try { addState(targetMap, OPERATORS['^'].fn(a.value, b.value), '(' + a.expr + '^' + b.expr + ')'); } catch (e) {}
            try { addState(targetMap, OPERATORS['^'].fn(b.value, a.value), '(' + b.expr + '^' + a.expr + ')'); } catch (e) {}
          }
        }
      }
      dp[mask] = trimMap(dp[mask]);
    }
  }

  const full = (1 << n) - 1;
  for (const state of dp[full].values()) {
    if (Math.abs(state.value - target) < 0.000001) out.push(state.expr);
  }
  out.sort((a, b) => rateSolution(b, game.difficulty, hand.length).score - rateSolution(a, game.difficulty, hand.length).score);
  const sliced = out.slice(0, options.maxResults || 10);
  sliced.timedOut = out.timedOut;
  return sliced;
}

function solveHandDetailed(hand, target, ops, options) {
  options = options || {};
  const cacheKey = [
    game.difficulty,
    hasUnary() ? 'u1' : 'u0',
    hasFactorial() ? 'f1' : 'f0',
    target,
    hand.slice().sort((a, b) => a - b).join(','),
    ops.join('')
  ].join('|');
  function cloneInfo(s) {
    return Object.assign({}, s, {
      tags: (s.tags || []).slice(),
      ops: Object.assign({}, s.ops || {})
    });
  }
  function cloneResult(r) {
    return {
      simpleSolutions: (r.simpleSolutions || []).map(cloneInfo),
      coolSolutions: (r.coolSolutions || []).map(cloneInfo),
      timedOut: !!r.timedOut,
      cached: !!r.cached
    };
  }
  if (_detailedSolveCache.has(cacheKey)) {
    const cached = cloneResult(_detailedSolveCache.get(cacheKey));
    cached.cached = true;
    return cached;
  }
  const maxMs = Number.isFinite(Number(options.maxMs)) ? Number(options.maxMs) : 1200;
  const simpleBudget = Math.max(80, Math.floor(maxMs * 0.35));
  const coolBudget = Math.max(120, maxMs - simpleBudget);
  const simpleRaw = aiSolve(hand, target, ops, { maxMs: simpleBudget, style: 'simple', maxResults: 1 });
  const coolRaw = findCoolExpressionsDP(hand, target, ops, { maxMs: coolBudget, maxResults: 10 });
  function isPlayableSolution(expr) {
    try {
      if (Math.abs(evaluate(expr) - target) > 0.000001) return false;
      const handValidation = validateHand(expr, hand);
      return !!(handValidation && handValidation.valid);
    } catch (e) {
      return false;
    }
  }
  const seen = new Set();
  const simpleSolutions = simpleRaw
    .filter(isPlayableSolution)
    .map(expr => makeSolutionInfo(expr, 'simple', game.difficulty, hand.length));
  simpleSolutions.forEach(s => seen.add(s.expr));
  const coolCandidates = coolRaw
    .filter(isPlayableSolution)
    .map(expr => makeSolutionInfo(expr, 'cool', game.difficulty, hand.length))
    .concat(simpleSolutions.filter(s => s.score >= 160).map(s => Object.assign({}, s, { style: 'cool' })));
  const coolSeen = new Set();
  const coolSolutions = coolCandidates
    .filter(s => s.score >= 160)
    .filter(s => {
      if (coolSeen.has(s.expr)) return false;
      coolSeen.add(s.expr);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.complexity - b.complexity)
    .slice(0, 5);
  const result = {
    simpleSolutions,
    coolSolutions,
    timedOut: !!simpleRaw.timedOut || !!coolRaw.timedOut,
    cached: false
  };
  if (!result.timedOut) _detailedSolveCache.set(cacheKey, cloneResult(result));
  return result;
}
