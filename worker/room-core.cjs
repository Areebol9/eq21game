"use strict";

const TARGET_DEFAULT = 21;
const MAX_CARDS = 5;
const RECONNECT_GRACE_MS = 3 * 60 * 1000;
const QUICK_CHAT_COOLDOWN_MS = 1200;
const PLAYING_DISCONNECT_TIMEOUT_MS = 2 * 60 * 1000;
const PRESENCE_DRAFT_MAX_LENGTH = 160;
const PRESENCE_UPDATE_MIN_INTERVAL_MS = 120;
const PRESENCE_ACTIONS = {
  typing: true,
  card: true,
  symbol: true,
  backspace: true,
  clear: true
};
const QUICK_CHAT_TEXT = {
  nice: "漂亮！",
  thinking: "我再想想",
  close: "就差一点！",
  wow: "这牌有难度",
  again: "再来一局",
  solved: "我算出来了！",
  luck: "加油！",
  gg: "打得不错",
  ready: "我准备好了",
  wait: "再等等",
  hurry: "快开始吧",
  hello: "大家好"
};

const FULLWIDTH_MAP = {
  "０": "0", "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
  "＋": "+", "－": "-", "×": "*", "＊": "*", "÷": "/", "／": "/",
  "（": "(", "）": ")", "＝": "=", "．": ".", "，": ",", "；": ";",
  "＾": "^", "！": "!",
  "Ａ": "A", "Ｊ": "J", "Ｑ": "Q", "Ｋ": "K",
  "ａ": "a", "ｊ": "j", "ｑ": "q", "ｋ": "k"
};

function normalizeInput(str) {
  if (!str) return str;
  let result = "";
  for (let i = 0; i < str.length; i++) result += FULLWIDTH_MAP[str[i]] || str[i];
  return result;
}

