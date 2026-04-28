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
  solutionRating: null,
  gameTags: [],
  solutionCache: { handKey: '', simple: [], cool: [], pending: false, timedOut: false },
  solutionWorker: null,
  solutionTaskId: 0,
  coolHintUsed: false,
  soundEnabled: true
};

const SOLVE_BUDGETS = {
  autoHintMs: 80,
  manualHintMs: 300,
  aiThinkMs: 500
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
let _audioCtxPromise = null;
function _getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _audioCtxPromise = null;
  }
  if (_audioCtx.state === 'suspended' && !_audioCtxPromise) {
    _audioCtxPromise = _audioCtx.resume();
  }
  return _audioCtx;
}
async function soundPlay(type) {
  if (!game.soundEnabled) return;
  try {
    if (_audioCtxPromise) { try { await _audioCtxPromise; } catch (e) { _audioCtxPromise = null; return; } _audioCtxPromise = null; }
    const ctx = _getAudioCtx();
    const now = ctx.currentTime;

    if (type === 'click') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 330;
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.04);
    } else if (type === 'draw') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.12);
    } else if (type === 'submit') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(392, now);
      osc.frequency.linearRampToValueAtTime(330, now + 0.12);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'error') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(175, now + 0.15);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.18);
    } else if (type === 'win') {
      const osc1 = ctx.createOscillator(); const gain1 = ctx.createGain();
      const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
      osc1.type = 'sine'; osc2.type = 'sine';
      osc1.frequency.setValueAtTime(523, now);
      osc1.frequency.setValueAtTime(659, now + 0.12);
      osc1.frequency.setValueAtTime(784, now + 0.24);
      osc1.frequency.setValueAtTime(1047, now + 0.36);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.10, now + 0.10);
      gain1.gain.setValueAtTime(0.10, now + 0.35);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.frequency.setValueAtTime(1047, now + 0.24);
      osc2.frequency.setValueAtTime(784, now + 0.40);
      gain2.gain.setValueAtTime(0.001, now + 0.24);
      gain2.gain.linearRampToValueAtTime(0.06, now + 0.32);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.60);
      osc1.connect(gain1); gain1.connect(ctx.destination);
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc1.start(now); osc1.stop(now + 0.65);
      osc2.start(now + 0.24); osc2.stop(now + 0.60);
    }
  } catch (e) { /* 静默失败 */ }
}

// ==================== 音效开关 ====================
function toggleSound() {
  game.soundEnabled = !game.soundEnabled;
  localStorage.setItem('eq21_sound', game.soundEnabled ? 'on' : 'off');
  updateSoundButton();
}
function updateSoundButton() {
  const btn = document.getElementById('btn-sound');
  if (btn) {
    btn.innerHTML = '<span class="btn-icon">' + (game.soundEnabled ? '🔊' : '🔇') + '</span>';
    btn.title = game.soundEnabled ? '关闭音效' : '开启音效';
    btn.setAttribute('aria-label', btn.title);
  }
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
