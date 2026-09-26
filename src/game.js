import * as THREE from 'three';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { ZombieManager } from './zombies.js';
import { StructureManager } from './structures.js';
import { Hud } from './ui.js';
import { initAudio, sfx, setMusic, setMuted } from './audio.js';
import { DIFFICULTIES, WEAPONS, ZOMBIES, STRUCTURES, ARMOR, GRENADE, WORLD, ORPHANAGE_HP, zombieUnlocked } from './config.js';

const SAVE_KEY = 'theyarecoming3d.v1';
const _v = new THREE.Vector3();

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.world = new World(this.canvas);
    this.effects = new Effects(this.world.scene, this.world.camera);
    this.input = new Input(this.canvas);
    this.structures = new StructureManager(this);
    this.zombies = new ZombieManager(this);
    this.player = new Player(this);
    this.state = 'menu';
    this.mode = 'campaign';
    this.paused = false;
    this.shakeAmt = 0;
    this.timeScale = 1; this.hitStopT = 0; this.slowmoT = 0;
    this.dmgMul = 1; this.rateMul = 1;
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.buildCam = { x: 0, z: -14, h: 44 };
    this.save = this.loadSave();
    this.applySettings();
    this.hud = new Hud(this);
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.debugNoLock = new URLSearchParams(location.search).has('nolock');
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.enterMenu();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- persistence
  loadSave() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { s = null; }
    return Object.assign({ settings: { view: 'tps', pixel: 'pixel', gore: true, sens: 1, muted: false, showFps: false }, best: {}, run: null }, s || {});
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage unavailable */ } }

  applySettings() {
    const st = this.save.settings;
    this.world.setPixelMode(st.pixel);
    this.effects.gore = st.gore;
    this.input.sensitivity = st.sens;
    setMuted(st.muted);
    this.player.view = st.view;
  }

  snapshotRun() {
    const p = this.player;
    this.save.run = {
      diff: this.diff.id, day: this.day, money: this.money, orphanageHp: this.orphanageHp,
      owned: p.owned, armor: p.armor, grenades: p.grenades, maxHp: p.maxHp,
      stats: this.stats,
      structures: this.structures.list.map((s) => ({ id: s.id, x: s.x, z: s.z, rot: s.rot, hp: s.hp })),
    };
    this.persist();
  }

  // ---------- flow
  enterMenu() {
    this.state = 'menu';
    this.mode = 'campaign';
    this.godMode = false;
    this.paused = false;
    this.input.wantLock = false; this.input.unlock();
    this.zombies.clear(); this.structures.clear(); this.effects.clearDecals(); this.effects.clearTexts();
    this.player.rig.root.visible = false;
    this.player.viewmodel.visible = false;
    this.world.grid.visible = false;
    this.player.pos.set(0, 0, 400);
    this.world.setTime(0.52);
    this.menuT = 0;
    this.scaling = { hp: 1, speed: 1, dmg: 1 };
    for (let i = 0; i < 14; i++) this.zombies.spawn(['walker', 'walker', 'runner', 'helmet', 'bloater', 'brute'][i % 6], this.scaling, new THREE.Vector3((Math.random() - 0.5) * 30, 0, -10 - Math.random() * 50));
    this.hud.show('menu');
    setMusic('calm');
  }

  newRun(diffId) {
    initAudio();
    this.diff = DIFFICULTIES[diffId];
    this.mode = 'campaign';
    this.day = 1;
    this.money = this.diff.startMoney;
    this.orphanageHp = ORPHANAGE_HP;
    this.stats = { kills: 0, headshots: 0, earned: 0 };
    this.zombies.clear(); this.structures.clear(); this.effects.clearDecals();
    this.player.reset();
    this.save.run = null; this.persist();
    this.enterBuild();
  }

  continueRun() {
    initAudio();
    const r = this.save.run;
    if (!r || r.inWave) return;
    this.diff = DIFFICULTIES[r.diff];
    this.mode = 'campaign';
    this.day = r.day; this.money = r.money; this.orphanageHp = r.orphanageHp; this.stats = r.stats;
    this.zombies.clear(); this.structures.clear(); this.effects.clearDecals();
    this.player.reset();
    for (const id of r.owned) if (!this.player.owned.includes(id)) this.player.owned.push(id);
    for (const id of r.owned) if (WEAPONS[id].kind === 'gun') this.player.ammo[id] = WEAPONS[id].mag;
    this.player.armor = r.armor; this.player.grenades = r.grenades; this.player.maxHp = r.maxHp || 100;
    for (const s of r.structures) { const o = this.structures.place(s.id, s.x, s.z, s.rot); o.hp = s.hp; }
    this.player.equip(this.player.owned.find((id) => WEAPONS[id].slot === 2) || 'pistol', true);
    this.enterBuild(true);
  }

  startPlayground() {
    initAudio();
    this.diff = DIFFICULTIES.normal;
    this.mode = 'playground';
    this.day = 12;
    this.money = 999999;
    this.orphanageHp = ORPHANAGE_HP;
    this.stats = { kills: 0, headshots: 0, earned: 0 };
    this.zombies.clear(); this.structures.clear(); this.effects.clearDecals();
    this.player.reset();
    this.player.owned = Object.keys(WEAPONS);
    for (const id of this.player.owned) if (WEAPONS[id].kind === 'gun') this.player.ammo[id] = WEAPONS[id].mag;
    this.player.owned.sort((a, b) => (WEAPONS[a].slot - WEAPONS[b].slot) || (WEAPONS[a].price - WEAPONS[b].price));
    this.player.grenades = 99;
    this.player.armor = 2;
    this.player.equip('ar', true);
    this.godMode = false;
    this.scaling = this.computeScaling();
    this.enterBuild();
  }

  computeScaling() {
    const d = this.day, df = this.diff;
    return {
      hp: df.zHp * (1 + (d - 1) * 0.1),
      speed: df.zSpeed * Math.min(1.4, 1 + (d - 1) * 0.018),
      dmg: df.zDmg * (1 + (d - 1) * 0.05),
    };
  }

  enterBuild(fromLoad = false) {
    this.state = 'build';
    this.paused = false;
    this.waveActive = false;
    this.boss = null;
    this.input.wantLock = false; this.input.unlock();
    this.zombies.clear();
    this.effects.clearTexts();
    this.player.spawn();
    this.player.rig.root.visible = true;
    this.world.setTime(this.diff.night ? 1 : 0.18);
    this.blendCamera(1.4);
    this.buildCam = { x: 0, z: -12, h: 30 };
    this.world.grid.visible = true;
    this.selected = null;
    this.hud.show('build');
    this.hud.refreshShop();
    setMusic('calm');
    if (this.mode === 'campaign' && !fromLoad) this.snapshotRun();
    if (this.mode === 'campaign') this.hud.banner(`DAY ${this.day}`, 'Prepare your defenses', 2.2);
  }

  startDay() {
    if (this.state !== 'build') return;
    initAudio();
    this.cancelPlacing();
    this.state = 'wave';
    this.world.grid.visible = false;
    this.selected = null; this.hud.selectStructure(null);
    this.scaling = this.computeScaling();
    this.wavesTotal = this.mode === 'playground' ? 0 : Math.min(6, 1 + Math.floor(this.day / 2));
    this.wave = 0;
    this.dayKills = 0; this.dayHeadshots = 0; this.dayEarn = 0;
    this.spawnQueue = [];
    this.waveBreak = 1.5;
    this.waveActive = true;
    this.boss = null;
    this.blendCamera(1.1);
    this.player.spawn();
    this.hud.show('wave');
    this.input.wantLock = true;
    this.input.lock();
    this.world.setTime(this.diff.night ? 1 : 0.42);
    if (this.mode === 'campaign' && this.save.run) { this.save.run.inWave = true; this.persist(); }
    if (this.mode === 'campaign') { this.hud.banner('THEY ARE COMING!', `Day ${this.day}`, 2.6, 'red'); sfx('siren'); }
    setMusic('combat');
  }

  buildWave(n) {
    const day = this.day;
    const count = Math.round((4 + day * 2.1 + n * 1.5) * this.diff.zCount);
    const weights = { walker: 1, runner: 0.4, helmet: 0.32, crawler: 0.22, riser: 0.28, bloater: 0.16, brute: 0.07 + Math.min(0.12, day * 0.006) };
    const pool = Object.entries(weights).filter(([t]) => zombieUnlocked(t, day));
    const total = pool.reduce((a, [, w]) => a + w, 0);
    const q = [];
    for (let i = 0; i < count; i++) {
      let r = Math.random() * total;
      for (const [t, w] of pool) { r -= w; if (r <= 0) { q.push(t); break; } }
    }
    // rush groups of runners make later waves spicy
    if (day >= 4 && n >= 2) for (let i = 0; i < 3 + day / 3; i++) q.splice(Math.floor(q.length * 0.6), 0, 'runner');
    if (day % 5 === 0 && n === this.wavesTotal) q.splice(Math.floor(q.length * 0.3), 0, 'boss');
    return q;
  }

  spawnZombie(type, pos) {
    if (!pos) {
      const side = this.day >= 7 && Math.random() < 0.2;
      pos = side
        ? new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * (WORLD.maxX - 1), 0, WORLD.minZ - Math.random() * 10)
        : new THREE.Vector3((Math.random() - 0.5) * 44, 0, WORLD.spawnZ + Math.random() * 18);
    }
    return this.zombies.spawn(type, this.scaling, pos);
  }

  updateDirector(dt) {
    if (this.mode === 'playground') return;
    if (this.waveBreak > 0) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) {
        this.wave++;
        this.spawnQueue = this.buildWave(this.wave);
        this.spawnT = 0;
        this.hud.banner(`WAVE ${this.wave} / ${this.wavesTotal}`, this.wave === this.wavesTotal ? 'Final wave' : '', 1.8);
        sfx('groan', { vol: 1 });
        const t = this.diff.night ? 1 : 0.42 + 0.58 * ((this.wave - 1) / Math.max(1, this.wavesTotal - 1));
        this.targetTime = t;
      }
      return;
    }
    if (this.targetTime !== undefined && this.world.timeOfDay !== undefined) {
      const cur = this.world.timeOfDay;
      if (Math.abs(cur - this.targetTime) > 0.01) this.world.setTime(cur + Math.sign(this.targetTime - cur) * Math.min(Math.abs(this.targetTime - cur), dt * 0.05), this.diff.night && this.day % 5 === 0);
    }
    if (this.spawnQueue.length) {
      this.spawnT -= dt;
      const interval = Math.max(0.28, 1.6 - this.day * 0.06) / (this.diff.zCount);
      if (this.spawnT <= 0 && this.zombies.aliveCount < 70) {
        this.spawnT = interval * (0.5 + Math.random());
        const burst = Math.random() < 0.25 ? 3 : 1;
        for (let i = 0; i < burst && this.spawnQueue.length; i++) this.spawnZombie(this.spawnQueue.shift());
      }
    } else if (this.zombies.list.length === 0) {
      if (this.wave >= this.wavesTotal) this.dayCleared();
      else { this.waveBreak = 6; this.hud.banner('WAVE CLEARED', 'Next wave incoming...', 2.2, 'green'); }
    }
  }

  dayCleared() {
    this.state = 'victory';
    this.victoryT = 0; this.victoryTimeT = 0; this.fireworkT = 0.6;
    this.victoryFromTime = this.world.timeOfDay ?? 0.8;
    this.slowmoT = 0.9;
    this.blendCamera(1.6);
    this.waveActive = false;
    this.input.wantLock = false; this.input.unlock();
    const bonus = Math.round((100 + this.day * 45) * this.diff.money);
    const integrity = this.orphanageHp / ORPHANAGE_HP;
    const intactBonus = Math.round(bonus * 0.5 * integrity);
    const total = this.dayEarn + bonus + intactBonus;
    this.money += total;
    this.stats.earned += total;
    sfx('dayClear');
    setMusic('calm');
    this.clearData = { day: this.day, kills: this.dayKills, headshots: this.dayHeadshots, earned: this.dayEarn, bonus, intactBonus, total, integrity };
    this.hud.show(null);
    this.hud.banner(`DAY ${this.day} SURVIVED`, 'The children are safe. For now.', 4.2, 'green');
    this.player.victory = true;
    this.day++;
    const best = this.save.best[this.diff.id] || 0;
    if (this.day - 1 > best) { this.save.best[this.diff.id] = this.day - 1; }
    this.snapshotRun();
  }

  blendCamera(dur) {
    const cam = this.world.camera;
    this.camBlend = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, t: 0, dur };
  }

  applyCameraBlend(dt) {
    const b = this.camBlend;
    if (!b) return;
    b.t += dt;
    const x = Math.min(1, b.t / b.dur), k = x * x * (3 - 2 * x);
    const cam = this.world.camera;
    cam.position.lerpVectors(b.pos, cam.position, k);
    cam.quaternion.slerpQuaternions(b.quat, cam.quaternion.clone(), k);
    cam.fov = b.fov + (cam.fov - b.fov) * k; cam.updateProjectionMatrix();
    if (x >= 1) this.camBlend = null;
  }

  updateVictory(dt) {
    const p = this.player, cam = this.world.camera;
    this.victoryT += dt;
    const t = this.victoryT;
    // slow crane around the survivor with the orphanage behind them
    const a = -0.5 + t * 0.09, r = 7 + Math.min(5, t * 0.8);
    const head = new THREE.Vector3(p.pos.x, 1.6, p.pos.z);
    cam.position.set(p.pos.x + Math.sin(a) * r, 2.2 + Math.min(4, t * 0.6), p.pos.z - Math.cos(a) * r);
    cam.lookAt(head.x * 0.7, 2.2 + Math.min(2.5, t * 0.3), head.z + Math.min(6, t * 0.8));
    if (Math.abs(cam.fov - 55) > 0.1) { cam.fov = 55; cam.updateProjectionMatrix(); }
    p.viewmodel.visible = false; p.rig.root.visible = true;
    p.updateModel(dt, 0);
    // night lifts toward dawn (Nightmare stays dark)
    this.victoryTimeT -= dt;
    if (this.victoryTimeT <= 0 && !this.diff.night) {
      this.victoryTimeT = 0.1;
      const k = Math.min(1, t / 5);
      this.world.setTime(this.victoryFromTime + (0.3 - this.victoryFromTime) * k * k * (3 - 2 * k));
    }
    this.fireworkT -= dt;
    if (this.fireworkT <= 0 && t < 9) {
      this.fireworkT = 0.35 + Math.random() * 0.5;
      this.effects.firework(new THREE.Vector3((Math.random() - 0.5) * 30, 14 + Math.random() * 10, 10 + Math.random() * 14));
      sfx('firework');
    }
    const skip = this.input.mouse.leftPressed || this.input.hit('Enter') || this.input.hit('Space') || this.input.tapped;
    if (this.state === 'victory' && (t > 5.2 || (t > 1.2 && skip))) {
      this.state = 'dayclear';
      this.hud.showDayClear(this.clearData);
    }
    this.zombies.update(dt);
    this.world.update(dt, p.pos, null);
  }

  gameOver(reason) {
    if (this.state === 'gameover') return;
    if (this.mode === 'playground') { this.player.spawn(); this.hud.toast('RESPAWNED'); return; }
    this.state = 'gameover';
    this.goT = 0;
    this.waveActive = false;
    this.input.wantLock = false; this.input.unlock();
    this.save.run = null;
    const survived = this.day - 1;
    const best = this.save.best[this.diff.id] || 0;
    const newBest = survived > best;
    if (newBest) this.save.best[this.diff.id] = survived;
    this.persist();
    setMusic('off');
    sfx('gameOver');
    setTimeout(() => this.hud.showGameOver({ reason, day: this.day, survived, kills: this.stats.kills, headshots: this.stats.headshots, newBest, best: Math.max(best, survived) }), 1800);
  }

  // ---------- combat hooks
  onZombieKilled(z, { headshot, revive }) {
    if (this.state === 'menu') { setTimeout(() => this.state === 'menu' && this.spawnZombie('walker', new THREE.Vector3((Math.random() - 0.5) * 30, 0, -60)), 2000); return; }
    if (revive) return;
    const reward = Math.round(z.def.$ * this.diff.money * (headshot ? 1.5 : 1));
    this.dayKills++; this.dayEarn += reward;
    if (headshot) this.dayHeadshots++;
    this.stats.kills++; if (headshot) this.stats.headshots++;
    this.effects.text(z.root.position.clone().setY(2.2 * z.scale), headshot ? `HEADSHOT +$${reward}` : `+$${reward}`, headshot ? 'head' : 'money');
    sfx('coin');
    this.hud.onKill(headshot);
  }

  onReviverFinished(z) {
    const reward = Math.round(z.def.$ * this.diff.money * 1.5);
    this.dayKills++; this.dayEarn += reward; this.stats.kills++;
    this.dayHeadshots++; this.stats.headshots++;
    this.effects.text(z.root.position.clone().setY(1), `FINISHED +$${reward}`, 'head');
    sfx('coin');
    this.hud.onKill(true);
  }

  onBossSpawn(z) {
    this.boss = z;
    this.hud.banner(z.def.name, 'has arrived', 3, 'red');
    this.shake(1);
    setMusic('boss');
  }

  onBossKilled(z) {
    this.boss = null;
    this.slowmoT = 1.6;
    this.hud.banner('ABOMINATION SLAIN', '', 2.5, 'green');
    this.effects.explosion(z.root.position.clone(), 6);
    setMusic('combat');
  }

  onStructureDestroyed(s) { this.hud.toast(`${s.def.name.toUpperCase()} DESTROYED`, 'bad'); }

  onPlayerDied() {
    this.world.hurt = 1.5;
    this.hud.banner('YOU DIED', '', 3, 'red');
    this.gameOver('You were eaten alive.');
  }

  damagePlayer(dmg, z) {
    if (this.state !== 'wave') return;
    this.player.damage(dmg);
    sfx('bite');
    if (z) {
      _v.subVectors(this.player.pos, z.root.position).setY(0).normalize();
      this.player.knock(_v, z.def.heavy ? 9 : 2.5);
      this.effects.blood(this.player.pos.clone().setY(1.3), _v, 6);
    }
  }

  damageOrphanage(dmg) {
    if (this.state !== 'wave') return;
    if (this.mode === 'playground' && this.godMode) return;
    this.orphanageHp = Math.max(0, this.orphanageHp - dmg * 0.7);
    this.hud.orphanageHit();
    sfx('wood');
    this.world.door.position.x = (Math.random() - 0.5) * 0.08;
    if (this.orphanageHp <= 0) {
      if (this.mode === 'playground') { this.orphanageHp = ORPHANAGE_HP; return; }
      this.hud.banner('THE ORPHANAGE HAS FALLEN', '', 3, 'red');
      this.player.alive = false; this.player.deathT = 0;
      this.gameOver('They got inside. The children...');
    }
  }

  alertNearby(pos, r) {
    for (const z of this.zombies.list) {
      if (z.aggro < 14 && z.root.position.distanceToSquared(pos) < r * r) z.aggro = 14;
    }
  }

  fireRay(origin, dir, range, dmg, { pierce = 0, knock = 0.6, source = 'player', tracerFrom, tracerColor = 0xffe9a0 } = {}) {
    const hits = [];
    for (const z of this.zombies.list) {
      const zp = z.root.position;
      // cheap reject
      const tox = zp.x - origin.x, toz = zp.z - origin.z;
      const along = tox * dir.x + toz * dir.z;
      if (along < -2 || along > range + 3) continue;
      let best = Infinity, part = null;
      for (const [c, r, pname] of z.hitSpheres()) {
        const ocx = origin.x - c.x, ocy = origin.y - c.y, ocz = origin.z - c.z;
        const b = ocx * dir.x + ocy * dir.y + ocz * dir.z;
        const cc = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
        const disc = b * b - cc;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < range && t < best) { best = t; part = pname; }
      }
      if (part) hits.push({ z, t: best, part });
    }
    hits.sort((a, b) => a.t - b.t);
    let end = range;
    if (dir.y < -0.001) end = Math.min(end, -origin.y / dir.y);
    let n = 0, lastT = end;
    let d = dmg;
    for (const h of hits) {
      if (h.t > end) break;
      this.zombies.damage(h.z, d, { dir, part: h.part, knock, source });
      if (source === 'player') this.hud.hitmarker(h.part === 'head');
      lastT = h.t; n++;
      if (n > pierce) break;
      d *= 0.8;
    }
    const endP = origin.clone().addScaledVector(dir, n > pierce ? lastT : end);
    if (n <= pierce && end < range) this.effects.dust(endP, 2, 0x8a7a60);
    if (tracerFrom) this.effects.tracer(tracerFrom, endP, tracerColor, source === 'tower' ? 0.06 : 0.035);
    else this.effects.tracer(origin, endP, tracerColor);
    return n;
  }

  explode(pos, radius, dmg, { fromZombie = false, source = 'explosion', noPlayer = false } = {}) {
    this.effects.explosion(pos, radius);
    sfx('explosion');
    const pd = this.player.pos.distanceTo(pos);
    this.shake(Math.max(0.2, 1.2 - pd / 25));
    this.world.flash = Math.max(this.world.flash, Math.max(0, 0.5 - pd / 40));
    for (const z of [...this.zombies.list]) {
      const d = z.root.position.distanceTo(pos);
      if (d > radius + z.radius) continue;
      const k = 1 - Math.min(1, d / (radius + z.radius)) * 0.6;
      const dir = _v.subVectors(z.root.position, pos).setY(0).normalize().clone();
      this.zombies.damage(z, dmg * k, { dir, knock: 10 * k, explosive: true, source, part: 'body' });
    }
    if (!noPlayer && pd < radius && this.state === 'wave') {
      this.player.damage(dmg * 0.35 * (1 - pd / radius) * (fromZombie ? 1 : 0.5));
      this.player.knock(_v.subVectors(this.player.pos, pos).setY(0).normalize(), 10);
    }
    if (fromZombie) for (const s of [...this.structures.list]) { if (Math.hypot(s.x - pos.x, s.z - pos.z) < radius + 1) this.structures.damage(s, dmg * 1.5); }
  }

  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }
  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); }

  // ---------- shop
  canAfford(p) { return this.mode === 'playground' || this.money >= p; }
  spend(p) { if (this.mode !== 'playground') this.money -= p; }

  buy(kind, id) {
    const p = this.player;
    if (kind === 'weapon') {
      const w = WEAPONS[id];
      if (p.owned.includes(id)) { p.equip(id); return; }
      if (!this.canAfford(w.price)) return this.deny();
      this.spend(w.price); p.give(id); sfx('buy');
    } else if (kind === 'armor') {
      const a = ARMOR[id];
      if (p.armor >= id) return;
      if (!this.canAfford(a.price)) return this.deny();
      this.spend(a.price); p.armor = id; sfx('buy');
    } else if (kind === 'grenade') {
      if (!this.canAfford(GRENADE.price)) return this.deny();
      this.spend(GRENADE.price); p.grenades += GRENADE.count; sfx('buy');
    } else if (kind === 'hp') {
      if (!this.canAfford(400) || p.maxHp >= 200) return this.deny();
      this.spend(400); p.maxHp += 25; p.hp = p.maxHp; sfx('buy');
    } else if (kind === 'structure') {
      const s = STRUCTURES[id];
      if (!this.canAfford(s.price)) return this.deny();
      this.cancelPlacing();
      this.placing = { id, left: s.count || 1, paid: false };
      this.structures.setGhost(id);
      this.hud.placingHint(true);
    } else if (kind === 'repair') {
      const c = this.structures.repairCost();
      if (!c) return;
      if (!this.canAfford(c)) return this.deny();
      this.spend(c); this.structures.repairAll(); sfx('buy');
    } else if (kind === 'orphanage') {
      const c = this.orphanageRepairCost();
      if (!c) return;
      if (!this.canAfford(c)) return this.deny();
      this.spend(c); this.orphanageHp = ORPHANAGE_HP; sfx('buy');
    }
    this.hud.refreshShop();
  }

  orphanageRepairCost() { return Math.ceil((ORPHANAGE_HP - this.orphanageHp) * 0.5); }

  deny() { sfx('deny'); this.hud.toast('NOT ENOUGH MONEY', 'bad'); }

  cancelPlacing() {
    if (!this.placing) return;
    const pl = this.placing, def = STRUCTURES[pl.id];
    if (pl.paid && pl.left > 0 && this.mode !== 'playground') this.money += Math.floor(def.price * pl.left / (def.count || 1));
    this.placing = null; this.structures.clearGhost(); this.hud.placingHint(false);
  }

  tryPlace() {
    const pl = this.placing, gh = this.structures.ghost;
    if (!pl || !gh || !gh.ok) { sfx('deny'); return; }
    const def = STRUCTURES[pl.id];
    if (!pl.paid) {
      if (!this.canAfford(def.price)) { this.deny(); this.cancelPlacing(); return; }
      this.spend(def.price); pl.paid = true;
    }
    this.structures.place(pl.id, gh.x, gh.z, gh.rot);
    pl.left--;
    if (pl.left <= 0) {
      if (this.input.down('ShiftLeft') && this.canAfford(def.price)) { pl.left = def.count || 1; pl.paid = false; }
      else this.cancelPlacing();
    }
    this.hud.refreshShop();
  }

  sellSelected() {
    const s = this.selected;
    if (!s || s.dead) { this.selected = null; this.hud.selectStructure(null); return; }
    const refund = this.structures.sell(s);
    if (this.mode !== 'playground') this.money += refund;
    this.selected = null;
    sfx('coin');
    this.hud.selectStructure(null);
    this.hud.refreshShop();
  }

  // ---------- input / pause
  onLockChange(locked) {
    if (!locked && (this.state === 'wave') && !this.paused && this.player.alive) this.pause(true);
  }

  pause(p) {
    if (this.state !== 'wave') return;
    this.input.resetTouch();
    this.paused = p;
    this.hud.showPause(p);
    if (p) this.input.unlock(); else this.input.lock();
  }

  groundPoint() {
    this.raycaster.setFromCamera(new THREE.Vector2(this.input.mouse.nx, this.input.mouse.ny), this.world.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, out) ? out : null;
  }

  updateBuild(dt) {
    const inp = this.input, bc = this.buildCam;
    const pan = 28 * dt;
    if (!this.hud.typing) {
      if (inp.down('KeyW') || inp.down('ArrowUp')) bc.z -= pan;
      if (inp.down('KeyS') || inp.down('ArrowDown')) bc.z += pan;
      if (inp.down('KeyA') || inp.down('ArrowLeft')) bc.x -= pan;
      if (inp.down('KeyD') || inp.down('ArrowRight')) bc.x += pan;
    }
    if (inp.pan.dx || inp.pan.dy) { const k = bc.h / 600; bc.x -= inp.pan.dx * k; bc.z -= inp.pan.dy * k; }
    if (inp.pan.zoom) bc.hT = Math.max(14, Math.min(60, (bc.hT ?? bc.h) + inp.pan.zoom));
    if (inp.mouse.wheel && !this.hud.overShop) bc.hT = Math.max(14, Math.min(60, (bc.hT ?? bc.h) + inp.mouse.wheel * 3));
    if (bc.hT !== undefined) bc.h += (bc.hT - bc.h) * Math.min(1, dt * 8);
    bc.x = Math.max(-20, Math.min(20, bc.x)); bc.z = Math.max(-50, Math.min(4, bc.z));
    const cam = this.world.camera;
    const target = new THREE.Vector3(bc.x, 0, bc.z);
    const desired = new THREE.Vector3(bc.x, bc.h, bc.z + bc.h * 0.75);
    cam.position.copy(desired);
    cam.lookAt(target.x, 0, target.z);
    if (Math.abs(cam.fov - 55) > 0.1) { cam.fov = 55; cam.updateProjectionMatrix(); }
    this.player.viewmodel.visible = false;
    this.player.rig.root.visible = true;
    this.player.updateModel(dt, 0);

    const gp = this.groundPoint();
    if (this.placing && gp) {
      if (inp.hit('KeyR')) this.structures.ghost.rot = (this.structures.ghost.rot + 1) % 2;
      this.structures.updateGhost(gp.x, gp.z);
      if (inp.mouse.leftPressed && (!this.hud.overShop || inp.touchMode)) this.tryPlace();
      if (inp.mouse.rightPressed || inp.hit('Escape')) this.cancelPlacing();
    } else if (gp && inp.mouse.leftPressed && (!this.hud.overShop || inp.touchMode)) {
      const s = this.structures.at(gp.x, gp.z);
      this.selected = s;
      this.hud.selectStructure(s);
    }
    if (inp.hit('Enter')) this.startDay();
    this.world.update(dt, new THREE.Vector3(bc.x, 0, bc.z), null);
  }

  updateMenu(dt) {
    this.menuT += dt;
    const a = this.menuT * 0.05;
    const cam = this.world.camera;
    cam.position.set(Math.sin(a) * 14, 5 + Math.sin(this.menuT * 0.2) * 1.5, 4 + Math.cos(a) * 6);
    cam.lookAt(0, 2, -20);
    if (Math.abs(cam.fov - 60) > 0.1) { cam.fov = 60; cam.updateProjectionMatrix(); }
    for (const z of this.zombies.list) if (z.root.position.z > 8) { z.root.position.z = -60 - Math.random() * 20; z.root.position.x = (Math.random() - 0.5) * 30; }
    this.zombies.update(dt);
    this.world.update(dt, new THREE.Vector3(0, 0, -10), null);
  }

  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    let dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }
    this.step(dt);
    this.world.render();
    this.input.endFrame();
  }

  step(dt) {
    const inp = this.input;
    if (inp.hit('KeyV') && (this.state === 'wave')) { this.player.setView(this.player.view === 'fps' ? 'tps' : 'fps'); this.save.settings.view = this.player.view; this.persist(); }
    if (inp.hit('KeyM')) { this.save.settings.muted = !this.save.settings.muted; setMuted(this.save.settings.muted); this.persist(); this.hud.toast(this.save.settings.muted ? 'SOUND OFF' : 'SOUND ON'); }
    if (inp.hit('KeyP') && this.state === 'wave') this.pause(!this.paused);

    if (this.state === 'menu') this.updateMenu(dt);
    else if (this.state === 'build') this.updateBuild(dt);
    else if (this.state === 'victory' || this.state === 'dayclear') {
      if (this.slowmoT > 0) { this.slowmoT -= dt; dt *= 0.35; }
      this.updateVictory(dt);
    }
    else if (this.state === 'gameover' && (this.goT = (this.goT || 0) + dt) > 3) { this.player.updateCamera(dt); this.world.update(dt, this.player.pos, null); }
    else if (this.paused || (this.state === 'wave' && !inp.locked && !inp.touchMode && !this.debugNoLock && this.player.alive)) { /* frozen until the pointer is captured */ }
    else {
      if (this.hitStopT > 0) { this.hitStopT -= dt; dt *= 0.08; }
      if (this.slowmoT > 0) { this.slowmoT -= dt; dt *= 0.3; }
      const active = this.state === 'wave' && (inp.locked || inp.touchMode || this.debugNoLock);
      if (this.state === 'wave' && this.mode === 'playground') { this.playgroundKeys(); if (this.state !== 'wave') { this.hud.update(dt); return; } }
      this.player.update(dt, inp, active);
      if (this.state === 'wave') this.updateDirector(dt);
      this.zombies.update(dt);
      this.structures.update(dt);
      this.world.update(dt, this.player.pos, this.player.forward(new THREE.Vector3()));
    }
    this.applyCameraBlend(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    this.effects.update(this.paused ? 0 : dt);
    this.hud.update(dt);
  }

  playgroundKeys() {
    const inp = this.input;
    if (inp.hit('Tab')) { this.backToBuild(); return; }
    if (inp.hit('KeyZ')) {
      const types = Object.keys(ZOMBIES).filter((t) => t !== 'boss');
      for (let i = 0; i < 15; i++) this.spawnZombie(types[Math.floor(Math.random() * types.length)]);
      this.hud.toast('HORDE SPAWNED');
    }
    if (inp.hit('KeyX')) { const t = ['walker', 'runner', 'helmet', 'crawler', 'riser', 'bloater', 'brute']; this.pgType = ((this.pgType ?? -1) + 1) % t.length; this.spawnZombie(t[this.pgType], new THREE.Vector3(this.player.pos.x, 0, this.player.pos.z - 14)); this.hud.toast('SPAWNED ' + ZOMBIES[t[this.pgType]].name.toUpperCase()); }
    if (inp.hit('KeyB')) this.spawnZombie('boss');
    if (inp.hit('KeyH')) { this.godMode = !this.godMode; this.hud.toast(this.godMode ? 'GOD MODE ON' : 'GOD MODE OFF'); }
    if (inp.hit('KeyK')) { for (const z of [...this.zombies.list]) this.zombies.damage(z, 1e6, { explosive: true, dir: new THREE.Vector3(0, 0, -1) }); }
  }

  backToBuild() {
    // playground only: return to build view keeping zombies cleared
    this.state = 'build';
    this.enterBuild();
  }
}