function formatNum(n) {
  if (typeof n !== "number" || !isFinite(n)) return String(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function cardFace(v) {
  if (v === 1) return "A";
  if (v === 11) return "J";
  if (v === 12) return "Q";
  if (v === 13) return "K";
  return String(v);
}

function sanitizeDifficulty(value) {
  return value === "normal" || value === "hard" ? value : "easy";
}

function getOperators(difficulty) {
  const ops = {
    "+": { prec: 1, arity: 2, fn: (a, b) => a + b },
    "-": { prec: 1, arity: 2, fn: (a, b) => a - b },
    "*": { prec: 2, arity: 2, fn: (a, b) => a * b },
    "/": {
      prec: 2,
      arity: 2,
      fn: (a, b) => {
        if (b === 0) throw new Error("除数不能为零");
        return a / b;
      }
    }
  };
  if (difficulty !== "easy") {
    ops["^"] = {
      prec: 3,
      arity: 2,
      fn: (a, b) => {
        if (Math.abs(b) > 100 || (a === 0 && b <= 0)) throw new Error("幂运算参数不合法");
        return Math.pow(a, b);
      }
    };
    ops["√"] = {
      prec: 4,
      arity: 1,
      fn: (v) => {
        if (v < 0) throw new Error("不能对负数开根号");
        return Math.sqrt(v);
      }
    };
  }
  if (difficulty === "hard") {
    ops["!"] = {
      prec: 4,
      arity: 1,
      fn: factorial
    };
  }
  return ops;
}

function factorial(v) {
  if (!Number.isInteger(v) || v < 0 || v > 20) throw new Error("阶乘仅支持0~20的整数");
  let f = 1;
  for (let k = 2; k <= v; k++) f *= k;
  return f;
}

function tokenize(expr, difficulty) {
  const TOK_NUM = "NUM";
  const TOK_OP = "OP";
  const TOK_LP = "LP";
  const TOK_RP = "RP";
  const TOK_SQRT = "SQRT";
  const tokens = [];
  let i = 0;
  const s = String(expr || "").trim();
  const ops = getOperators(difficulty);

  function canStartNegativeNumber() {
    if (!tokens.length) return true;
    const prev = tokens[tokens.length - 1];
    return prev.type === TOK_LP || (prev.type === TOK_OP && prev.value !== "!");
  }

  function pushFaceToken(value, raw) {
    i++;
    if (i < s.length && s[i] === "!") {
      if (difficulty !== "hard") throw new Error("阶乘仅在困难模式可用");
      i++;
      tokens.push({ type: TOK_NUM, value: factorial(value), raw: raw + "!" });
    } else {
      tokens.push({ type: TOK_NUM, value, raw });
    }
  }

  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "A" || ch === "a") {
      pushFaceToken(1, "A");
      continue;
    }
    if (ch === "J" || ch === "j") {
      pushFaceToken(11, "J");
      continue;
    }
    if (ch === "Q" || ch === "q") {
      pushFaceToken(12, "Q");
      continue;
    }
    if (ch === "K" || ch === "k") {
      pushFaceToken(13, "K");
      continue;
    }
    if (ch === "√") {
      if (difficulty === "easy") throw new Error("非法字符: '√'");
      i++;
      let num = "";
      while (i < s.length && s[i] >= "0" && s[i] <= "9") {
        num += s[i];
        i++;
      }
      if (num) {
        tokens.push({ type: TOK_NUM, value: Math.sqrt(Number(num)), raw: "√" + num });
      } else if (i < s.length && s[i] === "(") {
        tokens.push({ type: TOK_SQRT, value: "√", raw: "√" });
        tokens.push({ type: TOK_LP, value: "(", raw: "(" });
        i++;
      } else if (i < s.length) {
        const nc = s[i];
        if (nc === "A" || nc === "a") tokens.push({ type: TOK_NUM, value: 1, raw: "√A" });
        else if (nc === "J" || nc === "j") tokens.push({ type: TOK_NUM, value: Math.sqrt(11), raw: "√J" });
        else if (nc === "Q" || nc === "q") tokens.push({ type: TOK_NUM, value: Math.sqrt(12), raw: "√Q" });
        else if (nc === "K" || nc === "k") tokens.push({ type: TOK_NUM, value: Math.sqrt(13), raw: "√K" });
        else throw new Error("√ 后面需要数字或括号");
        i++;
      } else {
        throw new Error("√ 后面需要数字或括号");
      }
      continue;
    }
    if (s.substr(i, 5).toLowerCase() === "sqrt(") {
      if (difficulty === "easy") throw new Error("非法字符: 's'");
      tokens.push({ type: TOK_SQRT, value: "sqrt", raw: "sqrt" });
      tokens.push({ type: TOK_LP, value: "(", raw: "(" });
      i += 5;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      let num = "";
      while (i < s.length && s[i] >= "0" && s[i] <= "9") {
        num += s[i];
        i++;
      }
      if (i < s.length && s[i] === "!") {
        if (difficulty !== "hard") throw new Error("阶乘仅在困难模式可用");
        i++;
        tokens.push({ type: TOK_NUM, value: factorial(Number(num)), raw: num + "!" });
      } else {
        tokens.push({ type: TOK_NUM, value: Number(num), raw: num });
      }
      continue;
    }
    if (ch === "^") {
      if (!ops["^"]) throw new Error("非法字符: '^'");
      tokens.push({ type: TOK_OP, value: "^", raw: "^" });
      i++;
      continue;
    }
    if ("+-*/".includes(ch)) {
      if (ch === "-" && canStartNegativeNumber()) {
        i++;
        let num = "";
        while (i < s.length && s[i] >= "0" && s[i] <= "9") {
          num += s[i];
          i++;
        }
        if (!num) throw new Error("负号后需要数字");
        if (i < s.length && s[i] === "!") throw new Error("阶乘仅支持非负整数");
        tokens.push({ type: TOK_NUM, value: -Number(num), raw: "-" + num });
      } else {
        tokens.push({ type: TOK_OP, value: ch, raw: ch });
        i++;
      }
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: TOK_LP, value: "(", raw: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: TOK_RP, value: ")", raw: ")" });
      i++;
      if (i < s.length && s[i] === "!") {
        if (difficulty !== "hard") throw new Error("阶乘仅在困难模式可用");
        tokens.push({ type: TOK_OP, value: "!", raw: "!" });
        i++;
      }
      continue;
    }
    throw new Error("非法字符: '" + ch + "'");
  }
  return tokens;
}

