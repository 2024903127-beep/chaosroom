const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const {
  createRoom,
  joinRoom,
  removePlayer,
  getRoomBySocket,
  getAllRooms,
  getRoom
} = require("./roomManager");
const {
  TICK_RATE,
  emitRoomInfo,
  buildStatePacket,
  startGame,
  tickRoom,
  updatePlayerInput,
  triggerDash,
  attemptKill,
  submitVote
} = require("./gameEngine");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

app.use(express.static(path.join(__dirname, "..", "public")));

function sanitizeName(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 20);
}

function sendJoinPayload(socket, room, playerId) {
  socket.emit("room:joined", {
    roomId: room.id,
    playerId,
    hostId: room.hostId,
    gameState: room.game.state,
    snapshot: buildStatePacket(room)
  });
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload = {}) => {
    const name = sanitizeName(payload.name);
    if (!name) {
      socket.emit("error:message", { message: "Nickname is required" });
      return;
    }

    try {
      const { room } = createRoom(socket.id, name);
      socket.join(room.id);
      sendJoinPayload(socket, room, socket.id);
      emitRoomInfo(room, io);
    } catch (err) {
      socket.emit("error:message", { message: "Unable to create room" });
    }
  });

  socket.on("room:join", (payload = {}) => {
    const roomId = String(payload.roomId || "").toUpperCase().trim();
    const name = sanitizeName(payload.name);
    const result = joinRoom(roomId, socket.id, name);
    if (result.error) {
      socket.emit("error:message", { message: result.error });
      return;
    }

    const room = result.room;
    socket.join(room.id);
    sendJoinPayload(socket, room, socket.id);
    emitRoomInfo(room, io);
  });

  socket.on("game:start", () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit("error:message", { message: "Only host can start" });
      return;
    }

    const result = startGame(room, io);
    if (result.error) {
      socket.emit("error:message", { message: result.error });
      return;
    }
  });

  socket.on("input:update", (payload = {}) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    updatePlayerInput(room, socket.id, payload);
  });

  socket.on("action:dash", () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const result = triggerDash(room, socket.id, Date.now());
    if (result.error) socket.emit("error:message", { message: result.error });
  });

  socket.on("action:kill", (payload = {}) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const targetId = payload.targetId;
    const result = attemptKill(room, socket.id, targetId, Date.now(), io);
    if (result.error) socket.emit("error:message", { message: result.error });
  });

  socket.on("vote:submit", (payload = {}) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const result = submitVote(room, socket.id, payload.targetId);
    if (result.error) socket.emit("error:message", { message: result.error });
  });

  socket.on("disconnect", () => {
    const outcome = removePlayer(socket.id);
    if (!outcome.room) return;

    const room = outcome.room;

    if (room.game.saboteur.currentId === socket.id) {
      room.game.saboteur.currentId = null;
      room.game.saboteur.nextRotateAt = Date.now();
    }

    emitRoomInfo(room, io);
    io.to(room.id).emit("state:update", buildStatePacket(room));
  });
});

setInterval(() => {
  const dtSec = 1 / TICK_RATE;
  const now = Date.now();
  for (const room of getAllRooms().values()) {
    tickRoom(room, io, dtSec, now);
  }
}, Math.floor(1000 / TICK_RATE));

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: getAllRooms().size });
});

app.get("/room/:id", (req, res) => {
  const room = getRoom(String(req.params.id || "").toUpperCase());
  if (!room) return res.status(404).json({ error: "Not found" });
  return res.json({
    id: room.id,
    hostId: room.hostId,
    state: room.game.state,
    players: room.players.size
  });
});

server.listen(PORT, () => {
  console.log(`Chaos Room server running on port ${PORT}`);
});