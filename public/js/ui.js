import { connectSocket, sendInput, sendDash, sendKill, submitVote, startGame } from "./socket.js";
import { setupInput, bindMobileControls, getInputPacket, consumeActions } from "./input.js";
import { Renderer } from "./renderer.js";
import { AudioEngine } from "./audio.js";

const query = new URLSearchParams(location.search);
const mode = query.get("mode") || "join";
const name = (query.get("name") || "").trim();
const roomCode = (query.get("room") || "").trim().toUpperCase();

if (!name) {
  location.href = "index.html";
}

const roomLabel = document.getElementById("roomLabel");
const roundLabel = document.getElementById("roundLabel");
const healthLabel = document.getElementById("healthLabel");
const objectiveLabel = document.getElementById("objectiveLabel");
const saboteurLabel = document.getElementById("saboteurLabel");
const startBtn = document.getElementById("startBtn");
const leaderboardList = document.getElementById("leaderboardList");
const voteOverlay = document.getElementById("voteOverlay");
const voteTargets = document.getElementById("voteTargets");
const voteTimer = document.getElementById("voteTimer");
const endOverlay = document.getElementById("endOverlay");
const winnerText = document.getElementById("winnerText");
const statsList = document.getElementById("statsList");
const toast = document.getElementById("toast");
const killBtn = document.getElementById("killBtn");
const eventFeed = document.getElementById("eventFeed");
const cinematicBanner = document.getElementById("cinematicBanner");
const introOverlay = document.getElementById("introOverlay");
const introText = document.getElementById("introText");
const flashFx = document.getElementById("flashFx");
const audioBtn = document.getElementById("audioBtn");

const renderer = new Renderer(document.getElementById("gameCanvas"));
const audio = new AudioEngine();

let myPlayerId = null;
let myRoomId = null;
let hostId = null;
let snapshot = null;
let isSaboteur = false;
let voteTicker = null;
let introBusy = false;

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 1700);
}

function pushFeed(text, kind = "info") {
  const item = document.createElement("div");
  item.className = `feed-item ${kind}`;
  item.textContent = text;
  eventFeed.prepend(item);
  while (eventFeed.children.length > 6) {
    eventFeed.removeChild(eventFeed.lastChild);
  }
  setTimeout(() => {
    if (item.parentNode === eventFeed) eventFeed.removeChild(item);
  }, 7000);
}

function showBanner(text, timeoutMs = 1800) {
  cinematicBanner.textContent = text;
  cinematicBanner.classList.remove("hidden");
  clearTimeout(showBanner._hideTimer);
  showBanner._hideTimer = setTimeout(() => cinematicBanner.classList.add("hidden"), timeoutMs);
}

function flash(kind = "damage") {
  flashFx.classList.remove("hidden", "kill", "damage");
  flashFx.classList.add(kind);
  requestAnimationFrame(() => flashFx.classList.add("active"));
  setTimeout(() => {
    flashFx.classList.remove("active", "kill", "damage");
    flashFx.classList.add("hidden");
  }, 220);
}

async function runIntroCountdown() {
  if (introBusy) return;
  introBusy = true;
  introOverlay.classList.remove("hidden");

  const steps = ["3", "2", "1", "SHADOW CYCLE"];
  for (const step of steps) {
    introText.textContent = step;
    introText.classList.remove("pulse");
    requestAnimationFrame(() => introText.classList.add("pulse"));
    audio.beep(step === "SHADOW CYCLE" ? 520 : 360, 0.12, { type: "triangle", volume: 0.12 });
    await new Promise((resolve) => setTimeout(resolve, step === "SHADOW CYCLE" ? 700 : 550));
  }

  introOverlay.classList.add("hidden");
  introBusy = false;
}

function objectiveText() {
  if (!snapshot) return "Survive";
  if (snapshot.gameState === "LOBBY") return "Wait for host";
  if (snapshot.gameState === "ROUND1") return "Find Saboteur";
  if (snapshot.gameState === "ROUND2") return "Survive the dark";
  if (snapshot.gameState === "FINAL") return "Last one standing";
  return "Cycle complete";
}