function toRPN(tokens, difficulty) {
  const out = [];
  const stack = [];
  const ops = getOperators(difficulty);
  function prec(op) {
    return ops[op] ? ops[op].prec : 0;
  }
  for (const token of tokens) {
    if (token.type === "NUM") out.push(token);
    else if (token.type === "SQRT") stack.push(token);
    else if (token.type === "OP") {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.type === "SQRT" || (top.type === "OP" && (prec(top.value) > prec(token.value) || (prec(top.value) === prec(token.value) && token.value !== "^")))) {
          out.push(stack.pop());
        } else {
          break;
        }
      }
      stack.push(token);
    } else if (token.type === "LP") {
      stack.push(token);
    } else if (token.type === "RP") {
      while (stack.length && stack[stack.length - 1].type !== "LP") out.push(stack.pop());
      if (!stack.length) throw new Error("括号不匹配");
      stack.pop();
    }
  }
  while (stack.length) {
    const top = stack.pop();
    if (top.type === "LP" || top.type === "RP") throw new Error("括号不匹配");
    out.push(top);
  }
  return out;
}

function evalRPN(rpn, difficulty) {
  const stack = [];
  const ops = getOperators(difficulty);
  for (const token of rpn) {
    if (token.type === "NUM") {
      stack.push(token.value);
    } else if (token.type === "SQRT") {
      if (stack.length < 1) throw new Error("√ 需要操作数");
      const v = stack.pop();
      if (v < 0) throw new Error("不能对负数开根号");
      stack.push(Math.sqrt(v));
    } else if (token.type === "OP") {
      const op = ops[token.value];
      if (!op) throw new Error("未知运算符");
      if (op.arity === 1) {
        if (stack.length < 1) throw new Error("表达式不完整");
        stack.push(op.fn(stack.pop()));
      } else {
        if (stack.length < 2) throw new Error("表达式不完整");
        const b = stack.pop();
        const a = stack.pop();
        const result = op.fn(a, b);
        if (!isFinite(result) || isNaN(result)) throw new Error("计算结果溢出");
        stack.push(result);
      }
    }
  }
  if (stack.length !== 1) throw new Error("表达式不完整");
  return stack[0];
}

function evaluate(expr, difficulty) {
  return evalRPN(toRPN(tokenize(expr, sanitizeDifficulty(difficulty)), sanitizeDifficulty(difficulty)), sanitizeDifficulty(difficulty));
}

function extractNumbers(expr) {
  const cleaned = String(expr || "").replace(/sqrt\(/gi, "").replace(/√/g, "");
  const upper = cleaned.toUpperCase();
  const vals = [];
  for (let i = 0; i < upper.length; i++) {
    if (upper[i] === "A") vals.push(1);
    else if (upper[i] === "J") vals.push(11);
    else if (upper[i] === "Q") vals.push(12);
    else if (upper[i] === "K") vals.push(13);
  }
  const re = /\d+/g;
  let match;
  while ((match = re.exec(cleaned)) !== null) vals.push(Number(match[0]));
  return vals;
}

function validateHand(expr, hand) {
  const used = extractNumbers(expr);
  const a = used.slice().sort((x, y) => x - y);
  const b = hand.slice().sort((x, y) => x - y);
  const invalidVals = used.filter(v => !Number.isInteger(v) || v < 1 || v > 13);
  if (invalidVals.length > 0) return { valid: false, reason: "invalidNumbers", invalidVals: Array.from(new Set(invalidVals)) };
  const handSet = new Set(hand);
  const anyMatch = used.some(v => handSet.has(v));
  if (used.length > 0 && !anyMatch) return { valid: false, reason: "noMatch" };
  if (a.length !== b.length) {
    if (a.length < b.length) return { valid: false, reason: "notAllUsed", missing: b.length - a.length };
    return { valid: false, reason: "extraCards", extra: a.length - b.length };
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}

function createDeck(difficulty) {
  const deck = [];
  const max = sanitizeDifficulty(difficulty) === "easy" ? 10 : 13;
  for (let v = 1; v <= max; v++) {
    for (let i = 0; i < 4; i++) deck.push(v);
  }
  return deck;
}

function shuffle(deck, random) {
  const rnd = typeof random === "function" ? random : Math.random;
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

function makeId(prefix, random) {
  const rnd = typeof random === "function" ? random : Math.random;
  return prefix + Math.floor(rnd() * 0xffffffff).toString(36).padStart(6, "0") + Date.now().toString(36).slice(-4);
}

function makeRoomCode(random) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rnd = typeof random === "function" ? random : Math.random;
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(rnd() * alphabet.length)];
  return code;
}

function trimName(name, fallback) {
  const value = String(name || "").trim().replace(/\s+/g, " ");
  return (value || fallback || "玩家").slice(0, 12);
}

function addEvent(room, type, message, now, meta) {
  room.events.push({
    id: room.version + "-" + room.events.length,
    ts: now,
    type,
    message,
    meta: meta || {}
  });
  if (room.events.length > 80) room.events.shift();
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    hand: player.hand.slice(),
    connected: !!player.connected,
    ready: !!player.ready,
    conceded: !!player.conceded,
    host: !!player.host,
    feedback: player.feedback || "",
    feedbackType: player.feedbackType || "",
    lastSeenAt: player.lastSeenAt || player.joinedAt || 0
  };
}

