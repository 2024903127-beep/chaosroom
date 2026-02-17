const { ROOM_STATES, resetRoomToLobby } = require("./roomManager");
const { rotateSaboteur, clearSaboteur } = require("./roleManager");
const { SHIP_MAP } = require("./mapData");
const {
  triggerChaos,
  updateChaos,
  isChaosActive,
  speedMultiplier,
  finalShrinkMultiplier,
  roundChaosIntervalMs
} = require("./chaosManager");

const TICK_RATE = 12;
const BASE_SPEED = 185;
const SABOTEUR_SPEED_MULT = 1.1;
const DASH_COOLDOWN_MS = 5000;
const KILL_COOLDOWN_MS = 10000;
const KILL_RANGE = 85;
const SAFE_ZONE_DAMAGE_PER_SEC = 10;
const FINAL_SHRINK_PER_SEC = 14;
const PLAYER_COLLISION_RADIUS = 18;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function getAlivePlayers(room) {
  return [...room.players.values()].filter((p) => p.alive);
}

function countAlive(room) {
  let n = 0;
  for (const p of room.players.values()) if (p.alive) n += 1;
  return n;
}

function resolveCircleRect(player, wall, radius) {
  const closestX = clamp(player.x, wall.x, wall.x + wall.w);
  const closestY = clamp(player.y, wall.y, wall.y + wall.h);
  let dx = player.x - closestX;
  let dy = player.y - closestY;
  let dist = Math.hypot(dx, dy);

  if (dist > 0 && dist < radius) {
    const overlap = radius - dist;
    player.x += (dx / dist) * overlap;
    player.y += (dy / dist) * overlap;
    return;
  }

  const insideX = player.x >= wall.x && player.x <= wall.x + wall.w;
  const insideY = player.y >= wall.y && player.y <= wall.y + wall.h;
  if (!(insideX && insideY)) return;

  const left = Math.abs(player.x - wall.x);
  const right = Math.abs(wall.x + wall.w - player.x);
  const top = Math.abs(player.y - wall.y);
  const bottom = Math.abs(wall.y + wall.h - player.y);
  const minPen = Math.min(left, right, top, bottom);

  if (minPen === left) player.x = wall.x - radius;
  else if (minPen === right) player.x = wall.x + wall.w + radius;
  else if (minPen === top) player.y = wall.y - radius;
  else player.y = wall.y + wall.h + radius;
}

function resolveMapCollision(room, player) {
  const radius = PLAYER_COLLISION_RADIUS;
  player.x = clamp(player.x, radius, room.game.map.width - radius);
  player.y = clamp(player.y, radius, room.game.map.height - radius);

  for (let i = 0; i < 2; i += 1) {
    for (const wall of SHIP_MAP.walls) {
      resolveCircleRect(player, wall, radius);
    }
    player.x = clamp(player.x, radius, room.game.map.width - radius);
    player.y = clamp(player.y, radius, room.game.map.height - radius);
  }
}

function buildStatePacket(room) {
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    n: p.name,
    x: Math.round(p.x),
    y: Math.round(p.y),
    vx: Math.round(p.vx),
    vy: Math.round(p.vy),
    h: Math.round(p.health),
    a: p.alive,
    k: p.kills
  }));

  return {
    roomId: room.id,
    hostId: room.hostId,
    gameState: room.game.state,
    paused: room.game.paused,
    zone: {
      x: room.game.zone.centerX,
      y: room.game.zone.centerY,
      r: Math.round(room.game.zone.radius)
    },
    chaos: room.game.chaos.active ? { type: room.game.chaos.active.type, endsAt: room.game.chaos.active.endsAt } : null,
    voting: {
      active: room.game.voting.active,
      endsAt: room.game.voting.endsAt,
      enabled: room.game.voting.enabled
    },
    players,
    aliveCount: countAlive(room),
    ts: Date.now()
  };
}

function emitRoomInfo(room, io) {
  io.to(room.id).emit("room:update", {
    roomId: room.id,
    hostId: room.hostId,
    gameState: room.game.state,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, alive: p.alive }))
  });
}