function updateTopBar() {
  if (!snapshot) return;
  const me = snapshot.players.find((p) => p.id === myPlayerId);
  if (me) healthLabel.textContent = `HP: ${me.h}`;
  roundLabel.textContent = `Round: ${snapshot.gameState}`;
  roomLabel.textContent = `Room: ${myRoomId || "--"}`;
  objectiveLabel.textContent = `Objective: ${objectiveText()}`;
}

function updateLeaderboard() {
  if (!snapshot) return;
  const players = [...snapshot.players].sort((a, b) => {
    if (b.a !== a.a) return Number(b.a) - Number(a.a);
    if (b.k !== a.k) return b.k - a.k;
    return b.h - a.h;
  });

  leaderboardList.innerHTML = players
    .map((p) => `<div class="lb-row"><span>${p.n}${p.id === myPlayerId ? " (You)" : ""}</span><span>${p.a ? "Alive" : "Out"} | ${p.k}K</span></div>`)
    .join("");
}

function nearestKillTarget() {
  if (!snapshot) return null;
  const me = snapshot.players.find((p) => p.id === myPlayerId);
  if (!me || !me.a) return null;

  let best = null;
  let bestDist = Infinity;
  for (const p of snapshot.players) {
    if (!p.a || p.id === myPlayerId) continue;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }

  if (bestDist > 100) return null;
  return best;
}

function openVote(payload) {
  voteTargets.innerHTML = "";
  for (const p of payload.players) {
    const btn = document.createElement("button");
    btn.textContent = p.name;
    btn.addEventListener("click", () => {
      submitVote(p.id);
      pushFeed(`Vote submitted: ${p.name}`, "info");
    });
    voteTargets.appendChild(btn);
  }
  voteOverlay.classList.remove("hidden");
  pushFeed("Voting phase started", "chaos");
  showBanner("Voting Phase", 1400);

  clearInterval(voteTicker);
  voteTicker = setInterval(() => {
    const leftMs = payload.endsAt - Date.now();
    const sec = Math.max(0, Math.ceil(leftMs / 1000));
    voteTimer.textContent = `Ends in ${sec}s`;
    if (sec <= 3 && sec > 0) audio.vote();
    if (leftMs <= 0) clearInterval(voteTicker);
  }, 200);
}

function handleSnapshotFx(prev, nextSnapshot) {
  if (!prev || !myPlayerId) return;

  const mePrev = prev.players.find((p) => p.id === myPlayerId);
  const meNow = nextSnapshot.players.find((p) => p.id === myPlayerId);

  if (mePrev && meNow && meNow.h < mePrev.h) {
    renderer.triggerHit();
    audio.damage();
    flash("damage");
  }

  if (prev.gameState !== nextSnapshot.gameState) {
    audio.round(nextSnapshot.gameState);
    pushFeed(`Round shifted: ${nextSnapshot.gameState}`, "chaos");
    showBanner(nextSnapshot.gameState === "FINAL" ? "Final Collapse" : nextSnapshot.gameState);
  }

  const prevChaos = prev.chaos ? prev.chaos.type : null;
  const nextChaos = nextSnapshot.chaos ? nextSnapshot.chaos.type : null;
  if (nextChaos && nextChaos !== prevChaos) {
    renderer.triggerChaos(nextChaos);
    audio.chaos(nextChaos);
    pushFeed(`Chaos Event: ${nextChaos.replaceAll("_", " ")}`, "chaos");
    showBanner(nextChaos.replaceAll("_", " "), 1300);
  }
}

setupInput();
bindMobileControls({
  baseEl: document.getElementById("joystickBase"),
  knobEl: document.getElementById("joystickKnob"),
  dashBtn: document.getElementById("dashBtn"),
  killBtn
});

document.addEventListener("pointerdown", () => audio.unlock(), { once: true });
document.addEventListener("keydown", () => audio.unlock(), { once: true });
audioBtn.addEventListener("click", () => {
  audio.unlock();
  const enabled = audio.toggleEnabled();
  audioBtn.textContent = `Audio: ${enabled ? "ON" : "OFF"}`;
});

