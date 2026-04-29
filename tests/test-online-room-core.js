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

function assertThrows(desc, fn, pattern) {
  try {
    fn();
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${desc}\n     expected throw`);
    failures.push({ desc, actual: "no throw", expected: String(pattern) });
  } catch (error) {
    const ok = pattern.test(error.message);
    if (ok) passed++;
    else {
      failed++;
      console.log(`  \x1b[31mFAIL\x1b[0m ${desc}\n     expected: ${pattern}\n     actual: ${error.message}`);
      failures.push({ desc, actual: error.message, expected: String(pattern) });
    }
  }
}

function assertThrowsCode(desc, fn, code) {
  try {
    fn();
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${desc}\n     expected throw`);
    failures.push({ desc, actual: "no throw", expected: code });
  } catch (error) {
    if (error.code === code) passed++;
    else {
      failed++;
      console.log(`  \x1b[31mFAIL\x1b[0m ${desc}\n     expected: ${code}\n     actual: ${error.code || error.message}`);
      failures.push({ desc, actual: error.code || error.message, expected: code });
    }
  }
}

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

function fixedRandom() {
  let n = 0;
  return () => ((n++ * 9301 + 49297) % 233280) / 233280;
}

section("create, join, ready, and start");
{
  const random = fixedRandom();
  const room = core.createRoom({ roomCode: "ABCD12", name: "Host", difficulty: "hard", maxPlayers: 4, now: 1000, random });
  assert("room starts in lobby", room.phase, "lobby");
  assert("host is created", room.players.length, 1);
  assert("host is ready by default", room.players[0].ready, true);
  assert("public room hides deck order", Object.prototype.hasOwnProperty.call(core.publicRoom(room, room.hostId), "deck"), false);
  assert("public room includes host token only for viewer", core.publicRoom(room, room.hostId).you.seatToken, room.players[0].seatToken);

  const p2 = core.joinRoom(room, { name: "P2", now: 1100, random }).player;
  const p3 = core.joinRoom(room, { name: "P3", now: 1200, random }).player;
  assert("join adds players", room.players.length, 3);
  assert("new player is not ready", p2.ready, false);

  assertThrows("host cannot start until everyone ready", () => core.startGame(room, room.hostId, { now: 1300, random }), /未准备/);
  core.setReady(room, p2.id, true, 1400);
  core.setReady(room, p3.id, true, 1500);
  core.startGame(room, room.hostId, { now: 1600, random });
  assert("start changes phase", room.phase, "playing");
  assert("each player has 3 cards", room.players.every(player => player.hand.length === 3), true);
  assert("deck count after deal", room.deck.length, core.createDeck("hard").length - 9);
}

section("draw, submit, win, and duplicate protection");
{
  const random = fixedRandom();
  const room = core.createRoom({ roomCode: "WIN123", name: "Host", difficulty: "easy", maxPlayers: 2, now: 2000, random });
  const p2 = core.joinRoom(room, { name: "P2", now: 2100, random }).player;
  core.setReady(room, p2.id, true, 2200);
  core.startGame(room, room.hostId, { now: 2300, random });

  const host = room.players[0];
  host.hand = [10, 10, 1];
  room.deck = [2, 3, 4, 5];
  const drawn = core.drawCardForPlayer(room, p2.id, 2400);
  assert("draw returns top card", drawn, 5);
  assert("draw increases hand", room.players[1].hand.length, 4);

  const bad = core.submitFormula(room, host.id, "10+10", 2500);
  assert("bad submit does not win", bad.ok, false);
  assert("bad submit records feedback", host.feedback.includes("没用") || host.feedback.includes("手牌"), true);

  const win = core.submitFormula(room, host.id, "10+10+A", 2600);
  assert("winning submit succeeds", win.win, true);
  assert("winning submit ends game", room.phase, "ended");
  assert("winner is host", room.winnerId, host.id);
  assertThrows("submit after end is rejected", () => core.submitFormula(room, p2.id, "1+1+1", 2700), /当前不能提交/);
}

section("reconnect, quick chat, and concede");
{
  const random = fixedRandom();
  const room = core.createRoom({ roomCode: "CHAT01", name: "Host", difficulty: "normal", maxPlayers: 2, now: 3000, random });
  const p2 = core.joinRoom(room, { name: "P2", now: 3100, random }).player;
  core.markDisconnected(room, p2.id, 3200);
  assert("disconnect marks player offline", p2.connected, false);

  const rejoin = core.joinRoom(room, { name: "P2 back", playerId: p2.id, seatToken: p2.seatToken, now: 3300 });
  assert("matching token reconnects same player", rejoin.reconnected, true);
  assert("reconnect keeps same player id", rejoin.player.id, p2.id);
  assert("reconnect updates name", rejoin.player.name, "P2 back");

  core.quickChat(room, p2.id, "nice", 5000);
  assert("quick chat writes event", room.events[room.events.length - 1].type, "chat");
  assertThrows("quick chat cooldown rejects spam", () => core.quickChat(room, p2.id, "wow", 5100), /慢/);

  core.setReady(room, p2.id, true, 6000);
  core.startGame(room, room.hostId, { now: 6100, random });
  core.concedePlayer(room, p2.id, 6200);
  assert("last active player wins after concede", room.winnerId, room.hostId);
  assert("concede ends game", room.phase, "ended");
}

section("presence draft updates are transient");
{
  const random = fixedRandom();
  const room = core.createRoom({ roomCode: "LIVE01", name: "Host", difficulty: "easy", maxPlayers: 2, now: 7000, random });
  const p2 = core.joinRoom(room, { name: "P2", now: 7100, random }).player;
  assertThrows("presence before start is rejected", () => core.createPresenceUpdate(room, p2.id, { draft: "7" }, { now: 7200 }), /同步|playing|操作/);

  core.setReady(room, p2.id, true, 7300);
  core.startGame(room, room.hostId, { now: 7400, random });
  p2.hand = [7, 7, 7];
  const beforeVersion = room.version;
  const beforeEvents = room.events.length;
  const update = core.createPresenceUpdate(room, p2.id, {
    draft: "7".repeat(300),
    action: "card",
    cardIndex: 1,
    symbol: "7",
    seq: 9
  }, { now: 7500 });

  assert("presence update uses public message type", update.type, "presence_update");
  assert("presence update belongs to player", update.playerId, p2.id);
  assert("presence draft is clamped", update.draft.length, core.PRESENCE_DRAFT_MAX_LENGTH);
  assert("presence includes card index", update.cardIndex, 1);
  assert("presence includes card value", update.cardValue, 7);
  assert("presence keeps sequence", update.seq, 9);
  assert("presence does not bump room version", room.version, beforeVersion);
  assert("presence does not append event log", room.events.length, beforeEvents);
}

section("ended rooms allow seat reconnect and rematch requires every seat");
{
  const random = fixedRandom();
  const room = core.createRoom({ roomCode: "TERM01", name: "Host", difficulty: "easy", maxPlayers: 2, now: 8000, random });
  const p2 = core.joinRoom(room, { name: "P2", now: 8100, random }).player;
  core.setReady(room, p2.id, true, 8200);
  core.startGame(room, room.hostId, { now: 8300, random });

  const rejoin = core.joinRoom(room, { name: "P2 back", playerId: p2.id, seatToken: p2.seatToken, now: 8400 });
  assert("playing room allows matching token reconnect", rejoin.player.id, p2.id);
  assertThrows("playing room rejects fresh join", () => core.joinRoom(room, { name: "Late", now: 8500, random }), /已经开始|已开始|寮€濮?/);

  room.players[0].hand = [10, 10, 1];
  core.submitFormula(room, room.hostId, "10+10+A", 8600);
  assert("room is ended before terminal checks", room.phase, "ended");
  const endedRejoin = core.joinRoom(room, { name: "P2", playerId: p2.id, seatToken: p2.seatToken, now: 8700 });
  assert("ended room allows matching token reconnect", endedRejoin.player.id, p2.id);
  assertThrowsCode("ended room rejects fresh join with room_ended", () => core.joinRoom(room, { name: "Late", now: 8800, random }), "room_ended");

  const beforeDeck = room.deck.length;
  const oldHostHand = room.players[0].hand.slice();
  core.setRematchVote(room, room.hostId, true, { now: 8900, random });
  assert("one rematch vote keeps room ended", room.phase, "ended");
  assert("public rematch count tracks one vote", core.publicRoom(room, room.hostId).rematchAgreedCount, 1);
  core.setRematchVote(room, p2.id, true, { now: 9000, random });
  assert("all rematch votes start next round", room.phase, "playing");
  assert("rematch increments round", room.round, 2);
  assert("rematch consumes remaining deck only", room.deck.length, beforeDeck - 6);
  assert("rematch replaces old host hand", JSON.stringify(room.players[0].hand) === JSON.stringify(oldHostHand), false);
}

section("rematch rejects when remaining deck cannot redeal everyone");
{
  const random = fixedRandom();
  const room = core.createRoom({ roomCode: "SHORT1", name: "Host", difficulty: "easy", maxPlayers: 2, now: 9100, random });
  const p2 = core.joinRoom(room, { name: "P2", now: 9200, random }).player;
  core.setReady(room, p2.id, true, 9300);
  core.startGame(room, room.hostId, { now: 9400, random });
  room.players[0].hand = [10, 10, 1];
  core.submitFormula(room, room.hostId, "10+10+A", 9500);
  room.deck = [1, 2, 3, 4, 5];
  assertThrowsCode("short deck rejects rematch vote", () => core.setRematchVote(room, room.hostId, true, { now: 9600, random }), "deck_not_enough");
  assert("short deck room remains ended", room.phase, "ended");
}

console.log(`\n${"=".repeat(60)}`);
console.log("  online room core test result");
console.log(`${"=".repeat(60)}`);
console.log(`  passed: \x1b[32m${passed}\x1b[0m`);
console.log(`  failed: \x1b[31m${failed}\x1b[0m`);
console.log(`  total: ${passed + failed}`);
console.log(`${"=".repeat(60)}`);

if (failures.length) process.exit(1);
console.log("\n\x1b[32mOK online room core checks passed\x1b[0m");
