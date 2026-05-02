#!/usr/bin/env node
"use strict";

/**
 * Equation 21 lightweight DOM/flow tests.
 *
 * This runs the real browser scripts inside a Node vm with a small fake DOM.
 * It intentionally avoids browser automation dependencies, networking, and
 * repo writes. Use E2E later for visual layout, animation, and real PWA checks.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT_ORDER = [
  "js/i18n.js",
  "js/config.js",
  "js/expression.js",
  "js/history.js",
  "js/icons.js",
  "js/ui.js",
  "js/online.js",
  "js/game.js",
  "js/main.js",
];

let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, actual, expected) {
  const ok = typeof expected === "function" ? expected(actual) : actual === expected;
  if (ok) {
    passed++;
    if (process.argv.includes("-v")) console.log(`  \x1b[32m✓\x1b[0m ${desc}`);
  } else {
    failed++;
    const msg = `  \x1b[31m✗\x1b[0m ${desc}\n     expected: ${JSON.stringify(expected)}\n     actual: ${JSON.stringify(actual)}`;
    console.log(msg);
    failures.push({ desc, expected, actual });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

class ClassList {
  constructor() {
    this.items = new Set();
  }
  add(...names) {
    names.forEach(name => { if (name) this.items.add(name); });
  }
  remove(...names) {
    names.forEach(name => this.items.delete(name));
  }
  contains(name) {
    return this.items.has(name);
  }
  toggle(name, force) {
    if (force === undefined) {
      if (this.items.has(name)) {
        this.items.delete(name);
        return false;
      }
      if (name) this.items.add(name);
      return true;
    }
    if (force) {
      if (name) this.items.add(name);
      return true;
    }
    this.items.delete(name);
    return false;
  }
  toString() {
    return Array.from(this.items).join(" ");
  }
  setFromString(value) {
    this.items = new Set(String(value).split(/\s+/).filter(Boolean));
  }
}

class FakeElement {
  constructor(document, tagName, id) {
    this.ownerDocument = document;
    this.tagName = String(tagName || "div").toUpperCase();
    this.id = id || "";
    this.children = [];
    this.parentNode = null;
    this.classList = new ClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.eventListeners = {};
    this.value = "";
    this.disabled = false;
    this.onclick = null;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this._textContent = "";
    this._innerHTML = null;
  }

  get className() {
    return this.classList.toString();
  }
  set className(value) {
    this.classList.setFromString(value);
  }

  get textContent() {
    return this._textContent;
  }
  set textContent(value) {
    this._textContent = String(value);
    this._innerHTML = null;
  }

  get innerHTML() {
    return this._innerHTML === null ? escapeHtml(this._textContent) : this._innerHTML;
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this._textContent = "";
    this.children = [];
    const cardMatch = this._innerHTML.match(/^<div class="(card-shell[^"]*)"/);
    if (cardMatch) {
      const card = new FakeElement(this.ownerDocument, "div");
      card.className = cardMatch[1];
      this.appendChild(card);
    }
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    this.ownerDocument.registerTree(child);
    this.scrollHeight = this.children.length;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") {
      this.id = String(value);
      this.ownerDocument.registerTree(this);
    } else if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    if (name === "id") return this.id || null;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      return this.dataset[key] || null;
    }
    return this.attributes[name] || null;
  }

  addEventListener(type, fn) {
    if (!this.eventListeners[type]) this.eventListeners[type] = [];
    this.eventListeners[type].push(fn);
  }

  dispatchEvent(event) {
    const list = this.eventListeners[event.type] || [];
    list.forEach(fn => fn.call(this, event));
    return true;
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  closest(selector) {
    let cur = this;
    while (cur) {
      if (cur.matches(selector)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.ownerDocument.querySelector(selector, this);
  }

  querySelectorAll(selector) {
    return this.ownerDocument.querySelectorAll(selector, this);
  }

  focus() {}

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

class FakeDocument {
  constructor() {
    this.byId = new Map();
    this.readyState = "loading";
    this.eventListeners = {};
    this.body = new FakeElement(this, "body", "body");
    this.registerTree(this.body);
    this.activeElement = null;
  }

  registerTree(el) {
    if (el.id) this.byId.set(el.id, el);
    for (const child of el.children) this.registerTree(child);
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  createTextNode(text) {
    const el = new FakeElement(this, "#text");
    el.textContent = text;
    return el;
  }

  getElementById(id) {
    return this.byId.get(id) || null;
  }

  addEventListener(type, fn) {
    if (!this.eventListeners[type]) this.eventListeners[type] = [];
    this.eventListeners[type].push(fn);
  }

  querySelector(selector, root) {
    return this.querySelectorAll(selector, root)[0] || null;
  }

  querySelectorAll(selector, root) {
    const scope = root || this.body;
    const all = [];
    walk(scope, el => all.push(el));
    return all.filter(el => matchesSelector(el, selector));
  }
}

function walk(el, visit) {
  visit(el);
  for (const child of el.children) walk(child, visit);
}

function matchesSelector(el, selector) {
  selector = String(selector).trim();
  if (!selector) return false;

  if (selector.includes(",")) {
    return selector.split(",").some(part => matchesSelector(el, part.trim()));
  }

  if (selector.includes(" ")) {
    const parts = selector.split(/\s+/);
    const last = parts.pop();
    if (!matchesSelector(el, last)) return false;
    let cur = el.parentNode;
    while (parts.length > 0) {
      const need = parts.pop();
      while (cur && !matchesSelector(cur, need)) cur = cur.parentNode;
      if (!cur) return false;
      cur = cur.parentNode;
    }
    return true;
  }

  const dataMatch = selector.match(/\[data-([^=]+)=["']?([^"'\]]+)["']?\]/);
  if (dataMatch) {
    const base = selector.slice(0, dataMatch.index);
    const key = dataMatch[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    if (el.dataset[key] !== dataMatch[2]) return false;
    if (!base) return true;
    selector = base;
  }

  if (selector.startsWith("#")) return el.id === selector.slice(1);
  if (selector.startsWith(".")) {
    return selector.slice(1).split(".").every(cls => el.classList.contains(cls));
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function makeElement(document, id, tagName, classes) {
  const el = new FakeElement(document, tagName || "div", id);
  if (classes) el.className = classes;
  document.body.appendChild(el);
  return el;
}

function createDocument() {
  const doc = new FakeDocument();

  [
    "deck-count", "timer", "btn-solo", "btn-local", "btn-ai", "btn-online",
    "btn-back",
    "btn-rules", "btn-close-rules", "rules-overlay", "btn-start-table",
    "btn-table-back", "btn-start-ai", "btn-ai-back", "btn-again", "btn-menu",
    "online-setup-overlay", "online-base-url", "online-player-name",
    "online-room-code", "btn-create-online", "btn-join-online",
    "btn-online-reconnect", "btn-online-back", "online-status",
    "btn-sound", "btn-history", "btn-history-close", "btn-history-clear",
    "log-shell", "btn-log-toggle", "log-toggle-count",
    "main-container",
    "menu-overlay", "table-setup-overlay", "ai-setup-overlay", "result-overlay",
    "result-rematch-status",
    "hint-area", "stats-panel", "players-area", "tabletop-center", "log-panel",
    "footer-bar", "toast-container", "victory-overlay", "table-name-inputs",
    "ai-player-name", "result-icon", "result-title", "result-detail",
    "result-score", "result-tags", "history-panel", "history-stats",
    "history-solo-note", "history-best", "history-records", "history-streak",
    "mode-badge", "diff-badge", "tc-timer", "tc-deck"
  ].forEach(id => makeElement(doc, id));

  ["rules-overlay", "table-setup-overlay", "ai-setup-overlay", "online-setup-overlay", "result-overlay", "hint-area", "stats-panel", "history-panel"].forEach(id => {
    doc.getElementById(id).classList.add("hidden");
  });

  ["btn-solo", "btn-local", "btn-ai", "btn-online"].forEach(id => {
    doc.getElementById(id).classList.add("menu-card");
  });

  ["easy", "normal", "hard"].forEach(diff => {
    const el = makeElement(doc, "", "div", "choice-card diff-option");
    el.dataset.diff = diff;
  });

  ["easy", "medium", "hard"].forEach(level => {
    const el = makeElement(doc, "", "div", "choice-card ai-level-option");
    el.dataset.level = level;
  });

  ["2", "3", "4"].forEach((count, idx) => {
    const el = makeElement(doc, "", "div", "choice-card table-opt" + (idx === 0 ? " selected" : ""));
    el.dataset.players = count;
  });

  ["2", "3", "4"].forEach((count, idx) => {
    const el = makeElement(doc, "", "div", "choice-card online-player-opt" + (idx === 2 ? " selected" : ""));
    el.dataset.players = count;
  });

  return doc;
}

function createEnv(options = {}) {
  const document = createDocument();
  const storage = options.localStorage || new Map();
  const sessionStore = options.sessionStorage || new Map();
  let confirmCount = 0;
  let timerId = 0;
  const isMobile = !!options.mobile;

  const sandbox = {
    console,
    document,
    window: {
      AudioContext: null,
      webkitAudioContext: null,
      innerWidth: isMobile ? 375 : 1024,
      innerHeight: isMobile ? 667 : 768,
      location: { search: options.debugPerf ? "?debug=perf" : "", protocol: "http:", origin: "http://localhost:8000" },
      addEventListener() {},
      removeEventListener() {},
      matchMedia(query) {
        return {
          media: query,
          matches: isMobile && /max-width:\s*699px/.test(query),
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
        };
      }
    },
    navigator: {},
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
      clear() { storage.clear(); }
    },
    sessionStorage: {
      getItem(key) { return sessionStore.has(key) ? sessionStore.get(key) : null; },
      setItem(key, value) { sessionStore.set(key, String(value)); },
      removeItem(key) { sessionStore.delete(key); },
      clear() { sessionStore.clear(); }
    },
    confirm() { confirmCount++; return true; },
    alert() {},
    setTimeout(fn) { fn(); return ++timerId; },
    clearTimeout() {},
    setInterval() { return ++timerId; },
    clearInterval() {},
    requestAnimationFrame(fn) { fn(); return ++timerId; },
    Event: function Event(type, opts) { this.type = type; Object.assign(this, opts || {}); },
  };
  if (options.Worker) {
    sandbox.Worker = options.Worker;
    sandbox.window.Worker = options.Worker;
  }
  sandbox.global = sandbox;

  const ctx = vm.createContext(sandbox);
  for (const script of SCRIPT_ORDER) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, script), "utf8"), ctx, { filename: script });
  }

  return {
    ctx,
    document,
    storage,
    sessionStore,
    getConfirmCount: () => confirmCount,
    run(code) {
      return vm.runInContext(code, ctx);
    }
  };
}

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

section("table setup defaults and player count");
{
  const env = createEnv();
  env.run("init()");

  assert("init selects 2-player table option", env.document.querySelector(".table-opt.selected").dataset.players, "2");
  assert("init creates two table name rows", env.document.getElementById("table-name-inputs").children.length, 2);

  env.run("startMode('local')");
  assert("local mode still selects 2-player table option", env.document.querySelector(".table-opt.selected").dataset.players, "2");
  assert("local mode shows two table name rows", env.document.getElementById("table-name-inputs").children.length, 2);

  const three = env.document.querySelector(".table-opt[data-players='3']");
  three.onclick();
  assert("clicking 3-player option selects 3", env.document.querySelector(".table-opt.selected").dataset.players, "3");
  assert("3-player option creates three name rows", env.document.getElementById("table-name-inputs").children.length, 3);

  const four = env.document.querySelector(".table-opt[data-players='4']");
  four.onclick();
  assert("clicking 4-player option selects 4", env.document.querySelector(".table-opt.selected").dataset.players, "4");
  assert("4-player option creates four name rows", env.document.getElementById("table-name-inputs").children.length, 4);

  env.run("renderAll = function() {}; updateFooterBar = function() {}; startTimer = function() {}; addLog = function() {}; showToast = function() {};");
  env.run("startLocalGame()");
  assert("starting local game uses selected player count", env.run("game.players.length"), 4);
}

section("local rematch reuses remaining deck");
{
  const env = createEnv();
  env.run(`
    init();
    renderAll = function() {};
    updateFooterBar = function() {};
    startTimer = function() {};
    stopTimer = function() {};
    addLog = function() {};
    showToast = function(message) { __toast = message; };
    game.mode = 'local';
    game.phase = 'ended';
    game.players = [
      { name: 'P1', hand: [9, 9, 9], conceded: false, feedback: 'win', feedbackType: 'ok', inputDraft: '9+9+9' },
      { name: 'P2', hand: [8, 8, 8], conceded: true, feedback: 'lost', feedbackType: '', inputDraft: '8+8+8' }
    ];
    game.deck = [1, 2, 3, 4, 5, 6, 7, 8];
    document.getElementById('table-setup-overlay').classList.remove('hidden');
    showResult(0);
    handleAgainGame();
  `);
  assert("local rematch starts playing", env.run("game.phase"), "playing");
  assert("local rematch keeps player order", env.run("game.players.map(p => p.name).join(',')"), "P1,P2");
  assert("local rematch deals from current deck", env.run("JSON.stringify(game.players.map(p => p.hand))"), "[[8,7,6],[5,4,3]]");
  assert("local rematch leaves old hands out of deck", env.run("game.deck.includes(9)"), false);
  assert("local rematch consumes only dealt cards", env.run("JSON.stringify(game.deck)"), "[1,2]");
  assert("local rematch hides setup overlay", env.document.getElementById("table-setup-overlay").classList.contains("hidden"), true);
  assert("local rematch hides result overlay", env.document.getElementById("result-overlay").classList.contains("hidden"), true);

  const shortEnv = createEnv();
  shortEnv.run(`
    init();
    renderAll = function() {};
    updateFooterBar = function() {};
    startTimer = function() {};
    stopTimer = function() {};
    addLog = function() {};
    showToast = function(message) { __toast = message; };
    game.mode = 'local';
    game.phase = 'ended';
    game.players = [
      { name: 'P1', hand: [1, 1, 1], conceded: false, feedback: 'win', feedbackType: 'ok', inputDraft: '' },
      { name: 'P2', hand: [2, 2, 2], conceded: false, feedback: '', feedbackType: '', inputDraft: '' }
    ];
    game.deck = [3, 4, 5, 6, 7];
    showResult(0);
    handleAgainGame();
  `);
  assert("local rematch with short deck remains ended", shortEnv.run("game.phase"), "ended");
  assert("local rematch with short deck does not deal", shortEnv.run("JSON.stringify(game.players.map(p => p.hand))"), "[[1,1,1],[2,2,2]]");
  assert("local rematch with short deck disables button", shortEnv.document.getElementById("btn-again").disabled, true);
  assert("local rematch with short deck shows shortage", shortEnv.document.getElementById("result-rematch-status").textContent.includes("牌库不足"), true);
}

section("header buttons, keyboard activation, and log collapse");
{
  const env = createEnv();
  env.run("init()");

  assert("rules button remains bound", typeof env.document.getElementById("btn-rules").onclick, "function");
  assert("sound button remains bound", typeof env.document.getElementById("btn-sound").onclick, "function");
  assert("history button remains bound", typeof env.document.getElementById("btn-history").onclick, "function");
  assert("menu button remains bound", typeof env.document.getElementById("btn-back").onclick, "function");
  assert("log toggle button is bound", typeof env.document.getElementById("btn-log-toggle").onclick, "function");

  const solo = env.document.getElementById("btn-solo");
  const diff = env.document.querySelector(".diff-option");
  assert("menu cards become keyboard focusable", solo.getAttribute("tabindex"), "0");
  assert("menu cards get button role", solo.getAttribute("role"), "button");
  assert("choice cards become keyboard focusable", diff.getAttribute("tabindex"), "0");
  assert("choice cards get keyboard handler", (diff.eventListeners.keydown || []).length, 1);

  const shell = env.document.getElementById("log-shell");
  const toggle = env.document.getElementById("btn-log-toggle");
  assert("desktop log starts expanded", shell.classList.contains("collapsed"), false);
  assert("desktop log aria starts expanded", toggle.getAttribute("aria-expanded"), "true");

  env.run("addLog('first', 'info'); addLog('second', 'err');");
  assert("addLog writes to visible log panel", env.document.getElementById("log-panel").children.length, 2);
  assert("log count tracks entries", env.document.getElementById("log-toggle-count").textContent, "2");

  toggle.onclick();
  assert("log toggle collapses shell", shell.classList.contains("collapsed"), true);
  assert("log toggle updates collapsed aria", toggle.getAttribute("aria-expanded"), "false");
  assert("collapsing log does not clear entries", env.document.getElementById("log-panel").children.length, 2);

  env.run("addLog('third', 'info');");
  assert("collapsed log still accepts new entries", env.document.getElementById("log-panel").children.length, 3);
  assert("collapsed log count still updates", env.document.getElementById("log-toggle-count").textContent, "3");
}

section("online setup opens without touching local game state");
{
  const env = createEnv();
  env.run("init()");

  env.document.getElementById("btn-online").onclick();

  assert("online button switches mode", env.run("game.mode"), "online");
  assert("online setup is visible", env.document.getElementById("online-setup-overlay").classList.contains("hidden"), false);
  assert("online setup hides menu", env.document.getElementById("menu-overlay").classList.contains("hidden"), true);
  assert("online default service URL is filled", env.document.getElementById("online-base-url").value, "http://localhost:8000");
  assert("online create button is bound", typeof env.document.getElementById("btn-create-online").onclick, "function");

  const two = env.document.querySelector(".online-player-opt[data-players='2']");
  two.onclick();
  assert("online player count selector updates", env.document.querySelector(".online-player-opt.selected").dataset.players, "2");
}

section("online tabletop uses current player relative perspective");
{
  const env = createEnv();
  env.run(`
    init();
    game.mode = 'online';
    game.phase = 'playing';
    game.difficulty = 'easy';
    game.target = 21;
    game.deck = [1, 2, 3, 4];
    game.online.playerId = 'p2';
    game.online.connected = true;
    game.players = [
      { id: 'host', name: 'Host', hand: [10, 10, 1], connected: true, ready: true, conceded: false, feedback: '', feedbackType: '', inputDraft: '' },
      { id: 'p2', name: 'P2', hand: [7, 7, 7], connected: true, ready: true, conceded: false, feedback: '', feedbackType: '', inputDraft: '' }
    ];
    renderAll();
  `);

  const mine = env.document.querySelector(".player-card[data-index='1']");
  const host = env.document.querySelector(".player-card[data-index='0']");
  assert("current player card exists", !!mine, true);
  assert("opponent card exists", !!host, true);
  assert("current player is bottom / upright", mine.classList.contains("player-bottom"), true);
  assert("current player is not rotated", mine.style.transform || "", "");
  assert("opponent is top", host.classList.contains("player-top"), true);
  assert("opponent is rotated", host.style.transform, "rotate(180deg)");
  assert("current player keeps own action buttons enabled", mine.querySelector(".btn-submit").disabled, false);
  assert("opponent action buttons are disabled", host.querySelector(".btn-submit").disabled, true);
}

section("online presence shares opponent draft and card taps");
{
  const env = createEnv();
  env.run(`
    init();
    game.mode = 'online';
    game.phase = 'playing';
    game.difficulty = 'easy';
    game.target = 21;
    game.deck = [1, 2, 3, 4];
    game.online.playerId = 'p2';
    game.online.connected = true;
    game.players = [
      { id: 'host', name: 'Host', hand: [10, 10, 1], connected: true, ready: true, conceded: false, feedback: '', feedbackType: '', inputDraft: '' },
      { id: 'p2', name: 'P2', hand: [7, 7, 7], connected: true, ready: true, conceded: false, feedback: '', feedbackType: '', inputDraft: '' }
    ];
    var __sent = [];
    onlineSocket = { readyState: 1, send: function(text) { __sent.push(JSON.parse(text)); } };
    renderAll();
  `);

  env.run("tableAppendExpr(1, '7', { action: 'card', cardIndex: 0 });");
  const sent = env.run("__sent[0]");
  assert("local card tap sends draft update", sent.type, "draft_update");
  assert("draft update carries expression", sent.payload.draft, "7");
  assert("draft update carries card index", sent.payload.cardIndex, 0);

  env.run(`
    handleOnlineMessage(JSON.stringify({ type: 'presence_update', playerId: 'host', draft: '10+10', action: 'card', cardIndex: 1, seq: 1 }));
  `);
  const host = env.document.querySelector(".player-card[data-index='0']");
  assert("opponent presence updates draft", host.querySelector(".expr-display").textContent, "10+10");
  const tapped = host.querySelectorAll(".card-shell")[1];
  assert("opponent card tap keeps card face up", tapped.classList.contains("is-face-up"), true);
  assert("opponent card tap never turns card face down", tapped.classList.contains("is-face-down"), false);
  assert("opponent card tap animation does not persist in player state", env.run("game.players[0]._remoteCardPulse === undefined"), true);
  assert("opponent card tap animation class is temporary", tapped.classList.contains("remote-card-action"), false);

  env.run(`
    game.players[1].inputDraft = '7';
    handleOnlineMessage(JSON.stringify({ type: 'presence_update', playerId: 'p2', draft: 'wrong', action: 'typing', seq: 99 }));
  `);
  assert("current player ignores own presence echo", env.run("game.players[1].inputDraft"), "7");

  env.run(`
    handleOnlineMessage(JSON.stringify({ type: 'presence_update', playerId: 'host', draft: 'stale', action: 'typing', seq: 1 }));
  `);
  assert("stale opponent presence is ignored", env.run("game.players[0].inputDraft"), "10+10");
}

section("online ended reconnect does not reopen result or duplicate history");
{
  const env = createEnv();
  env.run(`
    init();
    var __showResults = 0;
    var __winSounds = 0;
    var __victoryEffects = 0;
    showResult = function() { __showResults++; document.getElementById('result-overlay').classList.remove('hidden'); };
    soundPlay = function(type) { if (type === 'win') __winSounds++; };
    triggerVictoryEffect = function() { __victoryEffects++; };
    addLog = function() {};
    showToast = function() {};
    function makeOnlineRoom(phase, version) {
      return {
        schemaVersion: 1,
        roomCode: 'ROOM42',
        phase: phase,
        round: 1,
        difficulty: 'easy',
        target: 21,
        maxPlayers: 2,
        maxCards: 5,
        hostId: 'host',
        winnerId: phase === 'ended' ? 'p2' : null,
        startedAt: 100000,
        endedAt: phase === 'ended' ? 121000 : null,
        deckCount: 10,
        rematchVotes: {},
        rematchAgreedCount: 0,
        rematchNeededCount: 2,
        canRematch: phase === 'ended',
        version: version,
        events: [],
        you: { playerId: 'p2', seatToken: 'p2-token', isHost: false },
        players: [
          { id: 'host', name: 'Host', hand: [10, 10, 1], connected: true, ready: true, conceded: false, host: true, feedback: '', feedbackType: '' },
          { id: 'p2', name: 'P2', hand: [7, 7, 7], connected: true, ready: true, conceded: false, host: false, feedback: phase === 'ended' ? 'win' : '', feedbackType: phase === 'ended' ? 'ok' : '' }
        ]
      };
    }
    applyOnlineSnapshot(makeOnlineRoom('playing', 8));
    applyOnlineSnapshot(makeOnlineRoom('ended', 9));
  `);

  let history = JSON.parse(env.storage.get("eq21_history"));
  assert("live online ending opens result once", env.run("__showResults"), 1);
  assert("live online ending plays win sound once", env.run("__winSounds"), 1);
  assert("live online ending triggers victory effect once", env.run("__victoryEffects"), 1);
  assert("live online ending writes one history record", history.records.length, 1);
  assert("online history stores stable result key", history.records[0].onlineResultKey, "ROOM42:r1:p2");
  assert("online result key is persisted", env.storage.has("eq21_online_result_ROOM42:r1:p2"), true);

  env.run("handleOnlineMessage(JSON.stringify({ type: 'game_ended', room: makeOnlineRoom('ended', 9) }));");
  history = JSON.parse(env.storage.get("eq21_history"));
  assert("duplicate ended message does not reopen result", env.run("__showResults"), 1);
  assert("duplicate ended message does not duplicate history", history.records.length, 1);
  env.run("onlineSocket = { readyState: 1, send: function(raw) { __lastSent = JSON.parse(raw); } }; handleAgainGame();");
  assert("online again sends rematch vote", env.run("__lastSent.type"), "rematch_vote");
  assert("online again votes agree", env.run("__lastSent.payload.agreed"), true);
  assert("online again keeps ended room session", env.run("loadOnlineSession().roomCode"), "ROOM42");
  assert("online again does not mark room closed", env.storage.has("eq21_online_closed_ROOM42"), false);
  assert("online again updates vote status", env.document.getElementById("result-rematch-status").textContent.includes("1/2"), true);

  const reconnectEnv = createEnv();
  reconnectEnv.run(`
    init();
    var __showResults = 0;
    showResult = function() { __showResults++; document.getElementById('result-overlay').classList.remove('hidden'); };
    soundPlay = function() {};
    triggerVictoryEffect = function() {};
    addLog = function() {};
    showToast = function() {};
    applyOnlineSnapshot({
      schemaVersion: 1,
      roomCode: 'ROOM43',
      phase: 'ended',
      difficulty: 'easy',
      target: 21,
      maxPlayers: 2,
      maxCards: 5,
      hostId: 'host',
      winnerId: 'p2',
      startedAt: 100000,
      endedAt: 121000,
      deckCount: 10,
      version: 3,
      events: [],
      you: { playerId: 'p2', seatToken: 'p2-token', isHost: false },
      players: [
        { id: 'host', name: 'Host', hand: [10, 10, 1], connected: true, ready: true, conceded: false, host: true, feedback: '', feedbackType: '' },
        { id: 'p2', name: 'P2', hand: [7, 7, 7], connected: true, ready: true, conceded: false, host: false, feedback: 'win', feedbackType: 'ok' }
      ]
    });
  `);
  assert("reconnect into ended room does not open result", reconnectEnv.run("__showResults"), 0);
  assert("reconnect into ended room renders ended phase", reconnectEnv.run("game.phase"), "ended");
  assert("reconnect into ended room does not write history", reconnectEnv.run("loadHistory().records.length"), 0);

  const endedErrorEnv = createEnv();
  endedErrorEnv.run(`
    init();
    saveOnlineSession({ baseUrl: 'http://localhost:8787', roomCode: 'ROOM45', playerId: 'p2', seatToken: 'p2-token', name: 'P2' });
    game.mode = 'online';
    game.online.roomCode = 'ROOM45';
    handleOnlineMessage(JSON.stringify({ type: 'error', code: 'room_ended', error: 'room_ended' }));
  `);
  assert("room_ended error closes old room locally", endedErrorEnv.storage.has("eq21_online_closed_ROOM45"), true);
  assert("room_ended error clears saved session", endedErrorEnv.run("loadOnlineSession() === null"), true);
  assert("room_ended error disables reconnect", endedErrorEnv.document.getElementById("btn-online-reconnect").disabled, true);

  const existingEnv = createEnv();
  existingEnv.storage.set("eq21_history", JSON.stringify({
    version: 1,
    records: [{ id: "old", mode: "online", player: "P2", result: "win", onlineResultKey: "ROOM44:r1:p2" }]
  }));
  existingEnv.run(`
    init();
    var __showResults = 0;
    showResult = function() { __showResults++; };
    soundPlay = function() {};
    triggerVictoryEffect = function() {};
    addLog = function() {};
    showToast = function() {};
    function makeOnlineRoom44(phase, version) {
      return {
        schemaVersion: 1,
        roomCode: 'ROOM44',
        phase: phase,
        difficulty: 'easy',
        target: 21,
        maxPlayers: 2,
        maxCards: 5,
        hostId: 'host',
        winnerId: phase === 'ended' ? 'p2' : null,
        startedAt: 100000,
        endedAt: phase === 'ended' ? 121000 : null,
        deckCount: 10,
        version: version,
        events: [],
        you: { playerId: 'p2', seatToken: 'p2-token', isHost: false },
        players: [
          { id: 'host', name: 'Host', hand: [10, 10, 1], connected: true, ready: true, conceded: false, host: true, feedback: '', feedbackType: '' },
          { id: 'p2', name: 'P2', hand: [7, 7, 7], connected: true, ready: true, conceded: false, host: false, feedback: phase === 'ended' ? 'win' : '', feedbackType: phase === 'ended' ? 'ok' : '' }
        ]
      };
    }
    applyOnlineSnapshot(makeOnlineRoom44('playing', 8));
    applyOnlineSnapshot(makeOnlineRoom44('ended', 9));
  `);
  assert("existing online result key still allows live result UI", existingEnv.run("__showResults"), 1);
  assert("existing online result key prevents duplicate history", existingEnv.run("loadHistory().records.length"), 1);
}

section("online session prefers current window over shared localStorage");
{
  const sharedLocal = new Map();
  const hostSession = new Map();
  const p2Session = new Map();
  const hostEnv = createEnv({ localStorage: sharedLocal, sessionStorage: hostSession });
  const p2Env = createEnv({ localStorage: sharedLocal, sessionStorage: p2Session });

  hostEnv.run(`
    saveOnlineSession({ baseUrl: 'http://localhost:8787', roomCode: 'ROOM42', playerId: 'host', seatToken: 'host-token', name: 'Host' });
  `);
  p2Env.run(`
    saveOnlineSession({ baseUrl: 'http://localhost:8787', roomCode: 'ROOM42', playerId: 'p2', seatToken: 'p2-token', name: 'P2' });
  `);

  assert("host window reloads host seat", hostEnv.run("loadOnlineSession().playerId"), "host");
  assert("host window reloads host token", hostEnv.run("loadOnlineSession().seatToken"), "host-token");
  assert("p2 window reloads p2 seat", p2Env.run("loadOnlineSession().playerId"), "p2");
  assert("p2 window reloads p2 token", p2Env.run("loadOnlineSession().seatToken"), "p2-token");
  assert("shared localStorage stores full session including playerId", JSON.parse(sharedLocal.get("eq21_online_session")).playerId, "p2");

  const thirdEnv = createEnv({ localStorage: sharedLocal, sessionStorage: new Map() });
  const fallback = thirdEnv.run("loadOnlineSession()");
  assert("new window can still see last room", fallback.roomCode, "ROOM42");
  assert("new window fallback inherits last saved seat token", fallback.seatToken, "p2-token");
}

section("mobile log defaults collapsed");
{
  const env = createEnv({ mobile: true });
  env.run("init()");

  assert("mobile log starts collapsed", env.document.getElementById("log-shell").classList.contains("collapsed"), true);
  assert("mobile log aria starts collapsed", env.document.getElementById("btn-log-toggle").getAttribute("aria-expanded"), "false");
}

section("history clear confirmation path");
{
  const env = createEnv();
  env.run("init()");
  env.storage.set("eq21_history", JSON.stringify({ version: 1, records: [{ id: "x", result: "win" }] }));
  env.run("renderHistoryPanel = function() {}; var __opened = 0; openHistory = function() { __opened++; }; showToast = function() {};");

  env.document.getElementById("btn-history-clear").onclick();

  assert("history clear asks for confirmation once", env.getConfirmCount(), 1);
  assert("history clear empties records", JSON.parse(env.storage.get("eq21_history")).records.length, 0);
  assert("history button refreshes history after successful clear", env.run("__opened"), 1);

  env.storage.set("eq21_history", JSON.stringify({ version: 1, records: [{ id: "y", result: "lose" }] }));
  const returned = env.run("clearHistory()");
  assert("clearHistory returns true on successful save", returned, true);
  assert("direct clearHistory does not ask for confirmation", env.getConfirmCount(), 1);
}

section("AI submitted win records human loss");
{
  const env = createEnv();
  env.run(`
    renderAll = function() {};
    showResult = function() {};
    triggerVictoryEffect = function() {};
    renderAll = function() {};
    addLog = function() {};
    showToast = function() {};
    stopTimer = function() {};
    stopAiThinking = function() {};
    game.soundEnabled = false;
    game.mode = 'ai';
    game.difficulty = 'easy';
    game.phase = 'playing';
    game.timerSec = 12;
    game.stats = { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 };
    game.players = [
      { name: 'Human', hand: [1, 1, 1], conceded: false, feedback: '', feedbackType: '', inputDraft: '', isAi: false },
      { name: 'AI', hand: [10, 10, 1], conceded: false, feedback: '', feedbackType: '', inputDraft: '10+10+A', isAi: true }
    ];
    submitFormula(1);
  `);

  const history = JSON.parse(env.storage.get("eq21_history"));
  assert("AI win writes one human history record", history.records.length, 1);
  assert("AI win record belongs to human", history.records[0].player, "Human");
  assert("AI win records human loss", history.records[0].result, "lose");
  assert("AI submitted win ends game", env.run("game.phase"), "ended");
}

section("cool winning formula records rating and bonus details");
{
  const env = createEnv();
  env.run(`
    triggerVictoryEffect = function() {};
    renderAll = function() {};
    addLog = function() {};
    showToast = function() {};
    stopTimer = function() {};
    stopAiThinking = function() {};
    game.soundEnabled = false;
    game.mode = 'solo';
    game.difficulty = 'hard';
    game.phase = 'playing';
    game.timerSec = 18;
    game.stats = { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 };
    game.players = [
      { name: 'Solo', hand: [7, 9, 1], conceded: false, feedback: '', feedbackType: '', inputDraft: '((7*sqrt(9))^A!)', isAi: false }
    ];
    submitFormula(0);
  `);

  const history = JSON.parse(env.storage.get("eq21_history"));
  assert("cool win writes one history record", history.records.length, 1);
  assert("cool win stores score breakdown", Array.isArray(history.records[0].scoreBreakdown), true);
  assert("cool win stores solution rating", history.records[0].solutionRating.score >= 160, true);
  assert("cool win stores cool bonus item", history.records[0].scoreBreakdown.some(item => item.label.includes("妙解")), true);
  assert("cool win result page shows score details", env.document.getElementById("result-score").innerHTML.includes("妙解"), true);

  env.run("renderHistoryPanel();");
  assert("history panel shows solution rating", env.document.getElementById("history-records").innerHTML.includes("评分"), true);
  assert("history panel shows rating level tag", env.document.getElementById("history-records").innerHTML.includes("妙手天成"), true);
}

section("solo no-solution hint clears when hand becomes solvable");
{
  const env = createEnv();
  const hint = env.document.getElementById("hint-area");

  env.run(`
    game.mode = 'solo';
    game.difficulty = 'easy';
    game.phase = 'playing';
    game._maxHintShown = false;
    game.players = [{ name: 'Solo', hand: [1, 1, 1], conceded: false }];
    clearSolutionHint();
    updateSolutionHint();
  `);

  assert("unsolvable solo hand shows hint", hint.classList.contains("hidden"), false);
  assert("unsolvable hint text is populated", hint.innerHTML.includes("似乎无解"), true);

  env.run("game.players[0].hand = [10, 10, 1]; updateSolutionHint();");

  assert("solvable new hand hides stale hint", hint.classList.contains("hidden"), true);
  assert("solvable new hand clears stale hint text", hint.innerHTML, "");
}

section("solve timeout does not show stale no-solution hint or consume hints");
{
  const env = createEnv();
  const hint = env.document.getElementById("hint-area");

  env.run(`
    game.mode = 'solo';
    game.difficulty = 'normal';
    game.phase = 'playing';
    game._maxHintShown = false;
    game.stats = { submits: 0, hintsUsed: 1, maxHints: 3, draws: 0 };
    game.players = [{ name: 'Solo', hand: [1, 6, 13, 13, 8], conceded: false }];
    clearSolutionHint();
    document.getElementById('hint-area').classList.remove('hidden');
    document.getElementById('hint-area').innerHTML = 'stale';
    aiSolve = function() { const r = []; r.timedOut = true; return r; };
    updateSolutionHint();
  `);

  assert("timed out auto hint hides stale hint", hint.classList.contains("hidden"), true);
  assert("timed out auto hint clears stale text", hint.innerHTML, "");

  env.run(`
    var __toastCount = 0;
    var __lastToast = '';
    showToast = function(msg) { __toastCount++; __lastToast = msg; };
    addLog = function() {};
    renderAll = function() {};
    showHint();
  `);

  assert("timed out manual hint does not consume hint", env.run("game.stats.hintsUsed"), 1);
  assert("timed out manual hint shows one toast", env.run("__toastCount"), 1);
  assert("timed out manual hint message says not consumed", env.run("__lastToast.includes('不消耗提示次数')"), true);
  assert("timed out manual hint hides technical timeout wording", env.run("!__lastToast.includes('ms') && !__lastToast.includes('超时')"), true);
}

section("solo worker completed no-solution hint is cached");
{
  const workers = [];
  function FakeWorker(url) {
    this.url = url;
    this.messages = [];
    this.onmessage = null;
    workers.push(this);
  }
  FakeWorker.prototype.postMessage = function(message) {
    this.messages.push(message);
  };

  const env = createEnv({ Worker: FakeWorker });
  const hint = env.document.getElementById("hint-area");

  env.run(`
    game.mode = 'solo';
    game.difficulty = 'easy';
    game.phase = 'playing';
    game.target = 21;
    game._maxHintShown = false;
    game.players = [{ name: 'Solo', hand: [1, 1, 1], conceded: false }];
    clearSolutionHint();
    updateSolutionHint();
  `);

  assert("worker no-solution starts one request", workers[0].messages.length, 1);
  const first = workers[0].messages[0];
  workers[0].onmessage({
    data: {
      id: first.id,
      handKey: first.handKey,
      simpleSolutions: [],
      coolSolutions: [],
      timedOut: false
    }
  });

  assert("worker no-solution marks cache completed", env.run("game.solutionCache.completed"), true);
  assert("worker no-solution hint appears", hint.classList.contains("hidden"), false);
  assert("worker no-solution hint has text", hint.innerHTML.length > 0, true);
  assert("completed no-solution hand is not solved repeatedly", workers[0].messages.length, 1);

  env.run("game.players[0].hand = [10, 10, 1]; updateSolutionHint();");
  assert("new solvable hand starts a fresh request", workers[0].messages.length, 2);
  assert("pending new hand clears old no-solution hint", hint.classList.contains("hidden"), true);
  assert("pending new hand clears old no-solution text", hint.innerHTML, "");

  const second = workers[0].messages[1];
  workers[0].onmessage({
    data: {
      id: second.id,
      handKey: second.handKey,
      simpleSolutions: [{ expr: '10+10+A' }],
      coolSolutions: [],
      timedOut: false
    }
  });

  assert("solvable worker response keeps no-solution hint hidden", hint.classList.contains("hidden"), true);
  assert("completed solvable hand is not solved repeatedly", workers[0].messages.length, 2);
}

section("solo hint buttons wait for background solutions");
{
  const env = createEnv();

  env.run(`
    game.mode = 'solo';
    game.difficulty = 'normal';
    game.phase = 'playing';
    game.stats = { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 };
    game.players = [{ name: 'Solo', hand: [6, 3, 3, 2, 11], conceded: false, feedback: '', feedbackType: '' }];
    var key = getSolutionHandKey(game.players[0].hand);
    game.solutionCache = { handKey: key, simple: [], cool: [], pending: true, timedOut: false };
    var __toastCount = 0;
    var __lastToast = '';
    showToast = function(msg) { __toastCount++; __lastToast = msg; };
    renderAll = function() {};
    showHint();
  `);

  assert("pending simple hint does not consume hint", env.run("game.stats.hintsUsed"), 0);
  assert("pending simple hint tells player to wait", env.run("__lastToast.includes('端详')"), true);
  assert("pending simple hint hides technical wording", env.run("!__lastToast.includes('ms') && !__lastToast.includes('超时')"), true);

  env.run("showCoolHint();");
  assert("pending cool hint still does not consume hint", env.run("game.stats.hintsUsed"), 0);
  assert("pending cool hint tells player to wait", env.run("__lastToast.includes('妙处')"), true);
  assert("pending cool hint hides technical wording", env.run("!__lastToast.includes('ms') && !__lastToast.includes('超时')"), true);
}

section("solo worker ignores stale responses and keeps hints nonblocking");
{
  const workers = [];
  function FakeWorker(url) {
    this.url = url;
    this.messages = [];
    this.onmessage = null;
    this.onerror = null;
    workers.push(this);
  }
  FakeWorker.prototype.postMessage = function(message) {
    this.messages.push(message);
  };

  const env = createEnv({ Worker: FakeWorker, debugPerf: true });
  env.run(`
    game.mode = 'solo';
    game.difficulty = 'hard';
    game.phase = 'playing';
    game.target = 21;
    game.stats = { submits: 0, hintsUsed: 0, maxHints: 3, draws: 0 };
    game.players = [{ name: 'Solo', hand: [6, 3, 3], conceded: false, feedback: '', feedbackType: '' }];
    var __syncFallbackCalls = 0;
    var __toastCount = 0;
    var __lastToast = '';
    var __renderAllCalls = 0;
    var __updateSolutionHintCalls = 0;
    solveHandDetailed = function() {
      __syncFallbackCalls++;
      return { simpleSolutions: [], coolSolutions: [], timedOut: true };
    };
    showToast = function(msg) { __toastCount++; __lastToast = msg; };
    renderAll = function() { __renderAllCalls++; };
    updateSolutionHint = function() { __updateSolutionHintCalls++; };
    requestSolutionAnalysis();
  `);

  assert("fake worker constructed", workers.length, 1);
  assert("worker receives first solve request", workers[0].messages.length, 1);
  assert("worker path avoids sync fallback", env.run("__syncFallbackCalls"), 0);

  const first = workers[0].messages[0];
  env.run(`
    game.players[0].hand = [7, 9, 1];
    requestSolutionAnalysis();
  `);
  assert("worker receives second solve request after hand changes", workers[0].messages.length, 2);
  const second = workers[0].messages[1];
  assert("second request has a different handKey", second.handKey !== first.handKey, true);

  workers[0].onmessage({
    data: {
      id: first.id,
      handKey: first.handKey,
      simpleSolutions: [{ expr: '6+3+3' }],
      coolSolutions: [],
      timedOut: false
    }
  });

  assert("stale response keeps current cache handKey", env.run("game.solutionCache.handKey"), second.handKey);
  assert("stale response does not fill current simple cache", env.run("game.solutionCache.simple.length"), 0);
  assert("stale response leaves current cache pending", env.run("game.solutionCache.pending"), true);

  const hintStart = Date.now();
  env.run("showHint(); showCoolHint();");
  const hintElapsed = Date.now() - hintStart;
  assert("pending hint handlers return quickly", hintElapsed < 50, true);
  assert("pending hint handlers do not consume hints", env.run("game.stats.hintsUsed"), 0);
  assert("pending hint handlers avoid sync fallback", env.run("__syncFallbackCalls"), 0);

  env.run("__renderAllCalls = 0; __updateSolutionHintCalls = 0;");
  workers[0].onmessage({
    data: {
      id: second.id,
      handKey: second.handKey,
      simpleSolutions: [{ expr: '7*sqrt(9)*A', style: 'simple' }],
      coolSolutions: [{ expr: '((7*sqrt(9))^A!)', style: 'cool' }],
      timedOut: false
    }
  });

  assert("fresh response resolves pending cache", env.run("game.solutionCache.pending"), false);
  assert("fresh response marks cache completed", env.run("game.solutionCache.completed"), true);
  assert("fresh response fills simple cache", env.run("game.solutionCache.simple.length"), 1);
  assert("fresh response fills cool cache", env.run("game.solutionCache.cool.length"), 1);
  assert("fresh response still avoids sync fallback", env.run("__syncFallbackCalls"), 0);
  assert("fresh response updates hint area without full rerender", env.run("__updateSolutionHintCalls"), 1);
  assert("fresh response does not rebuild cards", env.run("__renderAllCalls"), 0);
  assert("perf debug store is exposed when enabled", env.run("!!window.__eq21Perf"), true);
  assert("perf debug records stale response", env.run("window.__eq21Perf.events.some(function(e) { return e.type === 'worker-stale'; })"), true);
  assert("perf debug records worker solve", env.run("window.__eq21Perf.events.some(function(e) { return e.type === 'solve' && e.source === 'worker'; })"), true);
  assert("perf debug records hint clicks", env.run("window.__eq21Perf.events.some(function(e) { return e.type === 'hint-click'; }) && window.__eq21Perf.events.some(function(e) { return e.type === 'cool-hint-click'; })"), true);
  assert("perf debug tracks slow-hand candidates", env.run("window.__eq21Perf.slowHands.length > 0"), true);
}

section("perf debug stays hidden unless query flag is set");
{
  const env = createEnv();
  env.run("recordPerfEvent({ type: 'manual-test', elapsedMs: 999, handKey: 'x' });");
  assert("perf debug global is absent by default", env.run("typeof window.__eq21Perf"), "undefined");
}

section("perf debug records fallback solve events");
{
  const env = createEnv({ debugPerf: true });
  env.run(`
    game.mode = 'solo';
    game.difficulty = 'hard';
    game.phase = 'playing';
    game.target = 21;
    game.players = [{ name: 'Solo', hand: [7, 9, 1], conceded: false }];
    renderAll = function() {};
    updateSolutionHint = function() {};
    requestSolutionAnalysis();
  `);
  assert("fallback solve resolves cache", env.run("game.solutionCache.pending"), false);
  assert("fallback solve marks cache completed", env.run("game.solutionCache.completed"), true);
  assert("perf debug records fallback source", env.run("window.__eq21Perf.events.some(function(e) { return e.type === 'solve' && e.source === 'fallback'; })"), true);
}

section("cool hint explains why the solution is fancy");
{
  const env = createEnv();
  const why = env.run("describeCoolSolution({ expr: '((7*sqrt(9))^A!)' }, 3)");
  assert("cool hint explanation mentions power", why.includes("幂运算"), true);
  assert("cool hint explanation mentions sqrt", why.includes("开方"), true);
  assert("cool hint explanation mentions factorial", why.includes("阶乘"), true);
}

console.log(`\n${"=".repeat(60)}`);
console.log("  DOM flow test result");
console.log(`${"=".repeat(60)}`);
console.log(`  passed: \x1b[32m${passed}\x1b[0m`);
console.log(`  failed: \x1b[31m${failed}\x1b[0m`);
console.log(`  total: ${passed + failed}`);
console.log(`${"=".repeat(60)}`);

if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.desc}`);
    console.log(`     expected: ${JSON.stringify(f.expected)}`);
    console.log(`     actual: ${JSON.stringify(f.actual)}`);
  });
  process.exit(1);
}

console.log("\n\x1b[32m✓ DOM flow checks passed\x1b[0m");