connectSocket({
  mode,
  name,
  roomId: roomCode,
  onJoined: (payload) => {
    myPlayerId = payload.playerId;
    myRoomId = payload.roomId;
    hostId = payload.hostId;
    snapshot = payload.snapshot;
    startBtn.classList.toggle("hidden", hostId !== myPlayerId || snapshot.gameState !== "LOBBY");
    updateTopBar();
    updateLeaderboard();
    renderer.update(snapshot, myPlayerId, isSaboteur);
    pushFeed(`Docked at room ${myRoomId}`, "info");
  },
  onRoom: (payload) => {
    hostId = payload.hostId;
    if (payload.roomId) myRoomId = payload.roomId;
    startBtn.classList.toggle("hidden", hostId !== myPlayerId || payload.gameState !== "LOBBY");
    updateTopBar();
  },
  onState: (payload) => {
    const previous = snapshot;
    snapshot = payload;
    handleSnapshotFx(previous, snapshot);
    updateTopBar();
    updateLeaderboard();
    renderer.update(snapshot, myPlayerId, isSaboteur);
  },
  onRole: (payload) => {
    isSaboteur = !!payload.isSaboteur;
    saboteurLabel.classList.toggle("hidden", !isSaboteur);
    killBtn.classList.toggle("hidden", !isSaboteur);
    if (payload.message) {
      showToast(payload.message);
      showBanner("You Are The Saboteur", 2200);
      pushFeed("Saboteur protocol enabled", "danger");
      audio.saboteur();
    }
  },
  onVoteStarted: (payload) => openVote(payload),
  onVoteResult: () => {
    voteOverlay.classList.add("hidden");
    clearInterval(voteTicker);
  },
  onGameStarted: async () => {
    pushFeed("Launch sequence started", "chaos");
    showBanner("Launch Sequence", 1200);
    await runIntroCountdown();
    showBanner("Hunt Begins", 1200);
  },
  onGameReset: () => {
    endOverlay.classList.add("hidden");
    pushFeed("Cycle reset to lobby", "info");
    showBanner("Return To Lobby", 1200);
  },
  onChaosStarted: (payload) => {
    renderer.triggerChaos(payload.type);
    audio.chaos(payload.type);
  },
  onRoundUpdate: (payload) => {
    pushFeed(`Round update: ${payload.state}`, "chaos");
    audio.round(payload.state);
  },
  onEnded: (payload) => {
    const won = payload.winnerId === myPlayerId;
    winnerText.textContent = `Winner: ${payload.winnerName}`;
    statsList.innerHTML = payload.stats
      .sort((a, b) => b.kills - a.kills)
      .map((s) => `<div class="lb-row"><span>${s.name}</span><span>${s.kills}K | ${s.survivalTimeSec}s</span></div>`)
      .join("");
    endOverlay.classList.remove("hidden");
    showBanner(won ? "Victory" : "Eliminated", 2600);
    pushFeed(won ? "You won the Shadow Cycle" : `${payload.winnerName} won the cycle`, won ? "info" : "danger");
    if (won) audio.victory();
    else audio.defeat();
  },
  onEliminated: (payload) => {
    if (payload.playerId === myPlayerId) {
      showToast("You were eliminated");
      showBanner("System Breach", 1600);
      audio.defeat();
      flash("kill");
    }
    const reason = payload.reason ? payload.reason.replaceAll("_", " ") : "unknown";
    pushFeed(`${payload.playerName} eliminated (${reason})`, "danger");
    renderer.triggerHit();
  },
  onError: (message) => showToast(message)
});

startBtn.addEventListener("click", () => {
  startGame();
  pushFeed("Host started the game", "info");
  showBanner("Cycle Started", 1300);
});

setInterval(() => {
  sendInput(getInputPacket());
  const actions = consumeActions();
  if (actions.dash) {
    sendDash();
    audio.dash();
  }
  if (actions.kill && isSaboteur) {
    const target = nearestKillTarget();
    if (target) {
      sendKill(target.id);
      audio.kill();
    } else {
      showToast("No target in range");
    }
  }
}, 80);

function frame() {
  renderer.draw();
  requestAnimationFrame(frame);
}
frame();