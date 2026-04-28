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

function randomFactory(seed) {
  let n = seed;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 0x100000000;
  };
}

console.log(`\n${"=".repeat(60)}`);
console.log("  online load simulation: 500 clients / 125 rooms");
console.log(`${"=".repeat(60)}`);

const started = Date.now();
const rooms = [];
const roomCount = 125;
let clients = 0;
let errors = 0;

for (let r = 0; r < roomCount; r++) {
  const random = randomFactory(r + 1);
  const now = 1000000 + r * 10000;
  const room = core.createRoom({
    roomCode: "R" + String(r).padStart(5, "0"),
    name: "Host-" + r,
    difficulty: r % 3 === 0 ? "easy" : r % 3 === 1 ? "normal" : "hard",
    maxPlayers: 4,
    now,
    random
  });
  clients++;
  const joined = [];
  for (let i = 1; i <= 3; i++) {
    joined.push(core.joinRoom(room, { name: "P" + i + "-" + r, now: now + i, random }).player);
    clients++;
  }
  for (const player of joined) core.setReady(room, player.id, true, now + 100);
  core.startGame(room, room.hostId, { now: now + 200, random });
  for (const player of room.players) {
    const pong = core.applyAction(room, player.id, { type: "heartbeat" }, { now: now + 300 });
    if (!pong || pong.type !== "pong") errors++;
  }
  try {
    core.quickChat(room, joined[0].id, "nice", now + 1500);
  } catch (_) {
    errors++;
  }
  room.players[0].hand = [10, 10, 1];
  const win = core.submitFormula(room, room.hostId, "10+10+A", now + 2500);
  if (!win.win || room.phase !== "ended") errors++;
  rooms.push(room);
}

const elapsed = Date.now() - started;
const winnerIds = rooms.map(room => room.winnerId).filter(Boolean);
const uniqueGameWinners = rooms.every(room => room.players.filter(player => player.id === room.winnerId).length === 1);
const publicSnapshotsOk = rooms.every(room => {
  const view = core.publicRoom(room, room.hostId);
  return view.deck === undefined && view.deckCount === room.deck.length && view.players.length === 4;
});

assert("simulated client count", clients, 500);
assert("simulated room count", rooms.length, 125);
assert("all rooms ended", rooms.every(room => room.phase === "ended"), true);
assert("every room has one public winner", uniqueGameWinners, true);
assert("winner count equals room count", winnerIds.length, roomCount);
assert("snapshots hide deck order and keep counts", publicSnapshotsOk, true);
assert("simulation has no action errors", errors, 0);
assert("simulation stays quick", elapsed < 3000, true);

console.log(`  elapsed: ${elapsed}ms`);
console.log(`\n${"=".repeat(60)}`);
console.log("  online load test result");
console.log(`${"=".repeat(60)}`);
console.log(`  passed: \x1b[32m${passed}\x1b[0m`);
console.log(`  failed: \x1b[31m${failed}\x1b[0m`);
console.log(`  total: ${passed + failed}`);
console.log(`${"=".repeat(60)}`);

if (failures.length) process.exit(1);
console.log("\n\x1b[32mOK online load checks passed\x1b[0m");