function publicRoom(room, viewerId) {
  return {
    schemaVersion: room.schemaVersion,
    roomCode: room.roomCode,
    phase: room.phase,
    difficulty: room.difficulty,
    target: room.target,
    maxPlayers: room.maxPlayers,
    maxCards: room.maxCards,
    hostId: room.hostId,
    winnerId: room.winnerId,
    startedAt: room.startedAt,
    endedAt: room.endedAt,
    deckCount: room.deck.length,
    players: room.players.map(publicPlayer),
    events: room.events.slice(-30),
    version: room.version,
    you: viewerId ? getSeatInfo(room, viewerId) : null
  };
}

function getSeatInfo(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  return {
    playerId: player.id,
    seatToken: player.seatToken,
    isHost: player.id === room.hostId
  };
}

function createRoom(options) {
  const now = Number(options && options.now) || Date.now();
  const random = options && options.random;
  const roomCode = String((options && options.roomCode) || makeRoomCode(random)).toUpperCase();
  const maxPlayers = Math.max(2, Math.min(4, Number(options && options.maxPlayers) || 4));
  const hostId = makeId("p_", random);
  const host = {
    id: hostId,
    seatToken: makeId("s_", random),
    name: trimName(options && options.name, "房主"),
    hand: [],
    connected: false,
    ready: true,
    conceded: false,
    host: true,
    feedback: "",
    feedbackType: "",
    joinedAt: now,
    lastSeenAt: now,
    lastChatAt: 0
  };
  const room = {
    schemaVersion: 1,
    roomCode,
    phase: "lobby",
    difficulty: sanitizeDifficulty(options && options.difficulty),
    target: Number(options && options.target) || TARGET_DEFAULT,
    maxPlayers,
    maxCards: MAX_CARDS,
    hostId,
    players: [host],
    deck: [],
    startedAt: null,
    endedAt: null,
    winnerId: null,
    version: 1,
    events: []
  };
  addEvent(room, "room", "房间已创建，等待玩家加入", now);
  return room;
}

function joinRoom(room, options) {
  const now = Number(options && options.now) || Date.now();
  pruneExpiredSeats(room, now);
  autoForfeitDisconnected(room, now);
  if (room.phase === "ended") throw makeRoomError("room_ended", "room_ended");
  const name = trimName(options && options.name, "玩家");
  let player = null;
  if (options && options.playerId && options.seatToken) {
    player = room.players.find(p => p.id === options.playerId && p.seatToken === options.seatToken);
  }
  if (player) {
    player.connected = true;
    player.name = name || player.name;
    player.lastSeenAt = now;
    player.feedback = "";
    player.feedbackType = "";
    bump(room);
    addEvent(room, "join", player.name + " 回到房间", now, { playerId: player.id });
    return { player, reconnected: true };
  }
  if (room.phase !== "lobby") throw new Error("对局已经开始，暂不能加入");
  if (room.players.length >= room.maxPlayers) throw new Error("房间已满");
  player = {
    id: makeId("p_", options && options.random),
    seatToken: makeId("s_", options && options.random),
    name,
    hand: [],
    connected: true,
    ready: false,
    conceded: false,
    host: false,
    feedback: "",
    feedbackType: "",
    joinedAt: now,
    lastSeenAt: now,
    lastChatAt: 0
  };
  room.players.push(player);
  bump(room);
  addEvent(room, "join", player.name + " 加入房间", now, { playerId: player.id });
  return { player, reconnected: false };
}

