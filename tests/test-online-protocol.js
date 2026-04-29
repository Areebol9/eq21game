#!/usr/bin/env node
"use strict";

const core = require("../worker/room-core.cjs");

let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, actual, expected) {
  const ok = typeof expected === "function" ? expected(actual) : actual === expected;
  if (ok) {
    passed++;
    if (process.argv.includes("-v")) console.log(`  \x1b[32mOK\x1b[0m ${desc}`);
  } else {
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${desc}\n     expected: ${JSON.stringify(expected)}\n     actual: ${JSON.stringify(actual)}`);
    failures.push({ desc, actual, expected });
  }
}

function assertThrowsCode(desc, fn, code) {
  try {
    fn();
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${desc}\n     expected throw`);
    failures.push({ desc, actual: "no throw", expected: code });
  } catch (error) {
    const ok = error && error.code === code;
    if (ok) passed++;
    else {
      failed++;
      console.log(`  \x1b[31mFAIL\x1b[0m ${desc}\n     expected: ${code}\n     actual: ${error && (error.code || error.message)}`);
      failures.push({ desc, actual: error && (error.code || error.message), expected: code });
    }
  }
}

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

function fixedRandom() {
  let n = 1;
  return () => ((n++ * 48271) % 2147483647) / 2147483647;
}

class ProtocolHarness {
  constructor() {
    this.now = 100000;
    this.random = fixedRandom();
    this.room = core.createRoom({ roomCode: "ROOM42", name: "Host", difficulty: "easy", maxPlayers: 4, now: this.now, random: this.random });
    this.clients = [];
    this.presenceLastAt = new Map();
  }

  connect(name, seat) {
    this.now += 100;
    const joined = core.joinRoom(this.room, {
      name,
      playerId: seat && seat.playerId,
      seatToken: seat && seat.seatToken,
      now: this.now,
      random: this.random
    });
    const client = {
      playerId: joined.player.id,
      seatToken: joined.player.seatToken,
      name,
      messages: []
    };
    this.clients.push(client);
    this.broadcast();
    return client;
  }

  action(client, type, payload) {
    this.now += 100;
    try {
      const result = core.applyAction(this.room, client.playerId, { type, payload: payload || {} }, { now: this.now, random: this.random });
      if (result && result.type === "pong") client.messages.push(result);
      else this.broadcast();
    } catch (error) {
      client.messages.push({ type: "error", error: error.message });
    }
  }

  draft(client, payload, advance) {
    this.now += advance === undefined ? 100 : advance;
    const lastAt = this.presenceLastAt.get(client.playerId) || 0;
    if (this.now - lastAt < core.PRESENCE_UPDATE_MIN_INTERVAL_MS) return false;
    const update = core.createPresenceUpdate(this.room, client.playerId, payload || {}, { now: this.now });
    this.presenceLastAt.set(client.playerId, this.now);
    for (const other of this.clients) {
      if (other !== client) other.messages.push(update);
    }
    return true;
  }

  disconnect(client) {
    this.now += 100;
    core.markDisconnected(this.room, client.playerId, this.now);
    this.broadcast();
  }

  broadcast() {
    for (const client of this.clients) {
      client.messages.push({ type: "state_snapshot", room: core.publicRoom(this.room, client.playerId) });
    }
  }

  latest(client) {
    for (let i = client.messages.length - 1; i >= 0; i--) {
      if (client.messages[i].type === "state_snapshot") return client.messages[i].room;
    }
    return null;
  }
}

