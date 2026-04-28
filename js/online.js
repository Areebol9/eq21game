"use strict";

const ONLINE_SESSION_KEY = "eq21_online_session";
const ONLINE_LAST_ROOM_KEY = "eq21_online_last_room";
const ONLINE_BASE_KEY = "eq21_online_base";
const ONLINE_CLOSED_ROOM_PREFIX = "eq21_online_closed_";
let onlineSocket = null;
let onlineReconnectTimer = null;
let onlineHeartbeatTimer = null;
let onlineManualClose = false;
let onlineReconnectAttempts = 0;
let onlineLastEventId = "";
let onlineLastEndedVersion = 0;
let onlineSeenEventIds = new Set();
let onlineRecordedResultKey = "";
let onlineActiveRoomCode = "";
let onlineSettledResultKey = "";
let onlineDraftSeq = 0;
let onlineDraftLastSentAt = 0;
let onlineDraftTimer = null;
let onlineDraftPending = null;
let onlinePresenceSeqByPlayer = {};

const ONLINE_MAX_RECONNECT_ATTEMPTS = 10;
const ONLINE_RECONNECT_BASE_MS = 1500;
const ONLINE_RECONNECT_MAX_MS = 30000;
const ONLINE_DRAFT_SEND_MIN_MS = 120;

function getDefaultOnlineBaseUrl() {
  const stored = localStorage.getItem(ONLINE_BASE_KEY);
  if (stored) return stored;
  if (typeof window !== "undefined" && window.EQ21_ONLINE_URL) return window.EQ21_ONLINE_URL;
  try {
    if (window.location && /^https?:$/.test(window.location.protocol)) return window.location.origin;
  } catch (e) {}
  return "http://localhost:8787";
}

function normalizeOnlineBaseUrl(value) {
  const raw = String(value || "").trim() || getDefaultOnlineBaseUrl();
  return raw.replace(/\/+$/, "");
}

function getOnlineFormValue(id, fallback) {
  const el = document.getElementById(id);
  return el && typeof el.value === "string" && el.value.trim() ? el.value.trim() : fallback;
}

function setOnlineStatus(message, type) {
  game.online.status = message || "";
  const el = document.getElementById("online-status");
  if (el) {
    el.textContent = message || "";
    el.className = "online-status " + (type || "");
  }
}

function openOnlineSetup() {
  document.getElementById("menu-overlay").classList.add("hidden");
  document.getElementById("online-setup-overlay").classList.remove("hidden");
  updateModeBadge("联网对战");
  State.set("mode", "online");
  const base = document.getElementById("online-base-url");
  if (base && !base.value) base.value = getDefaultOnlineBaseUrl();
  const urlRow = document.querySelector(".online-url-row");
  if (urlRow) urlRow.style.display = /localhost|127\.0\.0\.1/i.test(base.value) ? "" : "none";
  const name = document.getElementById("online-player-name");
  if (name && !name.value) name.value = "玩家";
  const reconnect = loadOnlineSession();
  const btnReconnect = document.getElementById("btn-online-reconnect");
  if (btnReconnect) btnReconnect.disabled = !reconnect;
  setOnlineStatus(reconnect ? "可重连上次房间 " + reconnect.roomCode : "创建房间后分享房间码或二维码", "info");
}

function closeOnlineSetup() {
  document.getElementById("online-setup-overlay").classList.add("hidden");
  goToMenu();
}

function selectOnlinePlayers(count) {
  document.querySelectorAll(".online-player-opt").forEach(el => el.classList.remove("selected"));
  const selected = document.querySelector('.online-player-opt[data-players="' + count + '"]');
  if (selected) selected.classList.add("selected");
}

function getSelectedOnlinePlayerCount() {
  const selected = document.querySelector(".online-player-opt.selected");
  return selected ? parseInt(selected.dataset.players, 10) || 4 : 4;
}

