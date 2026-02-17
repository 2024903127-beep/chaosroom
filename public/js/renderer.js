import { SHIP_MAP } from "./mapData.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.snapshot = null;
    this.playerId = null;
    this.isSaboteur = false;
    this.positions = new Map();
    this.prevAlive = new Map();
    this.particles = [];
    this.stars = Array.from({ length: 120 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.2 + Math.random() * 0.8
    }));
    this.cameraShake = 0;
    this.cameraShakeDecay = 0;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(snapshot, playerId, isSaboteur) {
    this.snapshot = snapshot;
    this.playerId = playerId;
    this.isSaboteur = isSaboteur;

    for (const p of snapshot.players) {
      const wasAlive = this.prevAlive.get(p.id);
      if (wasAlive === true && !p.a) {
        this.spawnBurst(p.x, p.y, "elimination");
      }
      this.prevAlive.set(p.id, p.a);
    }
  }

  triggerChaos(type) {
    this.cameraShake = Math.max(this.cameraShake, 6);
    this.cameraShakeDecay = 0.35;
    if (type === "fast_shrink_pulse") this.cameraShake = Math.max(this.cameraShake, 10);
  }

  triggerHit() {
    this.cameraShake = Math.max(this.cameraShake, 8);
    this.cameraShakeDecay = 0.42;
  }

  spawnBurst(x, y, kind) {
    const color = kind === "elimination" ? "255,80,112" : "78,216,255";
    const count = kind === "elimination" ? 30 : 18;
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 240;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.45,
        maxLife: 0.25 + Math.random() * 0.45,
        c: color,
        r: 1 + Math.random() * 3
      });
    }
  }

  stepParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  drawParticles(camX, camY) {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = `rgba(${p.c},${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y - camY, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawShipMap(camX, camY) {
    const ctx = this.ctx;

    ctx.fillStyle = "#1d253f";
    ctx.fillRect(-camX, -camY, SHIP_MAP.width, SHIP_MAP.height);

    for (const strip of SHIP_MAP.strips) {
      ctx.fillStyle = "rgba(132, 170, 255, 0.16)";
      ctx.fillRect(strip.x - camX, strip.y - camY, strip.w, strip.h);
      ctx.strokeStyle = "rgba(171, 204, 255, 0.24)";
      ctx.strokeRect(strip.x - camX, strip.y - camY, strip.w, strip.h);
    }

    for (const wall of SHIP_MAP.walls) {
      const gx = wall.x - camX;
      const gy = wall.y - camY;

      const roomGrad = ctx.createLinearGradient(gx, gy, gx + wall.w, gy + wall.h);
      roomGrad.addColorStop(0, "#2d3558");
      roomGrad.addColorStop(1, "#202845");
      ctx.fillStyle = roomGrad;
      ctx.fillRect(gx, gy, wall.w, wall.h);

      ctx.strokeStyle = "rgba(179, 204, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(gx, gy, wall.w, wall.h);

      ctx.fillStyle = "rgba(220, 231, 255, 0.22)";
      ctx.font = "11px Space Grotesk";
      ctx.textAlign = "left";
      ctx.fillText(wall.label || "", gx + 10, gy + 18);
    }

    for (const vent of SHIP_MAP.vents) {
      const x = vent.x - camX;
      const y = vent.y - camY;
      ctx.fillStyle = "#2f3a62";
      ctx.beginPath();
      ctx.arc(x, y, vent.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(133, 177, 255, 0.6)";
      ctx.beginPath();
      ctx.arc(x, y, vent.r - 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(112, 150, 214, 0.35)";
    ctx.lineWidth = 8;
    ctx.strokeRect(-camX, -camY, SHIP_MAP.width, SHIP_MAP.height);
  }

  drawMinimap() {
    const ctx = this.ctx;
    const x = 20;
    const y = window.innerHeight - 140;
    const w = 130;
    const h = 110;

    ctx.fillStyle = "rgba(7, 12, 24, 0.75)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(120, 170, 255, 0.45)";
    ctx.strokeRect(x, y, w, h);

    for (const wall of SHIP_MAP.walls) {
      ctx.fillStyle = "rgba(96, 124, 184, 0.45)";
      ctx.fillRect(
        x + (wall.x / SHIP_MAP.width) * w,
        y + (wall.y / SHIP_MAP.height) * h,
        (wall.w / SHIP_MAP.width) * w,
        (wall.h / SHIP_MAP.height) * h
      );
    }

    for (const p of this.snapshot.players) {
      const px = x + (p.x / SHIP_MAP.width) * w;
      const py = y + (p.y / SHIP_MAP.height) * h;
      if (!p.a) continue;
      if (p.id === this.playerId) {
        ctx.fillStyle = "rgba(80,255,213,0.95)";
        ctx.fillRect(px - 2, py - 2, 5, 5);
      } else {
        ctx.fillStyle = "rgba(150,165,255,0.75)";
        ctx.fillRect(px - 1, py - 1, 3, 3);
      }
    }

    const zone = this.snapshot.zone;
    const zx = x + (zone.x / SHIP_MAP.width) * w;
    const zy = y + (zone.y / SHIP_MAP.height) * h;
    const zr = (zone.r / SHIP_MAP.width) * w;
    ctx.strokeStyle = "rgba(95, 224, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(zx, zy, zr, 0, Math.PI * 2);
    ctx.stroke();
  }

  draw() {
    if (!this.snapshot) return;

    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const me = this.snapshot.players.find((p) => p.id === this.playerId);
    if (!me) return;

    const dt = 1 / 60;
    this.stepParticles(dt);

    let camX = me.x - w / 2;
    let camY = me.y - h / 2;

    if (this.cameraShake > 0) {
      const jitter = this.cameraShake;
      camX += (Math.random() - 0.5) * jitter;
      camY += (Math.random() - 0.5) * jitter;
      this.cameraShake *= 1 - this.cameraShakeDecay;
      if (this.cameraShake < 0.2) this.cameraShake = 0;
    }

    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, "#060a16");
    bgGrad.addColorStop(1, "#0e1530");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    for (const s of this.stars) {
      const sx = ((s.x * w) - camX * s.z * 0.03 + w * 2) % (w * 2) - w * 0.5;
      const sy = ((s.y * h) - camY * s.z * 0.03 + h * 2) % (h * 2) - h * 0.5;
      ctx.fillStyle = `rgba(170,200,255,${0.15 + s.z * 0.35})`;
      ctx.fillRect(sx, sy, 1 + s.z * 1.3, 1 + s.z * 1.3);
    }

    this.drawShipMap(camX, camY);

    const zone = this.snapshot.zone;
    const zonePulse = 1 + 0.03 * Math.sin(Date.now() * 0.006);
    ctx.beginPath();
    ctx.arc(zone.x - camX, zone.y - camY, zone.r * zonePulse, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120, 238, 255, 0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(zone.x - camX, zone.y - camY, zone.r * 0.995, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(105, 180, 255, 0.25)";
    ctx.lineWidth = 14;
    ctx.stroke();

    for (const p of this.snapshot.players) {
      const prev = this.positions.get(p.id) || { x: p.x, y: p.y };
      const x = lerp(prev.x, p.x, 0.34);
      const y = lerp(prev.y, p.y, 0.34);
      this.positions.set(p.id, { x, y });

      const sx = x - camX;
      const sy = y - camY;

      const trailCount = p.a ? 3 : 0;
      for (let i = trailCount; i >= 1; i -= 1) {
        const ox = sx - p.vx * 0.008 * i;
        const oy = sy - p.vy * 0.008 * i;
        const a = 0.08 * i;
        ctx.fillStyle = `rgba(130,170,255,${a})`;
        ctx.beginPath();
        ctx.arc(ox, oy, 12 - i * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!p.a) {
        ctx.fillStyle = "rgba(110, 120, 145, 0.45)";
      } else if (p.id === this.playerId && this.isSaboteur) {
        ctx.fillStyle = "rgba(255, 88, 110, 0.95)";
      } else if (p.id === this.playerId) {
        ctx.fillStyle = "rgba(90, 230, 255, 0.95)";
      } else {
        ctx.fillStyle = "rgba(98, 124, 255, 0.95)";
      }

      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(sx, sy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#dce6ff";
      ctx.font = "12px Space Grotesk";
      ctx.textAlign = "center";
      ctx.fillText(`${p.n} (${p.h})`, sx, sy - 20);
    }

    this.drawParticles(camX, camY);

    const isLimited =
      this.snapshot.gameState === "ROUND2" ||
      this.snapshot.gameState === "FINAL" ||
      (this.snapshot.chaos && this.snapshot.chaos.type === "darkness_pulse");

    if (isLimited) {
      let visionRadius = this.snapshot.gameState === "FINAL" ? 120 : 190;
      if (this.snapshot.chaos && this.snapshot.chaos.type === "darkness_pulse") visionRadius -= 45;
      visionRadius = clamp(visionRadius, 80, 260);

      const grad = ctx.createRadialGradient(w / 2, h / 2, visionRadius * 0.6, w / 2, h / 2, visionRadius * 1.35);
      grad.addColorStop(0, "rgba(2, 5, 10, 0)");
      grad.addColorStop(1, "rgba(2, 5, 10, 0.95)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.8);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    this.drawMinimap();
  }
}