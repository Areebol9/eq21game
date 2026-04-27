"use strict";
// ==================== 表达式求值 ====================
const TOK_NUM = 'NUM', TOK_OP = 'OP', TOK_LP = 'LP', TOK_RP = 'RP', TOK_SQRT = 'SQRT', TOK_NEG = 'NEG';
const OP_PREC = Object.fromEntries(Object.entries(OPERATORS).map(([k, v]) => [k, v.prec]));

function tokenize(expr) {
  const tokens = []; let i = 0; const s = expr.trim();
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') { i++; continue; }
    if (ch === 'A' || ch === 'a') { tokens.push({ type: TOK_NUM, value: 1, raw: 'A' }); i++; continue; }
    if (ch === 'J' || ch === 'j') { tokens.push({ type: TOK_NUM, value: 11, raw: 'J' }); i++; continue; }
    if (ch === 'Q' || ch === 'q') { tokens.push({ type: TOK_NUM, value: 12, raw: 'Q' }); i++; continue; }
    if (ch === 'K' || ch === 'k') { tokens.push({ type: TOK_NUM, value: 13, raw: 'K' }); i++; continue; }
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
      if (ch === '-' && (tokens.length === 0 || tokens[tokens.length - 1].type === TOK_LP || tokens[tokens.length - 1].type === TOK_OP)) {
        i++; let num = ''; while (i < s.length && s[i] >= '0' && s[i] <= '9') { num += s[i]; i++; }
        if (!num) throw new Error('负号后需要数字');
        if (i < s.length && s[i] === '!') throw new Error('阶乘仅支持非负整数');
        tokens.push({ type: TOK_NUM, value: -Number(num), raw: '-' + num });
      } else { tokens.push({ type: TOK_OP, value: ch, raw: ch }); i++; }
      continue;
    }
    if (ch === '(') { tokens.push({ type: TOK_LP, value: '(', raw: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TOK_RP, value: ')', raw: ')' }); i++;
      if (i < s.length && s[i] === '!' && hasFactorial()) { tokens.push({ type: TOK_OP, value: '!', raw: '!' }); i++; }
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

// ==================== AI 求解器（四则运算 + 括号） ====================
let _aiCache = new Map(), _lastCheckedHand = '';

function aiSolve(hand, target, ops) {
  const key = hand.slice().sort((a, b) => a - b).join(',') + '_' + target + '_' + ops.join('');
  if (_aiCache.has(key)) return _aiCache.get(key);

  const results = [], seen = new Set();
  const vals = hand.map(v => ({ value: v, expr: cardFace(v) }));
  const n = vals.length;
  if (n === 0) { _aiCache.set(key, results); return results; }

  function helper(arr) {
    if (arr.length === 1) {
      const val = arr[0].value;
      if (Math.abs(val - target) < 0.000001) {
        const expr = arr[0].expr;
        if (!seen.has(expr)) { seen.add(expr); results.push(expr); }
      }
      return;
    }
    if (results.length >= 5) return;

    if (hasUnary()) {
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v.expr.startsWith('√') || v.expr.endsWith('!')) continue;
        const rest = arr.filter((_, k) => k !== i);
        if (v.value >= 0) {
          const r = Math.sqrt(v.value);
          helper(rest.concat({ value: r, expr: '√(' + v.expr + ')' }));
        }
        if (hasFactorial() && Number.isInteger(v.value) && v.value >= 0 && v.value <= 20) {
          let f = 1; for (let k = 2; k <= v.value; k++) f *= k;
          helper(rest.concat({ value: f, expr: v.expr + '!' }));
        }
      }
      if (results.length >= 5) return;
    }

    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const rest = arr.filter((_, k) => k !== i && k !== j);

        const binaryOps = Object.values(OPERATORS).filter(o => o.arity === 2 && ops.includes(o.sym));
        for (const op of binaryOps) {
          try {
            const r = op.fn(a.value, b.value);
            if (isFinite(r) && !isNaN(r) && Math.abs(r) < 1e10) {
              helper(rest.concat({ value: r, expr: '(' + a.expr + op.sym + b.expr + ')' }));
            }
          } catch (e) { /* skip invalid operation */ }
          if (op.sym === '-' || op.sym === '/' || op.sym === '^') {
            try {
              const r2 = op.fn(b.value, a.value);
              if (isFinite(r2) && !isNaN(r2) && Math.abs(r2) < 1e10) {
                helper(rest.concat({ value: r2, expr: '(' + b.expr + op.sym + a.expr + ')' }));
              }
            } catch (e) { /* skip invalid operation */ }
          }
        }
        if (results.length >= 5) return;
      }
    }
  }
  helper(vals);
  _aiCache.set(key, results);
  return results;
}