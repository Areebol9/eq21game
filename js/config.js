"use strict";
// ==================== 全局状态 ====================
const game = {
  mode: 'local',
  difficulty: 'easy',
  aiLevel: 'medium',
  aiPlayerIndex: -1,
  deck: [],
  players: [],
  phase: 'menu',
  timerSec: 0, timerInterval: null,
  maxCards: 5, target: 21,
  stats: { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 },
  aiThinking: false, aiTimerId: null, aiCountdown: 0, aiCountdownInterval: null,
  aiSolved: false, aiSolution: null,
  _maxHintShown: false, _firstRender: false,
  currentScore: 0,
  scoreBreakdown: [],
  gameTags: []
};

const State = {
  get(path) {
    return path.split('.').reduce((o, k) => o[k], game);
  },
  set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], game);
    target[last] = value;
    return value;
  },
  reset(fields) {
    Object.assign(game, fields);
  },
  currentPlayer() {
    return game.players[0];
  },
  isPlaying() { return game.phase === 'playing'; },
  isMenu()    { return game.phase === 'menu'; },
  isEnded()   { return game.phase === 'ended'; },
};

const OPERATORS = {
  '+': { sym: '+',  prec: 1, arity: 2, fn: (a, b) => a + b },
  '-': { sym: '-',  prec: 1, arity: 2, fn: (a, b) => a - b },
  '*': { sym: '*',  prec: 2, arity: 2, fn: (a, b) => a * b },
  '/': { sym: '/',  prec: 2, arity: 2, fn: (a, b) => {
    if (b === 0) throw new Error('除数不能为零');
    return a / b;
  }},
  '^': { sym: '^',  prec: 3, arity: 2, fn: (a, b) => {
    if (Math.abs(b) > 100 || (a === 0 && b <= 0)) throw new Error('幂运算参数不合法');
    return Math.pow(a, b);
  }},
  '!': { sym: '!',  prec: 4, arity: 1, fn: (v) => {
    if (!Number.isInteger(v) || v < 0 || v > 20) throw new Error('阶乘仅支持0~20的整数');
    let f = 1; for (let k = 2; k <= v; k++) f *= k;
    return f;
  }},
  '√': { sym: '√',  prec: 4, arity: 1, fn: (v) => {
    if (v < 0) throw new Error('不能对负数开根号');
    return Math.sqrt(v);
  }},
};

function getBinaryOps() {
  const ops = Object.values(OPERATORS).filter(o => o.arity === 2 && o.sym !== '^');
  if (game.difficulty !== 'easy') ops.push(OPERATORS['^']);
  return ops.map(o => o.sym);
}
function hasUnary() { return game.difficulty !== 'easy'; }
function hasFactorial() { return game.difficulty === 'hard'; }

// ==================== 牌库 ====================
function createDeck() {
  const deck = [];
  const max = game.difficulty === 'easy' ? 10 : 13;
  for (let v = 1; v <= max; v++) {
    for (let i = 0; i < 4; i++) deck.push(v);
  }
  return deck;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
function drawCard() { return game.deck.length ? game.deck.pop() : null; }

// ==================== 计时器 ====================
function updateTimerUI() { const m = Math.floor(game.timerSec / 60), s = game.timerSec % 60; document.getElementById('timer').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
function updateDeckCount() { document.getElementById('deck-count').textContent = game.deck.length; }

// ==================== 卡片显示 ====================
const SUITS = ['\u2660','\u2665','\u2663','\u2666'];
function getSuit(v) { return SUITS[(v - 1) % 4]; }
function isRedSuit(v) { const s = getSuit(v); return s === '\u2665' || s === '\u2666'; }
function cardFace(v) { if (v === 1) return 'A'; if (v === 11) return 'J'; if (v === 12) return 'Q'; if (v === 13) return 'K'; return String(v); }
function formatNum(n) { if (typeof n !== 'number' || !isFinite(n)) return String(n); return Number.isInteger(n) ? n.toString() : n.toFixed(6).replace(/0+$/, '').replace(/\.$/, ''); }

// ==================== Web Audio 音效 ====================
let _audioCtx = null;
function _getAudioCtx() {
  if (!_audioCtx) { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function soundPlay(type) {
  try {
    const ctx = _getAudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'draw') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(520, now); osc.frequency.linearRampToValueAtTime(780, now + 0.12);
      gain.gain.setValueAtTime(.15, now); gain.gain.exponentialRampToValueAtTime(.001, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    } else if (type === 'submit') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(600, now); osc.frequency.linearRampToValueAtTime(900, now + 0.08);
      gain.gain.setValueAtTime(.12, now); gain.gain.exponentialRampToValueAtTime(.001, now + 0.18);
      osc.start(now); osc.stop(now + 0.18);
    } else if (type === 'error') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(120, now + 0.2);
      gain.gain.setValueAtTime(.08, now); gain.gain.exponentialRampToValueAtTime(.001, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'flip') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.linearRampToValueAtTime(1200, now + 0.06);
      gain.gain.setValueAtTime(.10, now); gain.gain.exponentialRampToValueAtTime(.001, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'win') {
      const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain(); osc2.connect(gain2); gain2.connect(ctx.destination);
      osc.type = 'triangle'; osc.frequency.setValueAtTime(523, now); osc.frequency.setValueAtTime(659, now + 0.1); osc.frequency.setValueAtTime(784, now + 0.2); osc.frequency.setValueAtTime(1047, now + 0.3);
      gain.gain.setValueAtTime(.18, now); gain.gain.exponentialRampToValueAtTime(.001, now + 0.5);
      osc2.type = 'triangle'; osc2.frequency.setValueAtTime(1047, now + 0.2); osc2.frequency.setValueAtTime(784, now + 0.35);
      gain2.gain.setValueAtTime(.10, now + 0.2); gain2.gain.exponentialRampToValueAtTime(.001, now + 0.5);
      osc.start(now); osc.stop(now + 0.5); osc2.start(now + 0.2); osc2.stop(now + 0.5);
    }
  } catch (e) { /* 静默失败 */ }
}

// ==================== 全角符号自动替换 ====================
const FULLWIDTH_MAP = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '＋': '+', '－': '-', '×': '*', '＊': '*', '÷': '/', '／': '/',
  '（': '(', '）': ')', '＝': '=', '．': '.', '，': ',', '；': ';',
  '＾': '^', '！': '!',
  'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E', 'Ｆ': 'F', 'Ｇ': 'G',
  'Ｈ': 'H', 'Ｉ': 'I', 'Ｊ': 'J', 'Ｋ': 'K', 'Ｌ': 'L', 'Ｍ': 'M',
  'Ｎ': 'N', 'Ｏ': 'O', 'Ｐ': 'P', 'Ｑ': 'Q', 'Ｒ': 'R', 'Ｓ': 'S',
  'Ｔ': 'T', 'Ｕ': 'U', 'Ｖ': 'V', 'Ｗ': 'W', 'Ｘ': 'X', 'Ｙ': 'Y', 'Ｚ': 'Z',
  'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g',
  'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j', 'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm',
  'ｎ': 'n', 'ｏ': 'o', 'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's',
  'ｔ': 't', 'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z'
};
function normalizeInput(str) {
  if (!str) return str;
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    result += FULLWIDTH_MAP[ch] || ch;
  }
  return result;
}