function eliminatePlayer(room, player, reason, killerId, now, io) {
  if (!player || !player.alive) return false;

  player.alive = false;
  player.spectator = true;
  player.health = 0;
  player.vx = 0;
  player.vy = 0;
  player.input = { up: false, down: false, left: false, right: false };
  player.eliminatedAt = now;

  if (player.isSaboteur || room.game.saboteur.currentId === player.id) {
    clearSaboteur(room, io);
  }

  io.to(room.id).emit("player:eliminated", {
    playerId: player.id,
    playerName: player.name,
    reason,
    killerId: killerId || null
  });
  return true;
}

function startGame(room, io) {
  if (room.game.state !== ROOM_STATES.LOBBY) {
    return { error: "Game already started" };
  }

  const alive = getAlivePlayers(room);
  if (alive.length < 2) {
    return { error: "Need at least 2 players to start" };
  }

  const now = Date.now();
  room.game.state = ROOM_STATES.ROUND1;
  room.game.startedAt = now;
  room.game.totalStartPlayers = alive.length;
  room.game.paused = false;
  room.game.saboteur.nextRotateAt = now;
  room.game.chaos.nextAt = now + roundChaosIntervalMs(ROOM_STATES.ROUND1);
  room.game.voting.enabled = true;
  room.game.voting.active = false;
  room.game.voting.nextAt = now + 60000;
  room.game.voting.votes.clear();
  room.game.zone.radius = SHIP_MAP.zoneStartRadius;
  room.game.zone.lastShrinkAt = now;
  room.game.end.winnerId = null;
  room.game.end.winnerName = null;
  room.game.end.resetAt = 0;

  emitRoomInfo(room, io);
  io.to(room.id).emit("game:started", { at: now });
  return { ok: true };
}

function transitionTo(room, nextState, now, io) {
  if (room.game.state === nextState) return;
  room.game.state = nextState;

  if (nextState === ROOM_STATES.ROUND2) {
    room.game.zone.radius = Math.max(room.game.zone.minRadius, room.game.zone.radius * 0.7);
    room.game.zone.lastShrinkAt = now;
    room.game.voting.enabled = false;
    room.game.voting.active = false;
    room.game.paused = false;
  }

  if (nextState === ROOM_STATES.FINAL) {
    room.game.voting.enabled = false;
    room.game.voting.active = false;
    room.game.paused = false;
  }

  room.game.chaos.nextAt = now + roundChaosIntervalMs(nextState);
  io.to(room.id).emit("round:update", { state: nextState });
}

function applyMovement(room, dtSec, now) {
  const reverse = isChaosActive(room, "reverse_controls");
  const slippery = isChaosActive(room, "slippery_movement");
  const speedMult = speedMultiplier(room);

  for (const p of room.players.values()) {
    if (!p.alive) continue;

    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);

    if (reverse) {
      dx = -dx;
      dy = -dy;
    }

    const len = Math.hypot(dx, dy);
    const hasInput = len > 0;
    if (hasInput) {
      dx /= len;
      dy /= len;
    }

    let speed = BASE_SPEED;
    if (p.isSaboteur) speed *= SABOTEUR_SPEED_MULT;
    speed *= speedMult;

    if (slippery && !hasInput) {
      p.vx *= 0.97;
      p.vy *= 0.97;
    } else {
      p.vx = dx * speed;
      p.vy = dy * speed;
    }

    if (p.dashBoostUntil > now) {
      p.vx *= 2;
      p.vy *= 2;
    }

    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    resolveMapCollision(room, p);
  }
}

