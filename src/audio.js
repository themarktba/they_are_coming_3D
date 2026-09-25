// All sound is synthesized at runtime: no asset files.
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let muted = false;
const lastPlayed = {};

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.7; }
export function isMuted() { return muted; }

function throttle(key, ms) {
  const now = performance.now();
  if (lastPlayed[key] && now - lastPlayed[key] < ms) return false;
  lastPlayed[key] = now; return true;
}

function noise(t, dur, { type = 'lowpass', freq = 1000, freqEnd, q = 1, vol = 0.5, attack = 0.002, dest = sfxBus } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

function tone(t, dur, { type = 'sine', freq = 440, freqEnd, vol = 0.3, attack = 0.005, dest = sfxBus, detune = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

const GUNS = {
  pistol:   (t) => { noise(t, 0.12, { freq: 2600, freqEnd: 400, vol: 0.55 }); tone(t, 0.08, { type: 'square', freq: 180, freqEnd: 60, vol: 0.25 }); },
  revolver: (t) => { noise(t, 0.3, { freq: 2000, freqEnd: 200, vol: 0.8 }); tone(t, 0.18, { type: 'square', freq: 120, freqEnd: 40, vol: 0.4 }); },
  shotgun:  (t) => { noise(t, 0.45, { freq: 1800, freqEnd: 120, vol: 1 }); tone(t, 0.25, { type: 'sawtooth', freq: 90, freqEnd: 30, vol: 0.5 }); },
  rifle:    (t) => { noise(t, 0.4, { freq: 3500, freqEnd: 250, vol: 0.9 }); tone(t, 0.2, { type: 'square', freq: 150, freqEnd: 40, vol: 0.4 }); },
  ar:       (t) => { noise(t, 0.14, { freq: 3000, freqEnd: 500, vol: 0.5 }); tone(t, 0.07, { type: 'square', freq: 160, freqEnd: 70, vol: 0.22 }); },
  sniper:   (t) => { noise(t, 0.8, { freq: 4000, freqEnd: 150, vol: 1 }); tone(t, 0.35, { type: 'sawtooth', freq: 110, freqEnd: 30, vol: 0.55 }); },
  mg:       (t) => { noise(t, 0.13, { freq: 2400, freqEnd: 350, vol: 0.5 }); tone(t, 0.07, { type: 'square', freq: 120, freqEnd: 60, vol: 0.25 }); },
  minigun:  (t) => { noise(t, 0.07, { freq: 3200, freqEnd: 800, vol: 0.35 }); tone(t, 0.05, { type: 'square', freq: 200, freqEnd: 100, vol: 0.15 }); },
  turret:   (t) => { noise(t, 0.08, { freq: 3500, freqEnd: 900, vol: 0.22 }); },
  tower:    (t) => { noise(t, 0.5, { freq: 3000, freqEnd: 200, vol: 0.45 }); },
};

export function sfx(name, opts = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const vol = opts.vol ?? 1;
  if (GUNS[name]) {
    if (!throttle(name, name === 'minigun' ? 35 : 25)) return;
    GUNS[name](t); return;
  }
  switch (name) {
    case 'empty': tone(t, 0.04, { type: 'square', freq: 900, vol: 0.12 }); break;
    case 'reload':
      noise(t, 0.05, { type: 'bandpass', freq: 2500, q: 5, vol: 0.4 });
      noise(t + 0.25, 0.06, { type: 'bandpass', freq: 1800, q: 5, vol: 0.5 });
      break;
    case 'reloadDone': noise(t, 0.06, { type: 'bandpass', freq: 3200, q: 6, vol: 0.5 }); break;
    case 'swing': noise(t, 0.18, { type: 'bandpass', freq: 900, freqEnd: 2500, q: 2, vol: 0.35 }); break;
    case 'chainsaw': if (!throttle('chainsaw', 70)) return; tone(t, 0.09, { type: 'sawtooth', freq: 95 + Math.random() * 15, vol: 0.2 }); noise(t, 0.09, { freq: 1500, vol: 0.15 }); break;
    case 'saber': if (!throttle('saber', 90)) return; tone(t, 0.25, { type: 'sawtooth', freq: 140, freqEnd: 90, vol: 0.18 }); tone(t, 0.25, { type: 'sine', freq: 280, freqEnd: 180, vol: 0.2 }); break;
    case 'hit': if (!throttle('hit', 30)) return; noise(t, 0.08, { freq: 700, freqEnd: 200, vol: 0.35 * vol }); break;
    case 'splat': if (!throttle('splat', 40)) return; noise(t, 0.22, { freq: 500, freqEnd: 90, vol: 0.5 * vol, q: 3 }); break;
    case 'headshot': if (!throttle('headshot', 60)) return; noise(t, 0.12, { type: 'highpass', freq: 1800, vol: 0.35 }); tone(t, 0.1, { type: 'square', freq: 1400, freqEnd: 700, vol: 0.12 }); break;
    case 'helmet': tone(t, 0.3, { type: 'triangle', freq: 1800, freqEnd: 1600, vol: 0.2 }); tone(t, 0.3, { type: 'triangle', freq: 2650, vol: 0.12 }); break;
    case 'kick': noise(t, 0.12, { freq: 400, freqEnd: 80, vol: 0.8 }); tone(t, 0.1, { freq: 110, freqEnd: 50, vol: 0.5 }); break;
    case 'explosion':
      if (!throttle('explosion', 60)) return;
      noise(t, 1.4, { freq: 1200, freqEnd: 40, vol: 1.2 * vol, attack: 0.005 });
      tone(t, 0.8, { type: 'sine', freq: 70, freqEnd: 25, vol: 0.9 * vol });
      break;
    case 'groan': {
      if (!throttle('groan', 250)) return;
      const f = 70 + Math.random() * 60;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.7, t + 0.9);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 6 + Math.random() * 5; const lg = ctx.createGain(); lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
      const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 500 + Math.random() * 300; fl.Q.value = 4;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      o.connect(fl); fl.connect(g); g.connect(sfxBus); o.start(t); lfo.start(t); o.stop(t + 1.05); lfo.stop(t + 1.05);
      break;
    }
    case 'bossRoar':
      tone(t, 2.2, { type: 'sawtooth', freq: 60, freqEnd: 35, vol: 0.6, attack: 0.2 });
      tone(t, 2.2, { type: 'sawtooth', freq: 63, freqEnd: 33, vol: 0.5, attack: 0.2, detune: 30 });
      noise(t, 2.2, { freq: 600, freqEnd: 150, vol: 0.5, attack: 0.3 });
      break;
    case 'bite': if (!throttle('bite', 120)) return; noise(t, 0.15, { type: 'bandpass', freq: 700, q: 2, vol: 0.5 }); break;
    case 'hurt': if (!throttle('hurt', 200)) return; tone(t, 0.2, { type: 'square', freq: 220, freqEnd: 110, vol: 0.2 }); noise(t, 0.15, { freq: 800, vol: 0.3 }); break;
    case 'wood': if (!throttle('wood', 90)) return; noise(t, 0.12, { type: 'bandpass', freq: 400, q: 3, vol: 0.45 }); break;
    case 'metal': if (!throttle('metal', 90)) return; tone(t, 0.15, { type: 'triangle', freq: 900 + Math.random() * 300, vol: 0.12 }); noise(t, 0.08, { type: 'highpass', freq: 3000, vol: 0.2 }); break;
    case 'break': noise(t, 0.6, { freq: 900, freqEnd: 80, vol: 0.8 }); break;
    case 'place': tone(t, 0.08, { type: 'square', freq: 300, vol: 0.15 }); noise(t, 0.1, { freq: 500, vol: 0.4 }); break;
    case 'buy': tone(t, 0.08, { type: 'square', freq: 880, vol: 0.12 }); tone(t + 0.08, 0.14, { type: 'square', freq: 1320, vol: 0.12 }); break;
    case 'deny': tone(t, 0.18, { type: 'square', freq: 160, vol: 0.15 }); break;
    case 'click': tone(t, 0.03, { type: 'square', freq: 600, vol: 0.08 }); break;
    case 'coin': if (!throttle('coin', 40)) return; tone(t, 0.06, { type: 'square', freq: 1500, vol: 0.06 }); tone(t + 0.05, 0.1, { type: 'square', freq: 2000, vol: 0.06 }); break;
    case 'pin': tone(t, 0.05, { type: 'triangle', freq: 2200, vol: 0.15 }); break;
    case 'beep': tone(t, 0.06, { type: 'square', freq: 1800, vol: 0.12 }); break;
    case 'siren': {
      for (let i = 0; i < 3; i++) tone(t + i * 0.9, 0.9, { type: 'sawtooth', freq: 420, freqEnd: 780, vol: 0.12, attack: 0.1 });
      break;
    }
    case 'dayClear': [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.12, 0.35, { type: 'square', freq: f, vol: 0.12 })); break;
    case 'gameOver': [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.3, 0.6, { type: 'sawtooth', freq: f, vol: 0.14 })); break;
    case 'step': if (!throttle('step', 250)) return; noise(t, 0.05, { freq: 300, vol: 0.12 }); break;
  }
}

