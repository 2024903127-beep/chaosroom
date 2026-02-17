const CHAOS_EVENTS = [
  { type: "reverse_controls", durationMs: 10000 },
  { type: "speed_boost", durationMs: 10000 },
  { type: "darkness_pulse", durationMs: 8000 },
  { type: "slippery_movement", durationMs: 10000 },
  { type: "fast_shrink_pulse", durationMs: 5000 }
];

function roundChaosIntervalMs(state) {
  if (state === "ROUND1") return 20000;
  if (state === "ROUND2") return 15000;
  if (state === "FINAL") return 10000;
  return 20000;
}

function pickEvent(lastType) {
  const options = CHAOS_EVENTS.filter((e) => e.type !== lastType);
  return options[Math.floor(Math.random() * options.length)];
}

function triggerChaos(room, now) {
  const event = pickEvent(room.game.chaos.lastType);
  room.game.chaos.active = {
    type: event.type,
    startedAt: now,
    endsAt: now + event.durationMs
  };
  room.game.chaos.lastType = event.type;
  room.game.chaos.nextAt = now + roundChaosIntervalMs(room.game.state);

  if (event.type === "fast_shrink_pulse") {
    room.game.zone.radius = Math.max(room.game.zone.minRadius, room.game.zone.radius * 0.95);
    room.game.zone.lastShrinkAt = now;
  }

  return room.game.chaos.active;
}

function updateChaos(room, now) {
  if (room.game.chaos.active && now >= room.game.chaos.active.endsAt) {
    room.game.chaos.active = null;
  }
}

function isChaosActive(room, type) {
  return room.game.chaos.active && room.game.chaos.active.type === type;
}

function speedMultiplier(room) {
  return isChaosActive(room, "speed_boost") ? 1.25 : 1;
}

function finalShrinkMultiplier(room) {
  return isChaosActive(room, "fast_shrink_pulse") ? 1.75 : 1;
}

module.exports = {
  triggerChaos,
  updateChaos,
  isChaosActive,
  speedMultiplier,
  finalShrinkMultiplier,
  roundChaosIntervalMs
};