function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clearSaboteur(room, io) {
  const currentId = room.game.saboteur.currentId;
  if (!currentId) return;

  const current = room.players.get(currentId);
  if (current) {
    current.isSaboteur = false;
    current.killCooldownUntil = 0;
    if (io) io.to(current.id).emit("role:update", { isSaboteur: false });
  }
  room.game.saboteur.currentId = null;
}

function rotateSaboteur(room, now, io) {
  const alive = [...room.players.values()].filter((p) => p.alive);
  if (alive.length <= 1) {
    clearSaboteur(room, io);
    return null;
  }

  const currentId = room.game.saboteur.currentId;
  const recent = new Set(room.game.saboteur.lastTwo);

  let candidates = alive.filter((p) => p.id !== currentId && !recent.has(p.id));
  if (candidates.length === 0) {
    candidates = alive.filter((p) => p.id !== currentId);
  }
  if (candidates.length === 0) {
    candidates = alive;
  }

  clearSaboteur(room, io);

  const next = randomFrom(candidates);
  next.isSaboteur = true;
  next.killCooldownUntil = 0;
  room.game.saboteur.currentId = next.id;

  room.game.saboteur.lastTwo.push(next.id);
  room.game.saboteur.lastTwo = room.game.saboteur.lastTwo.slice(-2);
  room.game.saboteur.nextRotateAt = now + 60000;

  if (io) io.to(next.id).emit("role:update", { isSaboteur: true, message: "You are the Saboteur" });
  return next;
}

module.exports = {
  rotateSaboteur,
  clearSaboteur
};