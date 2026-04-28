import { DurableObject } from "cloudflare:workers";
import roomCore from "./room-core.cjs";

const {
  createRoom,
  joinRoom,
  markDisconnected,
  removePlayer,
  pruneExpiredSeats,
  autoForfeitDisconnected,
  publicRoom,
  getSeatInfo,
  applyAction,
  createPresenceUpdate,
  PRESENCE_UPDATE_MIN_INTERVAL_MS,
  makeRoomCode
} = roomCore;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function bad(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function roomStub(env, code) {
  return env.EQ21_ROOM.get(env.EQ21_ROOM.idFromName(String(code || "").toUpperCase()));
}

function wsUrlFor(request, roomCode) {
  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/" + roomCode;
  url.search = "";
  return url.toString();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/api/rooms" && request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch (_) {
        body = {};
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const roomCode = String(body.roomCode || makeRoomCode()).toUpperCase();
        const stub = roomStub(env, roomCode);
        const response = await stub.fetch(new Request(url.origin + "/internal/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, roomCode })
        }));
        if (response.status !== 409 || body.roomCode) {
          const data = await response.json();
          if (!response.ok) return json(data, response.status);
          return json({ ...data, wsUrl: wsUrlFor(request, roomCode) }, response.status);
        }
      }
      return bad("房间码生成失败，请重试", 503);
    }

    const roomStatusMatch = path.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
    if (roomStatusMatch && request.method === "GET") {
      const roomCode = roomStatusMatch[1].toUpperCase();
      return roomStub(env, roomCode).fetch(new Request(url.origin + "/internal/status", { method: "GET" }));
    }

    const wsMatch = path.match(/^\/ws\/([A-Za-z0-9]+)$/);
    if (wsMatch && request.method === "GET") {
      return roomStub(env, wsMatch[1].toUpperCase()).fetch(request);
    }

    return json({
      ok: true,
      service: "Equation 21 Online Rooms",
      endpoints: ["POST /api/rooms", "GET /api/rooms/:roomCode", "GET /ws/:roomCode"]
    });
  }
};

export class Eq21Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.presenceLastAt = new Map();
  }

  async loadRoom() {
    if (!this.room) this.room = await this.ctx.storage.get("room");
    return this.room;
  }

  async saveRoom() {
    if (this.room) await this.ctx.storage.put("room", this.room);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/internal/create" && request.method === "POST") {
      const existing = await this.loadRoom();
      if (existing) return bad("房间已存在", 409);
      const body = await request.json();
      this.room = createRoom(body || {});
      await this.saveRoom();
      const host = getSeatInfo(this.room, this.room.hostId);
      return json({
        ok: true,
        roomCode: this.room.roomCode,
        playerId: host.playerId,
        seatToken: host.seatToken,
        room: publicRoom(this.room, host.playerId)
      });
    }

    if (url.pathname === "/internal/status" && request.method === "GET") {
      const room = await this.loadRoom();
      if (!room) return bad("房间不存在", 404);
      return json({ ok: true, room: publicRoom(room, null) });
    }

    if (request.headers.get("upgrade") !== "websocket") return bad("需要 WebSocket 连接", 426);
    const room = await this.loadRoom();
    if (!room) return bad("房间不存在", 404);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null, roomCode: room.roomCode });
    server.send(JSON.stringify({ type: "hello", roomCode: room.roomCode }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    let payload;
    try {
      payload = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch (_) {
      this.sendError(ws, "消息格式错误");
      return;
    }

    try {
      await this.loadRoom();
      if (!this.room) throw new Error("房间不存在");

      if (payload.type === "join") {
        const joined = joinRoom(this.room, {
          name: payload.name,
          playerId: payload.playerId,
          seatToken: payload.seatToken
        });
        ws.serializeAttachment({ playerId: joined.player.id, roomCode: this.room.roomCode });
        await this.saveRoom();
        this.sendSnapshot(ws);
        this.broadcastSnapshots(ws);
        return;
      }

      const attachment = ws.deserializeAttachment() || {};
      if (!attachment.playerId) throw new Error("请先加入房间");
      if (payload.type === "draft_update") {
        const now = Date.now();
        const lastAt = this.presenceLastAt.get(attachment.playerId) || 0;
        if (now - lastAt < PRESENCE_UPDATE_MIN_INTERVAL_MS) return;
        const update = createPresenceUpdate(this.room, attachment.playerId, payload.payload || {}, { now });
        this.presenceLastAt.set(attachment.playerId, now);
        this.broadcastPresence(update, ws);
        return;
      }
      const result = applyAction(this.room, attachment.playerId, { type: payload.type, payload: payload.payload || {} });
      if (result && result.type === "pong") {
        ws.send(JSON.stringify({ type: "pong", ts: result.ts }));
        return;
      }
      await this.saveRoom();
      this.broadcastSnapshots();
      if (this.room.phase === "ended") this.broadcast({ type: "game_ended", room: publicRoom(this.room, null) });
    } catch (error) {
      this.sendError(ws, error && error.message ? error.message : "操作失败", error && error.code);
    }
  }

  async webSocketClose(ws) {
    const attachment = ws.deserializeAttachment() || {};
    if (!attachment.playerId) return;
    await this.loadRoom();
    if (!this.room) return;
    if (this.room.phase === "lobby") {
      removePlayer(this.room, attachment.playerId, Date.now());
    } else {
      markDisconnected(this.room, attachment.playerId, Date.now());
    }
    await this.saveRoom();
    this.broadcastSnapshots(ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  sendError(ws, message, code) {
    try {
      ws.send(JSON.stringify({ type: "error", error: message, code: code || "" }));
    } catch (_) {}
  }

  sendSnapshot(ws) {
    const attachment = ws.deserializeAttachment ? ws.deserializeAttachment() : {};
    const viewerId = attachment && attachment.playerId;
    ws.send(JSON.stringify({ type: "state_snapshot", room: publicRoom(this.room, viewerId) }));
  }

  broadcastSnapshots(skip) {
    for (const socket of this.ctx.getWebSockets()) {
      if (skip && socket === skip) continue;
      try {
        this.sendSnapshot(socket);
      } catch (_) {}
    }
  }

  broadcast(payload) {
    const text = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(text);
      } catch (_) {}
    }
  }

  broadcastPresence(payload, skip) {
    const text = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (skip && socket === skip) continue;
      try {
        const attachment = socket.deserializeAttachment ? socket.deserializeAttachment() : {};
        if (attachment && attachment.playerId) socket.send(text);
      } catch (_) {}
    }
  }
}