function markDisconnected(room, playerId, now) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return false;
  player.connected = false;
  player.lastSeenAt = Number(now) || Date.now();
  bump(room);
  addEvent(room, "leave", player.name + " 暂时离线，座位会保留几分钟", player.lastSeenAt, { playerId });
  return true;
}

function removePlayer(room, playerId, now) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return false;
  room.players = room.players.filter(p => p.id !== playerId);
  if (room.hostId === playerId && room.players[0]) {
    room.players[0].host = true;
    room.hostId = room.players[0].id;
  }
  bump(room);
  addEvent(room, "leave", player.name + " 离开了房间", now || Date.now(), { playerId });
  return true;
}

function pruneExpiredSeats(room, now) {
  if (room.phase !== "lobby") return 0;
  const cutoff = (Number(now) || Date.now()) - RECONNECT_GRACE_MS;
  const before = room.players.length;
  room.players = room.players.filter(player => player.connected || player.host || player.lastSeenAt >= cutoff);
  if (!room.players.some(player => player.id === room.hostId) && room.players[0]) {
    room.players[0].host = true;
    room.hostId = room.players[0].id;
  }
  const removed = before - room.players.length;
  if (removed > 0) bump(room);
  return removed;
}

function autoForfeitDisconnected(room, now) {
  if (room.phase !== "playing") return 0;
  now = Number(now) || Date.now();
  let count = 0;
  for (const player of room.players) {
    if (!player.connected && !player.conceded && player.lastSeenAt && (now - player.lastSeenAt > PLAYING_DISCONNECT_TIMEOUT_MS)) {
      player.conceded = true;
      player.feedback = "断线超时，自动认输";
      player.feedbackType = "";
      addEvent(room, "concede", player.name + " 断线过久自动认输", now, { playerId: player.id });
      count++;
    }
  }
  if (count > 0) {
    bump(room);
    if (!room.players.some(p => p.id === room.hostId && !p.conceded)) {
      const nextHost = room.players.find(p => !p.conceded);
      if (nextHost) { nextHost.host = true; room.hostId = nextHost.id; }
    }
    const active = room.players.filter(p => !p.conceded);
    if (active.length <= 1) {
      room.phase = "ended";
      room.winnerId = active[0] ? active[0].id : null;
      room.endedAt = now;
      if (active[0]) {
        active[0].feedback = "对手断线，获胜！";
        active[0].feedbackType = "ok";
        addEvent(room, "win", active[0].name + " 获胜（对手断线）", now, { playerId: active[0].id });
      } else {
        addEvent(room, "end", "本局无胜者", now);
      }
    }
  }
  return count;
}

function bump(room) {
  room.version += 1;
}

function requirePlayer(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) throw new Error("未找到玩家座位");
  return player;
}

function makeRoomError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function setReady(room, playerId, ready, now) {
  if (room.phase !== "lobby") throw new Error("对局已经开始");
  const player = requirePlayer(room, playerId);
  player.ready = !!ready;
  bump(room);
  addEvent(room, "ready", player.name + (player.ready ? " 已准备" : " 取消准备"), now || Date.now(), { playerId });
}

