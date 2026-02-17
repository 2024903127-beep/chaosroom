let socket;

export function connectSocket({ mode, name, roomId, onJoined, onRoom, onState, onRole, onVoteStarted, onVoteResult, onEnded, onError, onEliminated, onChaosStarted, onRoundUpdate, onGameStarted, onGameReset }) {
  socket = io({ transports: ["websocket", "polling"] });

  socket.on("connect", () => {
    if (mode === "create") {
      socket.emit("room:create", { name });
    } else {
      socket.emit("room:join", { roomId, name });
    }
  });

  socket.on("room:joined", (payload) => onJoined && onJoined(payload));
  socket.on("room:update", (payload) => onRoom && onRoom(payload));
  socket.on("state:update", (payload) => onState && onState(payload));
  socket.on("role:update", (payload) => onRole && onRole(payload));
  socket.on("vote:started", (payload) => onVoteStarted && onVoteStarted(payload));
  socket.on("vote:result", (payload) => onVoteResult && onVoteResult(payload));
  socket.on("game:started", (payload) => onGameStarted && onGameStarted(payload));
  socket.on("game:reset", (payload) => onGameReset && onGameReset(payload));
  socket.on("game:ended", (payload) => onEnded && onEnded(payload));
  socket.on("player:eliminated", (payload) => onEliminated && onEliminated(payload));
  socket.on("chaos:started", (payload) => onChaosStarted && onChaosStarted(payload));
  socket.on("round:update", (payload) => onRoundUpdate && onRoundUpdate(payload));
  socket.on("error:message", (payload) => onError && onError(payload.message));

  return socket;
}

export function sendInput(packet) {
  if (!socket) return;
  socket.emit("input:update", packet);
}

export function sendDash() {
  if (!socket) return;
  socket.emit("action:dash");
}

export function sendKill(targetId) {
  if (!socket) return;
  socket.emit("action:kill", { targetId });
}

export function submitVote(targetId) {
  if (!socket) return;
  socket.emit("vote:submit", { targetId });
}

export function startGame() {
  if (!socket) return;
  socket.emit("game:start");
}