async function createOnlineRoom() {
  const baseUrl = normalizeOnlineBaseUrl(getOnlineFormValue("online-base-url", ""));
  const name = getOnlineFormValue("online-player-name", "玩家");
  localStorage.setItem(ONLINE_BASE_KEY, baseUrl);
  setOnlineStatus("正在创建房间...", "info");
  try {
    if (typeof fetch !== "function") throw new Error("当前环境不支持 fetch，请使用现代浏览器");
    const response = await fetch(baseUrl + "/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        difficulty: game.difficulty,
        target: game.target,
        maxPlayers: getSelectedOnlinePlayerCount()
      })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "创建房间失败");
    const session = {
      baseUrl,
      roomCode: data.roomCode,
      playerId: data.playerId,
      seatToken: data.seatToken,
      name,
      wsUrl: data.wsUrl
    };
    saveOnlineSession(session);
    connectOnlineRoom(session);
  } catch (error) {
    setOnlineStatus(error.message || "创建房间失败", "err");
    showToast(error.message || "创建房间失败", "error");
  }
}

function joinOnlineRoom() {
  const baseUrl = normalizeOnlineBaseUrl(getOnlineFormValue("online-base-url", ""));
  const roomCode = getOnlineFormValue("online-room-code", "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const name = getOnlineFormValue("online-player-name", "玩家");
  if (!roomCode) {
    setOnlineStatus("请输入房间码", "err");
    return;
  }
  localStorage.setItem(ONLINE_BASE_KEY, baseUrl);
  connectOnlineRoom({ baseUrl, roomCode, name });
}

function reconnectOnlineRoom() {
  const session = loadOnlineSession();
  if (!session) {
    const btnReconnect = document.getElementById("btn-online-reconnect");
    if (btnReconnect) btnReconnect.disabled = true;
  }
  if (!session) {
    setOnlineStatus("没有可重连的房间", "err");
    return;
  }
  connectOnlineRoom(session);
}

function getStorageItem(storage, key) {
  try {
    return storage && storage.getItem ? storage.getItem(key) : null;
  } catch (e) {
    return null;
  }
}

function setStorageItem(storage, key, value) {
  try {
    if (storage && storage.setItem) storage.setItem(key, value);
  } catch (e) {}
}

function removeStorageItem(storage, key) {
  try {
    if (storage && storage.removeItem) storage.removeItem(key);
  } catch (e) {}
}

function getCurrentWindowStorage() {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch (e) {
    return null;
  }
}

function getOnlineClosedRoomKey(roomCode) {
  return ONLINE_CLOSED_ROOM_PREFIX + String(roomCode || "").toUpperCase();
}

function isOnlineRoomClosed(roomCode) {
  return !!(roomCode && getStorageItem(localStorage, getOnlineClosedRoomKey(roomCode)));
}

function clearOnlineSessionForRoom(roomCode) {
  roomCode = String(roomCode || "").toUpperCase();
  if (!roomCode) return;
  const currentRaw = getStorageItem(getCurrentWindowStorage(), ONLINE_SESSION_KEY);
  const lastRaw = getStorageItem(localStorage, ONLINE_LAST_ROOM_KEY);
  const legacyRaw = getStorageItem(localStorage, ONLINE_SESSION_KEY);
  try {
    const current = currentRaw ? JSON.parse(currentRaw) : null;
    if (current && String(current.roomCode || "").toUpperCase() === roomCode) {
      removeStorageItem(getCurrentWindowStorage(), ONLINE_SESSION_KEY);
    }
  } catch (e) {}
  try {
    const last = lastRaw ? JSON.parse(lastRaw) : null;
    if (last && String(last.roomCode || "").toUpperCase() === roomCode) {
      removeStorageItem(localStorage, ONLINE_LAST_ROOM_KEY);
    }
  } catch (e) {}
  try {
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
    if (legacy && String(legacy.roomCode || "").toUpperCase() === roomCode) {
      removeStorageItem(localStorage, ONLINE_SESSION_KEY);
    }
  } catch (e) {}
}

function markOnlineRoomClosed(roomCode) {
  roomCode = String(roomCode || "").toUpperCase();
  if (!roomCode) return;
  setStorageItem(localStorage, getOnlineClosedRoomKey(roomCode), String(Date.now()));
  clearOnlineSessionForRoom(roomCode);
}

function saveOnlineSession(session) {
  const current = {
    baseUrl: session.baseUrl,
    roomCode: session.roomCode,
    playerId: session.playerId || "",
    seatToken: session.seatToken || "",
    name: session.name || "",
    wsUrl: session.wsUrl || ""
  };
  const lastRoom = {
    baseUrl: current.baseUrl,
    roomCode: current.roomCode,
    name: current.name,
    playerId: current.playerId,
    seatToken: current.seatToken
  };
  setStorageItem(getCurrentWindowStorage(), ONLINE_SESSION_KEY, JSON.stringify(current));
  setStorageItem(localStorage, ONLINE_LAST_ROOM_KEY, JSON.stringify(lastRoom));
  setStorageItem(localStorage, ONLINE_SESSION_KEY, JSON.stringify(lastRoom));
}

function loadOnlineSession() {
  try {
    const currentRaw = getStorageItem(getCurrentWindowStorage(), ONLINE_SESSION_KEY);
    if (currentRaw) {
      const current = JSON.parse(currentRaw);
      if (current && current.roomCode && !isOnlineRoomClosed(current.roomCode)) return current;
      if (current && current.roomCode) clearOnlineSessionForRoom(current.roomCode);
    }
    const lastRaw = getStorageItem(localStorage, ONLINE_LAST_ROOM_KEY) || getStorageItem(localStorage, ONLINE_SESSION_KEY);
    if (!lastRaw) return null;
    const last = JSON.parse(lastRaw);
    if (!last || !last.roomCode) return null;
    if (isOnlineRoomClosed(last.roomCode)) {
      clearOnlineSessionForRoom(last.roomCode);
      return null;
    }
    return {
      baseUrl: last.baseUrl,
      roomCode: last.roomCode,
      name: last.name || getOnlineFormValue("online-player-name", "玩家"),
      playerId: last.playerId || "",
      seatToken: last.seatToken || ""
    };
  } catch (e) {
    return null;
  }
}

function buildOnlineWsUrl(session) {
  if (session.wsUrl && /^wss?:\/\//i.test(session.wsUrl)) return session.wsUrl;
  const base = new URL(normalizeOnlineBaseUrl(session.baseUrl));
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/ws/" + session.roomCode;
  base.search = "";
  return base.toString();
}

function connectOnlineRoom(session) {
  if (!session || !session.roomCode) return;
  if (game.online.roomCode && game.online.roomCode !== session.roomCode) {
    removeStorageItem(localStorage, "eq21_ended_" + game.online.roomCode);
    onlineSeenEventIds = new Set();
    onlineLastEndedVersion = 0;
    onlineRecordedResultKey = "";
    onlineActiveRoomCode = "";
    onlineSettledResultKey = "";
    onlinePresenceSeqByPlayer = {};
  }
  disconnectOnline(false);
  onlineActiveRoomCode = "";
  onlineSettledResultKey = "";
  onlineManualClose = false;
  onlineDraftPending = null;
  if (onlineDraftTimer) { clearTimeout(onlineDraftTimer); onlineDraftTimer = null; }
  State.set("mode", "online");
  State.set("phase", "lobby");
  State.set("players", []);
  Object.assign(game.online, {
    baseUrl: normalizeOnlineBaseUrl(session.baseUrl),
    roomCode: session.roomCode,
    playerId: session.playerId || "",
    seatToken: session.seatToken || "",
    connected: false,
    connecting: true,
    reconnecting: !!(session.playerId && session.seatToken),
    status: "正在连接房间..."
  });
  updateModeBadge("联网对战");
  setOnlineStatus("正在连接房间 " + session.roomCode + "...", "info");
  renderAll();

  const SocketCtor = typeof WebSocket !== "undefined" ? WebSocket : (window && window.WebSocket);
  if (!SocketCtor) {
    setOnlineStatus("当前浏览器不支持 WebSocket", "err");
    return;
  }
  const ws = new SocketCtor(buildOnlineWsUrl(session));
  onlineSocket = ws;

  ws.onopen = function() {
    game.online.connected = true;
    game.online.connecting = false;
    game.online.status = "已连接";
    onlineReconnectAttempts = 0;
    startHeartbeat();
    ws.send(JSON.stringify({
      type: "join",
      name: session.name || getOnlineFormValue("online-player-name", "玩家"),
      playerId: session.playerId || game.online.playerId || "",
      seatToken: session.seatToken || game.online.seatToken || ""
    }));
  };

  ws.onmessage = function(event) {
    handleOnlineMessage(event.data);
  };

  ws.onerror = function() {
    setOnlineStatus("连接异常，稍后会尝试重连", "err");
  };

  ws.onclose = function() {
    if (onlineSocket === ws) onlineSocket = null;
    game.online.connected = false;
    game.online.connecting = false;
    stopTimer();
    if (!onlineManualClose && game.mode === "online" && game.online.roomCode) {
      setOnlineStatus("连接断开，正在尝试重连...", "err");
      scheduleOnlineReconnect();
    } else {
      setOnlineStatus("已断开连接", "info");
    }
    renderAll();
  };
}

function scheduleOnlineReconnect() {
  if (onlineReconnectTimer) clearTimeout(onlineReconnectTimer);
  onlineReconnectAttempts++;
  if (onlineReconnectAttempts > ONLINE_MAX_RECONNECT_ATTEMPTS) {
    setOnlineStatus("重连失败，请返回菜单重新进入", "err");
    stopTimer();
    return;
  }
  const delay = Math.min(ONLINE_RECONNECT_BASE_MS * Math.pow(2, Math.min(onlineReconnectAttempts - 1, 5)), ONLINE_RECONNECT_MAX_MS);
  onlineReconnectTimer = setTimeout(() => {
    onlineReconnectTimer = null;
    const session = loadOnlineSession();
    if (session && game.mode === "online") connectOnlineRoom(session);
  }, delay);
}

function startHeartbeat() {
  stopHeartbeat();
  onlineHeartbeatTimer = setInterval(() => {
    if (!game.online.playerId) return;
    if (onlineSocket && onlineSocket.readyState === 1) {
      onlineSocket.send(JSON.stringify({ type: "heartbeat" }));
    }
  }, 25000);
}

function stopHeartbeat() {
  if (onlineHeartbeatTimer) {
    clearInterval(onlineHeartbeatTimer);
    onlineHeartbeatTimer = null;
  }
}

function disconnectOnline(clearSession) {
  onlineManualClose = true;
  stopHeartbeat();
  stopTimer();
  if (onlineDraftTimer) {
    clearTimeout(onlineDraftTimer);
    onlineDraftTimer = null;
  }
  onlineDraftPending = null;
  onlineReconnectAttempts = 0;
  onlineActiveRoomCode = "";
  onlineSettledResultKey = "";
  if (onlineReconnectTimer) {
    clearTimeout(onlineReconnectTimer);
    onlineReconnectTimer = null;
  }
  if (onlineSocket) {
    try {
      onlineSocket.onopen = onlineSocket.onmessage = onlineSocket.onerror = onlineSocket.onclose = null;
      onlineSocket.close();
    } catch (e) {}
    onlineSocket = null;
  }
  game.online.connected = false;
  game.online.connecting = false;
  if (clearSession) {
    if (game.online.roomCode) removeStorageItem(localStorage, "eq21_ended_" + game.online.roomCode);
    removeStorageItem(getCurrentWindowStorage(), ONLINE_SESSION_KEY);
    removeStorageItem(localStorage, ONLINE_SESSION_KEY);
    removeStorageItem(localStorage, ONLINE_LAST_ROOM_KEY);
  }
}

function handleOnlineMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch (e) {
    return;
  }
  if (message.type === "state_snapshot" && message.room) {
    applyOnlineSnapshot(message.room);
  } else if (message.type === "game_ended") {
    handleOnlineGameEnded(message);
  } else if (message.type === "presence_update") {
    applyOnlinePresence(message);
  } else if (message.type === "error") {
    if (message.code === "room_ended" || message.error === "room_ended") {
      handleOnlineRoomEndedError();
      return;
    }
    setOnlineStatus(message.error || "操作失败", "err");
    showToast(message.error || "操作失败", "error");
  } else if (message.type === "pong") {
    game.online.status = "在线";
  }
}

function applyOnlineSnapshot(room) {
  const previousPhase = game.phase;
  const resultKey = getOnlineResultKey(room, (room.you && room.you.playerId) || game.online.playerId);
  const shouldSettleEnd = room.phase === "ended" &&
    onlineActiveRoomCode === room.roomCode &&
    onlineSettledResultKey !== resultKey;
  State.set("mode", "online");
  State.set("phase", room.phase);
  State.set("difficulty", room.difficulty);
  State.set("target", room.target);
  State.set("maxCards", room.maxCards || 5);
  State.set("deck", new Array(room.deckCount || 0).fill(0));
  if (room.you) {
    Object.assign(game.online, {
      playerId: room.you.playerId,
      seatToken: room.you.seatToken,
      isHost: !!room.you.isHost
    });
  }
  Object.assign(game.online, {
    roomCode: room.roomCode,
    connected: true,
    connecting: false,
    reconnecting: false,
    maxPlayers: room.maxPlayers || 4,
    lastSnapshotAt: Date.now(),
    status: "房间 " + room.roomCode + " · " + (room.phase === "lobby" ? "等待开局" : room.phase === "playing" ? "对局中" : "已结束")
  });
  saveOnlineSession({
    baseUrl: game.online.baseUrl || getDefaultOnlineBaseUrl(),
    roomCode: room.roomCode,
    playerId: game.online.playerId,
    seatToken: game.online.seatToken,
    name: getOnlinePlayerName()
  });

  const draftById = {};
  game.players.forEach(player => {
    if (player.id) draftById[player.id] = player.inputDraft || "";
  });
  State.set("players", (room.players || []).map(player => ({
    id: player.id,
    name: player.name,
    hand: player.hand || [],
    connected: !!player.connected,
    ready: !!player.ready,
    conceded: !!player.conceded,
    host: !!player.host,
    feedback: player.feedback || "",
    feedbackType: player.feedbackType || "",
    inputDraft: draftById[player.id] || "",
    isAi: false,
    _newCardIdx: player.feedback && player.feedback.startsWith("+牌 →") ? player.hand.length - 1 : undefined
  })));

  syncOnlineEvents(room.events || []);
  updateTimerFromOnlineRoom(room);
  document.getElementById("online-setup-overlay").classList.add("hidden");
  document.getElementById("menu-overlay").classList.add("hidden");
  updateDeckCount();
  renderAll();
  updateFooterBar();

  if (room.phase === "playing") {
    onlineActiveRoomCode = room.roomCode;
    onlineSettledResultKey = "";
  }

  if (shouldSettleEnd && previousPhase !== "ended") {
    onlineSettledResultKey = resultKey;
    const winnerIdx = game.players.findIndex(player => player.id === room.winnerId);
    if (winnerIdx >= 0) {
      showResult(winnerIdx);
      soundPlay("win");
      triggerVictoryEffect();
      maybeRecordOnlineResult(room, winnerIdx, resultKey);
    } else {
      showResult(-1);
    }
    onlineLastEndedVersion = room.version;
  }
  if (room.phase === "ended") markOnlineRoomClosed(room.roomCode);
}

function applyOnlinePresence(message) {
  if (!message || !message.playerId || message.playerId === game.online.playerId) return;
  const seq = Number(message.seq) || 0;
  const lastSeq = onlinePresenceSeqByPlayer[message.playerId] || 0;
  if (seq && lastSeq && seq <= lastSeq) return;
  if (seq) onlinePresenceSeqByPlayer[message.playerId] = seq;

  const idx = game.players.findIndex(player => player.id === message.playerId);
  if (idx < 0) return;
  game.players[idx].inputDraft = String(message.draft || "");
  updateExprDisplay(idx);

  if (message.action === "card" && Number.isInteger(message.cardIndex)) {
    flashRemoteCardAction(idx, message.cardIndex);
  } else if (message.action === "symbol" || message.action === "backspace" || message.action === "clear" || message.action === "typing") {
    flashRemoteExprAction(idx);
  }
}

function handleOnlineGameEnded(message) {
  if (!message || !message.room) return;
  if (game.phase === "ended") return;
  if (game.online.roomCode !== message.room.roomCode) return;
  const resultKey = getOnlineResultKey(message.room, game.online.playerId);
  if (onlineSettledResultKey === resultKey) return;
  onlineSettledResultKey = resultKey;
  const winnerIdx = game.players.findIndex(player => player.id === message.room.winnerId);
  if (winnerIdx >= 0) {
    showResult(winnerIdx);
    soundPlay("win");
    triggerVictoryEffect();
    maybeRecordOnlineResult(message.room, winnerIdx, resultKey);
  } else {
    showResult(-1);
  }
  onlineLastEndedVersion = message.room.version;
  markOnlineRoomClosed(message.room.roomCode);
}

function handleOnlineRoomEndedError() {
  const roomCode = game.online.roomCode;
  markOnlineRoomClosed(roomCode);
  disconnectOnline(false);
  const message = "\u8be5\u623f\u95f4\u5df2\u7ed3\u675f\uff0c\u8bf7\u521b\u5efa\u65b0\u623f\u95f4";
  setOnlineStatus(message, "err");
  showToast(message, "error");
  const btnReconnect = document.getElementById("btn-online-reconnect");
  if (btnReconnect) btnReconnect.disabled = true;
}

function getOnlinePlayerName() {
  const me = game.players.find(player => player.id === game.online.playerId);
  return me ? me.name : getOnlineFormValue("online-player-name", "玩家");
}

function syncOnlineEvents(events) {
  for (const event of events) {
    if (!event || !event.id) continue;
    if (onlineSeenEventIds.has(event.id)) continue;
    onlineSeenEventIds.add(event.id);
    onlineLastEventId = event.id;
    addLog(event.message || event.type, event.type === "win" ? "win" : event.type === "chat" ? "hint" : "info");
    if (event.type === "chat") showToast(event.message, "submit");
  }
  if (onlineSeenEventIds.size > 500) {
    const keep = new Set();
    for (const event of events) { if (event && event.id) keep.add(event.id); }
    onlineSeenEventIds = keep;
  }
}

function updateTimerFromOnlineRoom(room) {
  stopTimer();
  if (room.phase === "playing" && room.startedAt) {
    game.timerSec = Math.max(0, Math.floor((Date.now() - room.startedAt) / 1000));
    updateTimerUI();
    State.set("timerInterval", setInterval(() => {
      game.timerSec = Math.max(0, Math.floor((Date.now() - room.startedAt) / 1000));
      updateTimerUI();
      updateFooterBar();
      updateTabletopCenter();
    }, 1000));
  } else if (room.phase === "ended" && room.startedAt) {
    const end = room.endedAt || Date.now();
    game.timerSec = Math.max(0, Math.floor((end - room.startedAt) / 1000));
    updateTimerUI();
  } else {
    game.timerSec = 0;
    updateTimerUI();
  }
}

function getOnlineResultKey(room, playerId) {
  if (!room || !room.roomCode || !playerId) return "";
  return room.roomCode + ":" + (room.version || 0) + ":" + playerId;
}

function getOnlineResultStorageKey(resultKey) {
  return "eq21_online_result_" + resultKey;
}

function hasRecordedOnlineResult(resultKey) {
  if (!resultKey) return false;
  if (onlineRecordedResultKey === resultKey) return true;
  if (getStorageItem(localStorage, getOnlineResultStorageKey(resultKey))) return true;
  if (typeof loadHistory === "function") {
    const data = loadHistory();
    return !!(data && data.records && data.records.some(record => record.onlineResultKey === resultKey));
  }
  return false;
}

function maybeRecordOnlineResult(room, winnerIdx, resultKey) {
  const me = game.players.find(player => player.id === game.online.playerId);
  resultKey = resultKey || getOnlineResultKey(room, game.online.playerId);
  if (!me || hasRecordedOnlineResult(resultKey)) {
    if (resultKey) onlineRecordedResultKey = resultKey;
    return;
  }
  onlineRecordedResultKey = resultKey;
  const won = game.players[winnerIdx] && game.players[winnerIdx].id === me.id;
  const saved = addRecord({
    id: generateId(),
    ts: Date.now(),
    mode: "online",
    difficulty: game.difficulty,
    result: won ? "win" : "lose",
    player: me.name,
    hand: me.hand.slice(),
    formula: won ? (me.inputDraft || "") : "",
    score: won ? 500 : 50,
    timeSec: game.timerSec,
    submits: 0,
    hintsUsed: 0,
    onlineResultKey: resultKey,
    tags: won ? ["联网获胜"] : []
  });
  if (saved !== false) setStorageItem(localStorage, getOnlineResultStorageKey(resultKey), String(Date.now()));
}

function sendOnlineAction(type, payload) {
  if (!onlineSocket || onlineSocket.readyState !== 1) {
    showToast("还没连上房间", "error");
    return false;
  }
  onlineSocket.send(JSON.stringify({ type, payload: payload || {} }));
  return true;
}

function flushOnlineDraftUpdate() {
  onlineDraftTimer = null;
  if (!onlineDraftPending || !onlineSocket || onlineSocket.readyState !== 1) {
    onlineDraftPending = null;
    return false;
  }
  onlineDraftLastSentAt = Date.now();
  onlineSocket.send(JSON.stringify({ type: "draft_update", payload: onlineDraftPending }));
  onlineDraftPending = null;
  return true;
}

function sendOnlineDraftUpdate(idx, details) {
  const player = game.players[idx];
  if (!player || player.id !== game.online.playerId) return false;
  if (!onlineSocket || onlineSocket.readyState !== 1) return false;
  details = details || {};
  onlineDraftPending = {
    draft: player.inputDraft || "",
    action: details.action || "typing",
    cardIndex: Number.isInteger(details.cardIndex) ? details.cardIndex : null,
    symbol: details.symbol || "",
    seq: ++onlineDraftSeq
  };
  const now = Date.now();
  const wait = ONLINE_DRAFT_SEND_MIN_MS - (now - onlineDraftLastSentAt);
  if (wait <= 0) return flushOnlineDraftUpdate();
  if (!onlineDraftTimer) onlineDraftTimer = setTimeout(flushOnlineDraftUpdate, wait);
  return true;
}

function onlineReady() {
  const me = game.players.find(function(p) { return p.id === game.online.playerId; });
  sendOnlineAction("ready", { ready: !(me && me.ready) });
}

function onlineStartGame() {
  sendOnlineAction("start_game");
}

function onlineDrawCard(idx) {
  const player = game.players[idx];
  if (!player || player.id !== game.online.playerId) return;
  sendOnlineAction("draw_card");
}

function onlineSubmitFormula(idx) {
  const player = game.players[idx];
  if (!player || player.id !== game.online.playerId) return;
  sendOnlineAction("submit_formula", { expr: player.inputDraft || "" });
}

function onlineConcede(idx) {
  const player = game.players[idx];
  if (!player || player.id !== game.online.playerId) return;
  sendOnlineAction("concede");
}

function onlineQuickChat(id) {
  sendOnlineAction("quick_chat", { id });
}

function onlineLeaveRoom(idx) {
  if (game.phase === "playing" && idx !== undefined) {
    onlineConcede(idx);
  }
  disconnectOnline(true);
  goToMenu();
}

function resetOnlineAfterEnded() {
  if (game.online && game.online.roomCode) markOnlineRoomClosed(game.online.roomCode);
  disconnectOnline(true);
}
