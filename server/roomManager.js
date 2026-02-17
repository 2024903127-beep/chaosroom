const { randomSpawn, SHIP_MAP } = require("./mapData");

const MAX_PLAYERS = 50;
const ROOM_CODE_LENGTH = 6;
const ROOM_STATES = {
  LOBBY: "LOBBY",
  ROUND1: "ROUND1",
  ROUND2: "ROUND2",
  FINAL: "FINAL",
  ENDED: "ENDED"
};

const rooms = new Map();
const socketToRoom = new Map();

function randomCode(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function generateRoomId() {
  let tries = 0;
  while (tries < 10000) {
    const id = randomCode(ROOM_CODE_LENGTH);
    if (!rooms.has(id)) return id;
    tries += 1;
  }
  throw new Error("Failed to generate unique room ID");
}

function buildPlayer(socketId, name) {
  const spawn = randomSpawn();
  return {
    id: socketId,
    name,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    health: 100,
    alive: true,
    spectator: false,
    input: { up: false, down: false, left: false, right: false },
    kills: 0,
    joinedAt: Date.now(),
    eliminatedAt: null,
    dashCooldownUntil: 0,
    dashBoostUntil: 0,
    killCooldownUntil: 0,
    isSaboteur: false,
    lastVoteCycleId: -1
  };
}

function buildGameState() {
  const now = Date.now();
  return {
    state: ROOM_STATES.LOBBY,
    startedAt: null,
    totalStartPlayers: 0,
    paused: false,
    map: { width: SHIP_MAP.width, height: SHIP_MAP.height },
    zone: {
      centerX: SHIP_MAP.zoneCenter.x,
      centerY: SHIP_MAP.zoneCenter.y,
      radius: SHIP_MAP.zoneStartRadius,
      minRadius: 85,
      lastShrinkAt: now
    },
    saboteur: {
      currentId: null,
      lastTwo: [],
      nextRotateAt: now + 60000
    },
    chaos: {
      active: null,
      lastType: null,
      nextAt: now + 20000
    },
    voting: {
      enabled: true,
      nextAt: now + 60000,
      active: false,
      cycleId: 0,
      endsAt: 0,
      votes: new Map()
    },
    end: {
      winnerId: null,
      winnerName: null,
      resetAt: 0
    }
  };
}

function createRoom(hostSocketId, hostName) {
  const roomId = generateRoomId();
  const host = buildPlayer(hostSocketId, hostName);
  const room = {
    id: roomId,
    hostId: hostSocketId,
    players: new Map([[hostSocketId, host]]),
    game: buildGameState()
  };
  rooms.set(roomId, room);
  socketToRoom.set(hostSocketId, roomId);
  return { room, hostPlayer: host };
}

function joinRoom(roomId, socketId, rawName) {
  const room = rooms.get(roomId);
  if (!room) return { error: "Room not found" };

  const name = (rawName || "").trim();
  if (!name) return { error: "Nickname is required" };
  if (room.players.size >= MAX_PLAYERS) return { error: "Room is full" };

  const lower = name.toLowerCase();
  for (const p of room.players.values()) {
    if (p.name.toLowerCase() === lower) {
      return { error: "Nickname already exists in this room" };
    }
  }

  const player = buildPlayer(socketId, name);
  room.players.set(socketId, player);
  socketToRoom.set(socketId, roomId);
  return { room, player };
}

function removePlayer(socketId) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return { room: null, removed: null, deleted: false };

  socketToRoom.delete(socketId);
  const room = rooms.get(roomId);
  if (!room) return { room: null, removed: null, deleted: false };

  const removed = room.players.get(socketId) || null;
  room.players.delete(socketId);

  if (room.hostId === socketId) {
    const nextHost = room.players.values().next().value;
    room.hostId = nextHost ? nextHost.id : null;
  }

  if (room.players.size === 0) {
    rooms.delete(roomId);
    return { room: null, removed, deleted: true, roomId };
  }

  return { room, removed, deleted: false, roomId };
}

function getRoomBySocket(socketId) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return null;
  return rooms.get(roomId) || null;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function getAllRooms() {
  return rooms;
}

function resetRoomToLobby(room) {
  room.game = buildGameState();
  for (const player of room.players.values()) {
    const spawn = randomSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.health = 100;
    player.alive = true;
    player.spectator = false;
    player.input = { up: false, down: false, left: false, right: false };
    player.kills = 0;
    player.eliminatedAt = null;
    player.dashCooldownUntil = 0;
    player.dashBoostUntil = 0;
    player.killCooldownUntil = 0;
    player.isSaboteur = false;
    player.lastVoteCycleId = -1;
  }
}

module.exports = {
  MAX_PLAYERS,
  ROOM_STATES,
  createRoom,
  joinRoom,
  removePlayer,
  getRoom,
  getRoomBySocket,
  getAllRooms,
  resetRoomToLobby
};