function startGame(room, playerId, options) {
  const now = Number(options && options.now) || Date.now();
  const random = options && options.random;
  if (room.phase !== "lobby") throw new Error("对局已经开始");
  if (playerId !== room.hostId) throw new Error("只有房主可以开始");
  if (room.players.length < 2) throw new Error("至少需要2名玩家");
  const unready = room.players.filter(p => !p.ready && p.id !== room.hostId);
  if (unready.length) throw new Error("还有玩家未准备");
  room.deck = shuffle(createDeck(room.difficulty), random);
  room.players.forEach(player => {
    player.hand = [];
    player.conceded = false;
    player.feedback = "";
    player.feedbackType = "";
    for (let i = 0; i < 3; i++) player.hand.push(room.deck.pop());
  });
  room.phase = "playing";
  room.startedAt = now;
  room.endedAt = null;
  room.winnerId = null;
  bump(room);
  addEvent(room, "start", "对局开始，目标是 " + room.target, now);
}

function drawCardForPlayer(room, playerId, now) {
  now = Number(now) || Date.now();
  if (room.phase !== "playing") throw new Error("当前不能加牌");
  const player = requirePlayer(room, playerId);
  if (player.conceded) throw new Error("你已认输");
  if (player.hand.length >= room.maxCards) throw new Error("已达到手牌上限");
  if (!room.deck.length) throw new Error("牌库已空");
  const card = room.deck.pop();
  player.hand.push(card);
  player.feedback = "+牌 → " + cardFace(card);
  player.feedbackType = "ok";
  bump(room);
  addEvent(room, "draw", player.name + " +牌 → " + cardFace(card), now, { playerId, card });
  return card;
}

function submitFormula(room, playerId, rawExpr, now) {
  now = Number(now) || Date.now();
  if (room.phase !== "playing") throw new Error("当前不能提交");
  const player = requirePlayer(room, playerId);
  if (player.conceded) throw new Error("你已认输");
  const expr = normalizeInput(String(rawExpr || "")).trim();
  if (!expr) throw new Error("请输入算式");
  if (expr.length > 160) throw new Error("算式太长了");
  const handValidation = validateHand(expr, player.hand);
  if (!handValidation.valid) {
    player.feedback = handErrorMessage(handValidation);
    player.feedbackType = "err";
    bump(room);
    addEvent(room, "submit", player.name + " 提交的算式未通过手牌校验", now, { playerId });
    return { ok: false, result: null };
  }
  let result;
  try {
    result = evaluate(expr, room.difficulty);
  } catch (error) {
    player.feedback = "算式格式错误: " + error.message;
    player.feedbackType = "err";
    bump(room);
    addEvent(room, "submit", player.name + " 提交了非法算式", now, { playerId });
    return { ok: false, result: null, error: error.message };
  }
  if (Math.abs(result - room.target) < 0.000001) {
    room.phase = "ended";
    room.winnerId = player.id;
    room.endedAt = now;
    player.feedback = "获胜！" + expr + " = " + room.target;
    player.feedbackType = "ok";
    bump(room);
    addEvent(room, "win", player.name + " 获胜！" + expr + " = " + room.target, now, { playerId, expr });
    return { ok: true, win: true, result };
  }
  player.feedback = "结果 = " + formatNum(result) + "，还不是 " + room.target;
  player.feedbackType = "err";
  bump(room);
  addEvent(room, "submit", player.name + " 提交 = " + formatNum(result), now, { playerId, expr, result });
  return { ok: false, result };
}

function handErrorMessage(handValidation) {
  if (handValidation.reason === "notAllUsed") return "还有 " + handValidation.missing + " 张牌没用";
  if (handValidation.reason === "extraCards") return "多用了 " + handValidation.extra + " 张牌";
  if (handValidation.reason === "noMatch") return "没有用到自己的手牌";
  if (handValidation.reason === "invalidNumbers") return "使用了不存在的牌值 " + handValidation.invalidVals.join(", ");
  return "手牌不匹配";
}

function concedePlayer(room, playerId, now) {
  now = Number(now) || Date.now();
  if (room.phase !== "playing") throw new Error("当前不能认输");
  const player = requirePlayer(room, playerId);
  if (player.conceded) throw new Error("你已经认输了");
  player.conceded = true;
  player.feedback = "已认输";
  player.feedbackType = "";
  addEvent(room, "concede", player.name + " 认输", now, { playerId });
  const active = room.players.filter(p => !p.conceded);
  if (active.length <= 1) {
    room.phase = "ended";
    room.winnerId = active[0] ? active[0].id : null;
    room.endedAt = now;
    if (active[0]) {
      active[0].feedback = "对手认输，获胜！";
      active[0].feedbackType = "ok";
      addEvent(room, "win", active[0].name + " 获胜", now, { playerId: active[0].id });
    } else {
      addEvent(room, "end", "本局无胜者", now);
    }
  }
  bump(room);
}

