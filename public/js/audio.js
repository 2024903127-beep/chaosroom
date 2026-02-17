export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.fxGain = null;
    this.enabled = true;
    this.ambience = null;
  }

  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.musicGain = this.ctx.createGain();
      this.fxGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.2;
      this.fxGain.gain.value = 0.8;
      this.musicGain.connect(this.master);
      this.fxGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.startAmbience();
    } else if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggleEnabled() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0;
    return this.enabled;
  }

  startAmbience() {
    if (!this.ctx || this.ambience) return;

    const osc = this.ctx.createOscillator();
    const wobble = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const lfoGain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.value = 43;

    wobble.type = "sine";
    wobble.frequency.value = 0.11;

    filter.type = "lowpass";
    filter.frequency.value = 280;
    lfoGain.gain.value = 120;

    wobble.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    osc.connect(filter);
    filter.connect(this.musicGain);

    osc.start();
    wobble.start();

    this.ambience = { osc, wobble, filter };
  }

  beep(freq, durationSec, { type = "sine", volume = 0.14, slideTo = null } = {}) {
    if (!this.ctx || !this.enabled) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + durationSec);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.fxGain);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  dash() {
    this.beep(380, 0.12, { type: "square", volume: 0.1, slideTo: 120 });
  }

  kill() {
    this.beep(170, 0.14, { type: "sawtooth", volume: 0.18, slideTo: 80 });
    this.beep(80, 0.18, { type: "triangle", volume: 0.12 });
  }

  damage() {
    this.beep(260, 0.08, { type: "square", volume: 0.08, slideTo: 220 });
  }

  vote() {
    this.beep(620, 0.07, { type: "triangle", volume: 0.09 });
  }

  chaos(type) {
    const map = {
      reverse_controls: [260, 130],
      speed_boost: [440, 620],
      darkness_pulse: [220, 90],
      slippery_movement: [190, 140],
      fast_shrink_pulse: [520, 170]
    };
    const [f1, f2] = map[type] || [320, 150];
    this.beep(f1, 0.12, { type: "sawtooth", volume: 0.12, slideTo: f2 });
    this.beep(f2, 0.2, { type: "triangle", volume: 0.08 });
  }

  round(state) {
    const f = state === "ROUND2" ? 330 : state === "FINAL" ? 660 : 280;
    this.beep(f, 0.15, { type: "triangle", volume: 0.14, slideTo: f * 1.5 });
  }

  saboteur() {
    this.beep(140, 0.22, { type: "sawtooth", volume: 0.2, slideTo: 70 });
  }

  victory() {
    this.beep(392, 0.18, { type: "triangle", volume: 0.16 });
    setTimeout(() => this.beep(523, 0.18, { type: "triangle", volume: 0.16 }), 120);
    setTimeout(() => this.beep(659, 0.24, { type: "triangle", volume: 0.18 }), 260);
  }

  defeat() {
    this.beep(240, 0.2, { type: "sawtooth", volume: 0.16, slideTo: 150 });
    setTimeout(() => this.beep(160, 0.28, { type: "triangle", volume: 0.15 }), 180);
  }
}