// --- music: a small step sequencer. calm (build phase) and combat (wave) moods.
let musicTimer = null, step = 0, mood = 'off', nextTime = 0;
const BPM = { calm: 84, combat: 132, boss: 150 };
const SCALE = [0, 3, 5, 7, 10];

export function setMusic(m) {
  if (!ctx) return;
  mood = m;
  if (m === 'off') { clearInterval(musicTimer); musicTimer = null; return; }
  if (!musicTimer) { nextTime = ctx.currentTime + 0.1; step = 0; musicTimer = setInterval(schedule, 50); }
}

function schedule() {
  if (mood === 'off' || muted) { if (ctx) nextTime = ctx.currentTime + 0.1; return; }
  const spb = 60 / BPM[mood] / 4;
  while (nextTime < ctx.currentTime + 0.2) {
    playStep(step, nextTime, spb);
    nextTime += spb; step = (step + 1) % 64;
  }
}

function playStep(s, t, spb) {
  const root = 41.2; // E1
  const bar = Math.floor(s / 16);
  const prog = [0, 0, 3, 5][bar];
  const n = (st) => root * Math.pow(2, st / 12);
  if (mood === 'calm') {
    if (s % 16 === 0) {
      [0, 7, 15].forEach((st, i) => tone(t, spb * 15, { type: 'triangle', freq: n(prog + st + 12), vol: 0.07 - i * 0.015, attack: 0.4, dest: musicBus }));
    }
    if (s % 4 === 2 && Math.random() < 0.5) {
      const st = SCALE[Math.floor(Math.random() * SCALE.length)] + 36 + prog;
      tone(t, spb * 3, { type: 'sine', freq: n(st), vol: 0.05, dest: musicBus });
    }
    return;
  }
  // combat / boss
  const s16 = s % 16;
  if (s16 === 0 || s16 === 8 || (mood === 'boss' && s16 === 10) || s16 === 11) {
    tone(t, 0.25, { type: 'sine', freq: 110, freqEnd: 35, vol: 0.6, dest: musicBus });
  }
  if (s16 === 4 || s16 === 12) noise(t, 0.18, { type: 'bandpass', freq: 1800, q: 0.8, vol: 0.35, dest: musicBus });
  if (s % 2 === 0) noise(t, 0.04, { type: 'highpass', freq: 7000, vol: 0.08, dest: musicBus });
  const bassPat = [0, 0, 12, 0, 0, 10, 0, 7, 0, 0, 12, 0, 3, 0, 5, 7];
  tone(t, spb * 0.9, { type: 'sawtooth', freq: n(prog + bassPat[s16]), vol: 0.1, dest: musicBus });
  if (mood === 'boss' && s16 % 4 === 0) tone(t, spb * 3, { type: 'square', freq: n(prog + 24 + (s16 === 8 ? 1 : 0)), vol: 0.04, dest: musicBus });
}