function quickChat(room, playerId, chatId, now) {
  now = Number(now) || Date.now();
  const player = requirePlayer(room, playerId);
  if (!QUICK_CHAT_TEXT[chatId]) throw new Error("未知快捷短语");
  if (player.lastChatAt && now - player.lastChatAt < QUICK_CHAT_COOLDOWN_MS) throw new Error("说慢一点点");
  player.lastChatAt = now;
  bump(room);
  addEvent(room, "chat", player.name + "：" + QUICK_CHAT_TEXT[chatId], now, { playerId, chatId });
}

function sanitizePresenceAction(value) {
  const action = String(value || "typing");
  return PRESENCE_ACTIONS[action] ? action : "typing";
}

function sanitizeDraft(value) {
  return normalizeInput(String(value || "")).slice(0, PRESENCE_DRAFT_MAX_LENGTH);
}

function createPresenceUpdate(room, playerId, payload, options) {
  const now = Number(options && options.now) || Date.now();
  if (room.phase !== "playing") throw new Error("当前不能同步操作");
  const player = requirePlayer(room, playerId);
  if (player.conceded) throw new Error("你已认输");
  payload = payload || {};
  const rawCardIndex = Number(payload.cardIndex);
  const cardIndex = Number.isInteger(rawCardIndex) && rawCardIndex >= 0 && rawCardIndex < player.hand.length ? rawCardIndex : null;
  const rawSeq = Number(payload.seq);
  return {
    type: "presence_update",
    playerId,
    draft: sanitizeDraft(payload.draft),
    action: sanitizePresenceAction(payload.action),
    cardIndex,
    cardValue: cardIndex === null ? null : player.hand[cardIndex],
    symbol: String(payload.symbol || "").slice(0, 8),
    seq: Number.isFinite(rawSeq) && rawSeq > 0 ? Math.floor(rawSeq) : 0,
    ts: now
  };
}

function applyAction(room, playerId, action, options) {
  autoForfeitDisconnected(room, options && options.now ? options.now : Date.now());
  const type = action && action.type;
  const payload = (action && action.payload) || {};
  const now = Number(options && options.now) || Date.now();
  if (type === "ready") setReady(room, playerId, payload.ready !== false, now);
  else if (type === "start_game") startGame(room, playerId, { now, random: options && options.random });
  else if (type === "draw_card") drawCardForPlayer(room, playerId, now);
  else if (type === "submit_formula") submitFormula(room, playerId, payload.expr, now);
  else if (type === "concede") concedePlayer(room, playerId, now);
  else if (type === "quick_chat") quickChat(room, playerId, payload.id, now);
  else if (type === "heartbeat") return { type: "pong", ts: now };
  else throw new Error("未知操作: " + type);
  return { type: "ok", version: room.version };
}

module.exports = {
  TARGET_DEFAULT,
  MAX_CARDS,
  RECONNECT_GRACE_MS,
  PLAYING_DISCONNECT_TIMEOUT_MS,
  PRESENCE_DRAFT_MAX_LENGTH,
  PRESENCE_UPDATE_MIN_INTERVAL_MS,
  QUICK_CHAT_TEXT,
  normalizeInput,
  evaluate,
  validateHand,
  extractNumbers,
  createDeck,
  shuffle,
  makeRoomCode,
  createRoom,
  joinRoom,
  markDisconnected,
  removePlayer,
  pruneExpiredSeats,
  autoForfeitDisconnected,
  publicRoom,
  getSeatInfo,
  setReady,
  startGame,
  drawCardForPlayer,
  submitFormula,
  concedePlayer,
  quickChat,
  createPresenceUpdate,
  applyAction,
  cardFace,
  formatNum
};