function applyPlayerCollisions(room) {
  const alive = getAlivePlayers(room);
  for (let i = 0; i < alive.length; i += 1) {
    for (let j = i + 1; j < alive.length; j += 1) {
      const a = alive[i];
      const b = alive[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minD = PLAYER_COLLISION_RADIUS * 2;
      if (d > 0 && d < minD) {
        const push = (minD - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x = clamp(a.x - nx * push, PLAYER_COLLISION_RADIUS, room.game.map.width - PLAYER_COLLISION_RADIUS);
        a.y = clamp(a.y - ny * push, PLAYER_COLLISION_RADIUS, room.game.map.height - PLAYER_COLLISION_RADIUS);
        b.x = clamp(b.x + nx * push, PLAYER_COLLISION_RADIUS, room.game.map.width - PLAYER_COLLISION_RADIUS);
        b.y = clamp(b.y + ny * push, PLAYER_COLLISION_RADIUS, room.game.map.height - PLAYER_COLLISION_RADIUS);
        resolveMapCollision(room, a);
        resolveMapCollision(room, b);
      }
    }
  }
}

function applySafeZone(room, dtSec, now, io) {
  const { centerX, centerY, radius } = room.game.zone;

  for (const p of room.players.values()) {
    if (!p.alive) continue;

    const d = Math.hypot(p.x - centerX, p.y - centerY);
    if (d > radius) {
      p.health -= SAFE_ZONE_DAMAGE_PER_SEC * dtSec;
    }

    if (d > radius + 80 && now - room.game.zone.lastShrinkAt < 3000) {
      const nx = (p.x - centerX) / d;
      const ny = (p.y - centerY) / d;
      p.x = centerX + nx * (radius - 4);
      p.y = centerY + ny * (radius - 4);
      resolveMapCollision(room, p);
    }

    if (p.health <= 0) {
      eliminatePlayer(room, p, "safe_zone", null, now, io);
    }
  }
}

function maybeRunVoting(room, now, io) {
  if (!room.game.voting.enabled || room.game.state !== ROOM_STATES.ROUND1) return;

  if (!room.game.voting.active && now >= room.game.voting.nextAt) {
    room.game.voting.active = true;
    room.game.voting.cycleId += 1;
    room.game.voting.endsAt = now + 10000;
    room.game.voting.votes = new Map();
    room.game.paused = true;

    io.to(room.id).emit("vote:started", {
      cycleId: room.game.voting.cycleId,
      endsAt: room.game.voting.endsAt,
      players: getAlivePlayers(room).map((p) => ({ id: p.id, name: p.name }))
    });
  }

  if (room.game.voting.active && now >= room.game.voting.endsAt) {
    const tally = new Map();
    for (const targetId of room.game.voting.votes.values()) {
      tally.set(targetId, (tally.get(targetId) || 0) + 1);
    }

    let topId = null;
    let topCount = 0;
    for (const [id, count] of tally.entries()) {
      if (count > topCount) {
        topId = id;
        topCount = count;
      }
    }

    const totalVotes = room.game.voting.votes.size;
    const majority = topCount > totalVotes / 2;
    const currentSaboteurId = room.game.saboteur.currentId;

    let eliminated = null;
    if (!(majority && topId && topId === currentSaboteurId)) {
      const alive = getAlivePlayers(room);
      if (alive.length > 1) {
        eliminated = alive[Math.floor(Math.random() * alive.length)];
        eliminatePlayer(room, eliminated, "vote_random", null, now, io);
      }
    }

    io.to(room.id).emit("vote:result", {
      topId,
      topCount,
      totalVotes,
      currentSaboteurId,
      eliminatedId: eliminated ? eliminated.id : null
    });

    room.game.voting.active = false;
    room.game.voting.votes.clear();
    room.game.voting.nextAt = now + 60000;
    room.game.paused = false;
  }
}

function maybeProgressRounds(room, now, io) {
  const alive = countAlive(room);
  if (room.game.state === ROOM_STATES.ROUND1) {
    const threshold = Math.ceil(room.game.totalStartPlayers * 0.5);
    if (alive <= threshold) {
      transitionTo(room, ROOM_STATES.ROUND2, now, io);
    }
  }

  if (room.game.state === ROOM_STATES.ROUND2 && alive <= 6) {
    transitionTo(room, ROOM_STATES.FINAL, now, io);
  }

  if (room.game.state === ROOM_STATES.FINAL) {
    room.game.zone.radius = Math.max(
      room.game.zone.minRadius,
      room.game.zone.radius - FINAL_SHRINK_PER_SEC * finalShrinkMultiplier(room) * (1 / TICK_RATE)
    );
    room.game.zone.lastShrinkAt = now;
  }
}

function maybeEndGame(room, now, io) {
  if (![ROOM_STATES.ROUND1, ROOM_STATES.ROUND2, ROOM_STATES.FINAL].includes(room.game.state)) {
    if (room.game.state === ROOM_STATES.ENDED && now >= room.game.end.resetAt) {
      resetRoomToLobby(room);
      io.to(room.id).emit("game:reset", { state: ROOM_STATES.LOBBY });
      emitRoomInfo(room, io);
    }
    return;
  }

  const alive = getAlivePlayers(room);
  if (alive.length > 1) return;

  room.game.state = ROOM_STATES.ENDED;
  room.game.paused = true;
  room.game.end.winnerId = alive[0] ? alive[0].id : null;
  room.game.end.winnerName = alive[0] ? alive[0].name : "No winner";
  room.game.end.resetAt = now + 8000;

  io.to(room.id).emit("game:ended", {
    winnerId: room.game.end.winnerId,
    winnerName: room.game.end.winnerName,
    stats: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      kills: p.kills,
      survivalTimeSec: Math.round(((p.eliminatedAt || now) - room.game.startedAt) / 1000)
    }))
  });
}