section("4-client protocol completes one game with one winner");
{
  const h = new ProtocolHarness();
  const hostSeat = core.getSeatInfo(h.room, h.room.hostId);
  const host = h.connect("Host", hostSeat);
  const p2 = h.connect("P2");
  const p3 = h.connect("P3");
  const p4 = h.connect("P4");

  assert("all clients joined", h.room.players.length, 4);
  assert("every client receives room code", h.clients.every(c => h.latest(c).roomCode === "ROOM42"), true);
  assert("viewer snapshot contains own token", h.latest(p2).you.seatToken, p2.seatToken);
  assert("viewer snapshot does not expose other tokens", JSON.stringify(h.latest(p2)).includes(h.clients[0].seatToken), false);

  h.action(p2, "ready", { ready: true });
  h.action(p3, "ready", { ready: true });
  h.action(p4, "ready", { ready: true });
  h.action(host, "start_game");
  assert("start enters playing phase", h.room.phase, "playing");
  assert("all snapshots agree on version", new Set(h.clients.map(c => h.latest(c).version)).size, 1);
  assert("versions are positive", h.latest(host).version > 1, true);

  const versionBeforePresence = h.room.version;
  const eventsBeforePresence = h.room.events.length;
  const presenceSent = h.draft(p2, { draft: "7+7", action: "card", cardIndex: 0, symbol: "7", seq: 1 });
  const hostPresence = host.messages[host.messages.length - 1];
  const p2PresenceCount = p2.messages.filter(message => message.type === "presence_update").length;
  assert("draft update is broadcast to opponents", presenceSent, true);
  assert("opponent receives presence update", hostPresence.type, "presence_update");
  assert("presence carries draft expression", hostPresence.draft, "7+7");
  assert("presence does not echo to sender", p2PresenceCount, 0);
  assert("presence does not change room version", h.room.version, versionBeforePresence);
  assert("presence does not add events", h.room.events.length, eventsBeforePresence);
  const presenceCountBeforeThrottle = host.messages.filter(message => message.type === "presence_update").length;
  const throttled = h.draft(p2, { draft: "7+7+7", action: "symbol", symbol: "+", seq: 2 }, 10);
  assert("rapid draft update is throttled", throttled, false);
  assert("throttled draft is not broadcast", host.messages.filter(message => message.type === "presence_update").length, presenceCountBeforeThrottle);

  h.room.players[0].hand = [10, 10, 1];
  h.broadcast();
  h.action(host, "submit_formula", { expr: "10+10+A" });

  assert("game ended", h.room.phase, "ended");
  assert("host is winner", h.room.winnerId, host.playerId);
  assert("only one winner in public state", h.latest(p4).players.filter(p => p.id === h.room.winnerId).length, 1);
  assert("all clients see ended", h.clients.every(c => h.latest(c).phase === "ended"), true);
  assert("all clients see same winner", new Set(h.clients.map(c => h.latest(c).winnerId)).size, 1);

  h.action(p2, "draw_card");
  const error = p2.messages[p2.messages.length - 1];
  assert("actions after game end return protocol error", error.type, "error");
  const p2Late = h.connect("P2 late", { playerId: p2.playerId, seatToken: p2.seatToken });
  assert("ended room allows token reconnect", p2Late.playerId, p2.playerId);
  assertThrowsCode("ended room rejects fresh join", () => h.connect("Late"), "room_ended");

  const beforeRematchDeck = h.room.deck.length;
  h.action(host, "rematch_vote", { agreed: true });
  assert("one rematch vote keeps ended phase", h.room.phase, "ended");
  assert("snapshots show one rematch vote", h.latest(p4).rematchAgreedCount, 1);
  h.action(p2Late, "rematch_vote", { agreed: true });
  h.action(p3, "rematch_vote", { agreed: true });
  h.action(p4, "rematch_vote", { agreed: true });
  assert("all rematch votes start new round", h.room.phase, "playing");
  assert("rematch increments public round", h.latest(host).round, 2);
  assert("rematch consumes remaining deck", h.room.deck.length, beforeRematchDeck - 12);
  assert("all clients see rematch playing", h.clients.every(c => h.latest(c).phase === "playing"), true);
}

section("heartbeat, quick chat, and reconnect snapshots");
{
  const h = new ProtocolHarness();
  const host = h.connect("Host", core.getSeatInfo(h.room, h.room.hostId));
  const p2 = h.connect("P2");

  h.action(p2, "heartbeat");
  assert("heartbeat replies pong", p2.messages[p2.messages.length - 1].type, "pong");

  h.action(p2, "quick_chat", { id: "nice" });
  assert("quick chat broadcasts event", h.latest(host).events.some(e => e.type === "chat"), true);

  h.disconnect(p2);
  assert("disconnect appears in snapshots", h.latest(host).players.find(p => p.id === p2.playerId).connected, false);

  const p2Back = h.connect("P2 back", { playerId: p2.playerId, seatToken: p2.seatToken });
  assert("reconnect preserves seat id", p2Back.playerId, p2.playerId);
  assert("reconnect restores connected state", h.latest(host).players.find(p => p.id === p2.playerId).connected, true);
}

console.log(`\n${"=".repeat(60)}`);
console.log("  online protocol test result");
console.log(`${"=".repeat(60)}`);
console.log(`  passed: \x1b[32m${passed}\x1b[0m`);
console.log(`  failed: \x1b[31m${failed}\x1b[0m`);
console.log(`  total: ${passed + failed}`);
console.log(`${"=".repeat(60)}`);

if (failures.length) process.exit(1);
console.log("\n\x1b[32mOK online protocol checks passed\x1b[0m");