function tickRoom(room, io, dtSec, now) {
  if (room.game.state === ROOM_STATES.LOBBY) return;

  maybeRunVoting(room, now, io);

  if (!room.game.voting.active && now >= room.game.saboteur.nextRotateAt) {
    rotateSaboteur(room, now, io);
  }

  if (!room.game.voting.active && now >= room.game.chaos.nextAt) {
    const chaos = triggerChaos(room, now);
    io.to(room.id).emit("chaos:started", chaos);
  }

  updateChaos(room, now);

  if (!room.game.paused) {
    applyMovement(room, dtSec, now);
    applyPlayerCollisions(room);
    applySafeZone(room, dtSec, now, io);
    maybeProgressRounds(room, now, io);
    maybeEndGame(room, now, io);
  } else {
    maybeEndGame(room, now, io);
  }

  io.to(room.id).volatile.emit("state:update", buildStatePacket(room));
}

function updatePlayerInput(room, socketId, payload) {
  const p = room.players.get(socketId);
  if (!p || !p.alive) return;
  p.input = {
    up: !!payload.up,
    down: !!payload.down,
    left: !!payload.left,
    right: !!payload.right
  };
}

function triggerDash(room, socketId, now) {
  const p = room.players.get(socketId);
  if (!p || !p.alive || room.game.paused) return { error: "Cannot dash now" };
  if (now < p.dashCooldownUntil) return { error: "Dash on cooldown" };

  let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
  let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    if (Math.hypot(p.vx, p.vy) > 0) {
      dx = p.vx;
      dy = p.vy;
    } else {
      dx = 0;
      dy = -1;
    }
  }

  const norm = Math.hypot(dx, dy);
  dx /= norm;
  dy /= norm;

  p.x += dx * 120;
  p.y += dy * 120;
  resolveMapCollision(room, p);
  p.dashCooldownUntil = now + DASH_COOLDOWN_MS;
  p.dashBoostUntil = now + 200;
  return { ok: true, cooldownUntil: p.dashCooldownUntil };
}

function attemptKill(room, killerId, targetId, now, io) {
  const killer = room.players.get(killerId);
  if (!killer || !killer.alive) return { error: "Killer not alive" };
  if (!killer.isSaboteur || room.game.saboteur.currentId !== killerId) return { error: "Only active saboteur can kill" };
  if (now < killer.killCooldownUntil) return { error: "Kill on cooldown" };

  const target = room.players.get(targetId);
  if (!target || !target.alive) return { error: "Target invalid" };
  if (target.id === killer.id) return { error: "Cannot self-kill" };

  const d = distance(killer, target);
  if (d > KILL_RANGE) return { error: "Out of range" };

  const killed = eliminatePlayer(room, target, "saboteur_kill", killer.id, now, io);
  if (!killed) return { error: "Kill failed" };

  killer.kills += 1;
  killer.killCooldownUntil = now + KILL_COOLDOWN_MS;
  return { ok: true, cooldownUntil: killer.killCooldownUntil, targetId: target.id };
}

function submitVote(room, voterId, targetId) {
  if (!room.game.voting.active) return { error: "Voting is not active" };

  const voter = room.players.get(voterId);
  if (!voter || !voter.alive) return { error: "Only alive players can vote" };
  if (voter.lastVoteCycleId === room.game.voting.cycleId) return { error: "Already voted" };

  const target = room.players.get(targetId);
  if (!target || !target.alive) return { error: "Invalid vote target" };

  room.game.voting.votes.set(voterId, targetId);
  voter.lastVoteCycleId = room.game.voting.cycleId;
  return { ok: true };
}

module.exports = {
  TICK_RATE,
  emitRoomInfo,
  buildStatePacket,
  startGame,
  tickRoom,
  updatePlayerInput,
  triggerDash,
  attemptKill,
  submitVote,
  countAlive
};