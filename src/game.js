import * as THREE from 'three';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { ZombieManager } from './zombies.js';
import { StructureManager, rayBox, CHIP, METAL } from './structures.js';
import { PartnerManager } from './partners.js';
import { buildPickup } from './models.js';
import { Net } from './net.js';
import { Hud } from './ui.js';
import { initAudio, sfx, setMusic, setMuted } from './audio.js';
import { DIFFICULTIES, WEAPONS, ZOMBIES, STRUCTURES, ARMOR, GRENADE, WORLD, ORPHANAGE_HP, zombieUnlocked, bossForDay, BOSS_ROTATION, HEALS, HEAL_COST_PER_HP, PARTNERS, MAX_PARTNERS, UPGRADE, DEFAULT_BINDS, LOADOUT_SIZE } from './config.js';

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
    this.partners = new PartnerManager(this);
    this.pickups = [];
    // blood and scorch marks never land under a building
    this.effects.isCovered = (x, z) => this.structures.list.some((st) => st.def.type !== 'trap' && x > st.minX && x < st.maxX && z > st.minZ && z < st.maxZ);
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
    const out = Object.assign({ best: {}, run: null }, s || {});
    // merge so settings added in newer versions get their defaults
    out.settings = { view: 'tps', pixel: 'pixel', gore: true, sens: 1, muted: false, showFps: false, ...(s?.settings || {}) };
    out.settings.binds = { ...DEFAULT_BINDS, ...(s?.settings?.binds || {}) };
    return out;
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage unavailable */ } }

  applySettings() {
    const st = this.save.settings;
    this.world.setPixelMode(st.pixel);
    this.effects.gore = st.gore;
    this.input.sensitivity = st.sens;
    this.input.binds = st.binds;
    setMuted(st.muted);
    this.player.view = st.view;
  }

  snapshotRun() {
    const p = this.player;
    this.save.run = {
      diff: this.diff.id, day: this.day, money: this.money, orphanageHp: this.orphanageHp,
      owned: p.owned, loadout: p.loadout, upgrades: p.upgrades, heals: p.heals, hp: p.hp,
      armor: p.armor, grenades: p.grenades, maxHp: p.maxHp,
      partners: this.partners.list.filter((a) => a.alive).map((a) => a.id),
      stats: this.stats,
      structures: this.structures.list.map((s) => ({ id: s.id, x: s.x, z: s.z, rot: s.rot, hp: s.hp })),
    };
    this.persist();
  }

  // ---------- co-op
  get isClient() { return this.net?.role === 'client'; }
  get isHost() { return this.net?.role === 'host'; }
  structuresDef(id) { return STRUCTURES[id]; }

  async netHost(url, name) { this.leaveNet(); this.net = await Net.host(this, url, name); this.hud.updateLobby(); return this.net; }
  async netJoin(url, code, name) { this.leaveNet(); this.net = await Net.join(this, url, code, name); this.hud.updateLobby(); return this.net; }

  leaveNet() {
    if (!this.net) return;
    const n = this.net; this.net = null; n.leave();
    if (this.state !== 'menu') this.enterMenu();
    this.hud.updateLobby();
  }

  // host: lobby START
  startNet(diffId) { if (this.isHost) this.newRun(diffId, 'coop'); }

  // guest: follow the host's game flow
  netPhase(m) {
    this.diff = DIFFICULTIES[m.diff];
    if (m.st === 'newrun' || m.fresh || this.mode !== 'coop') {
      this.mode = 'coop';
      this.stats = { kills: 0, headshots: 0, earned: 0 };
      this.orphanageHp = ORPHANAGE_HP;
      this.zombies.clear(); this.structures.clear(); this.effects.clearDecals(); this.partners.clear();
      this.player.reset();
    }
    this.day = m.day;
    if (m.st === 'build' || (m.fresh && m.st !== 'wave')) this.enterBuild();
    else if (m.st === 'wave') { if (this.state !== 'build') this.enterBuild(); this.startDay(true); }
    else if (m.st === 'victory') { this.day = m.day - 1; this.beginVictory(m.clear); this.day = m.day; }
    else if (m.st === 'gameover') this.gameOver(m.reason, true);
  }

  onNetBoss(z) { this.hud.banner(z.def.name, 'has arrived', 3, 'red'); setMusic('boss'); }

  // everyone's hits go through here: the host applies damage, guests show feedback and report the hit
  hitZombie(z, dmg, opts) {
    if (!this.isClient) return this.zombies.damage(z, dmg, opts);
    if (z.state === 'dead') return false;
    const { dir, part = 'body', knock = 0, source = 'player', dismember = false, explosive = false } = opts;
    const blocked = this.zombies.shieldBlocks(z, dir, part, explosive);
    const hp = z.root.position.clone().setY(z.root.position.y + (part === 'head' ? 1.8 : part === 'legs' ? 0.5 : 1.2) * z.scale);
    if (blocked || (part === 'head' && z.helmetHp > 0 && z.rig.helmet?.parent)) { this.effects.sparks(hp, 5); sfx('helmet'); }
    else { this.effects.blood(hp, dir, part === 'head' ? 10 : 5, z.def.fat ? 0x8a9a20 : 0x9a0f0f); sfx(part === 'head' ? 'headshot' : 'hit'); z.hitFlash = 0.08; }
    this.net.send({ t: 'hit', id: z.id, dmg: Math.round(dmg * 100) / 100, part, dir: [dir ? Math.round(dir.x * 100) / 100 : 0, dir ? Math.round(dir.z * 100) / 100 : 1], knock, src: source, dis: dismember, exp: explosive });
    return blocked ? 'blocked' : false;
  }

  // ---------- flow
  enterMenu() {
    if (this.net) { this.leaveNet(); if (this.state === 'menu') return; }
    this.state = 'menu';
    this.mode = 'campaign';
    this.godMode = false;
    this.paused = false;
    this.input.wantLock = false; this.input.unlock();
    this.zombies.clear(); this.structures.clear(); this.effects.clearDecals(); this.effects.clearTexts();
    this.partners.clear(); this.clearPickups();
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

  newRun(diffId, mode = this.net ? 'coop' : 'campaign') {
    initAudio();
    this.diff = DIFFICULTIES[diffId];
    this.mode = mode;
    this.day = 1;
    this.money = this.diff.startMoney;
    this.orphanageHp = ORPHANAGE_HP;
    this.stats = { kills: 0, headshots: 0, earned: 0 };
    this.zombies.clear(); this.structures.clear(); this.effects.clearDecals(); this.partners.clear();
    this.player.reset();
    if (mode === 'campaign') { this.save.run = null; this.persist(); }
    this.net?.phase('newrun');
    this.enterBuild();
  }

  continueRun() {
    initAudio();
    const r = this.save.run;
    if (!r || r.inWave) return;
    this.diff = DIFFICULTIES[r.diff];
    this.mode = 'campaign';
    this.day = r.day; this.money = r.money; this.orphanageHp = r.orphanageHp; this.stats = r.stats;
    this.zombies.clear(); this.structures.clear(); this.effects.clearDecals(); this.partners.clear();
    const p = this.player;
    p.reset();
    const owned = r.owned.filter((id) => WEAPONS[id]);
    for (const id of owned) if (!p.owned.includes(id)) p.owned.push(id);
    // older saves had no loadout: carry the best of what you own
    p.loadout = (r.loadout || owned.slice().sort((a, b) => WEAPONS[b].price - WEAPONS[a].price).slice(0, LOADOUT_SIZE)).filter((id) => p.owned.includes(id));
    if (!p.loadout.length) p.loadout = ['pistol'];
    p.upgrades = r.upgrades || {};
    p.heals = { banana: 0, medkit: 0, ...(r.heals || {}) };
    p.armor = r.armor; p.grenades = r.grenades; p.maxHp = r.maxHp || 100;
    p.hp = Math.min(p.maxHp, r.hp ?? p.maxHp);
    for (const id of p.owned) p.refill(id);
    for (const s of r.structures) { if (!STRUCTURES[s.id]) continue; const o = this.structures.place(s.id, s.x, s.z, s.rot); o.hp = s.hp; }
    for (const id of r.partners || []) if (PARTNERS[id]) this.partners.hire(id);
    p.equip(p.loadout.find((id) => WEAPONS[id].slot === 2) || p.loadout[0], true);
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
    this.zombies.clear(); this.structures.clear(); this.effects.clearDecals(); this.partners.clear();
    const p = this.player;
    p.reset();
    p.owned = Object.keys(WEAPONS);
    p.owned.sort((a, b) => (WEAPONS[a].slot - WEAPONS[b].slot) || (WEAPONS[a].price - WEAPONS[b].price));
    p.loadout = ['deagle', 'ar', 'shotgun', 'katana'];
    for (const id of p.owned) p.refill(id);
    p.grenades = 99;
    p.heals = { banana: 9, medkit: 9 };
    p.armor = 2;
    p.equip('ar', true);
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
    this.clearPickups();
    const wasDead = !this.player.alive;
    this.player.spawn();
    this.spreadSpawn();
    if (this.mode === 'playground') this.player.hp = this.player.maxHp;
    // co-op: fallen teammates get back up at dawn, patched up a little
    if (this.mode === 'coop' && wasDead) this.player.hp = Math.max(this.player.hp, Math.round(this.player.maxHp * 0.35));
    this.partners.resetForPhase();
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
    if (this.mode !== 'playground') this.hud.banner(`DAY ${this.day}`, 'Prepare your defenses', 2.2);
    this.net?.phase('build');
  }

  spreadSpawn() { if (this.net) this.player.pos.x += [0, -2.2, 2.2, -4.4][this.net.id % 4]; }

  startDay(fromNet = false) {
    if (this.state !== 'build') return;
    if (this.isClient && !fromNet) return; // only the host starts the day
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
    this.spreadSpawn();
    if (this.mode === 'playground') this.player.hp = this.player.maxHp;
    this.partners.resetForPhase();
    this.hud.show('wave');
    this.input.wantLock = true;
    this.input.lock();
    this.world.setTime(this.diff.night ? 1 : 0.42);
    if (this.mode === 'campaign' && this.save.run) { this.save.run.inWave = true; this.persist(); }
    if (this.mode !== 'playground' && !this.isClient) { this.hud.banner('THEY ARE COMING!', `Day ${this.day}`, 2.6, 'red'); sfx('siren'); }
    this.net?.phase('wave');
    setMusic('combat');
  }

  buildWave(n) {
    const day = this.day;
    const count = Math.round((4 + day * 2.1 + n * 1.5) * this.diff.zCount);
    const weights = { walker: 1, runner: 0.4, helmet: 0.32, crawler: 0.22, riser: 0.28, bloater: 0.16, spitter: 0.14, leaper: 0.16, screamer: 0.07, riot: 0.12, brute: 0.07 + Math.min(0.12, day * 0.006) };
    const pool = Object.entries(weights).filter(([t]) => zombieUnlocked(t, day));
    const total = pool.reduce((a, [, w]) => a + w, 0);
    const q = [];
    for (let i = 0; i < count; i++) {
      let r = Math.random() * total;
      for (const [t, w] of pool) { r -= w; if (r <= 0) { q.push(t); break; } }
    }
    // rush groups of runners make later waves spicy
    if (day >= 4 && n >= 2) for (let i = 0; i < 3 + day / 3; i++) q.splice(Math.floor(q.length * 0.6), 0, 'runner');
    if (day % 5 === 0 && n === this.wavesTotal) {
      q.splice(Math.floor(q.length * 0.3), 0, bossForDay(day));
      // from day 25 on, a second boss joins the party
      if (day >= 25) q.splice(Math.floor(q.length * 0.7), 0, bossForDay(day + 5));
    }
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
    const bonus = Math.round((100 + this.day * 45) * this.diff.money);
    const integrity = this.orphanageHp / ORPHANAGE_HP;
    const intactBonus = Math.round(bonus * 0.5 * integrity);
    const total = this.dayEarn + bonus + intactBonus;
    this.money += total;
    this.stats.earned += total;
    this.beginVictory({ day: this.day, kills: this.dayKills, headshots: this.dayHeadshots, earned: this.dayEarn, bonus, intactBonus, total, integrity });
    this.day++;
    this.net?.phase('victory', { clear: this.clearData });
    if (this.mode !== 'campaign') return;
    const best = this.save.best[this.diff.id] || 0;
    if (this.day - 1 > best) { this.save.best[this.diff.id] = this.day - 1; }
    this.snapshotRun();
  }

  // end-of-day cinematic (host and guests)
  beginVictory(clearData) {
    this.state = 'victory';
    this.victoryT = 0; this.victoryTimeT = 0; this.fireworkT = 0.6;
    this.victoryFromTime = this.world.timeOfDay ?? 0.8;
    this.slowmoT = 0.9;
    this.blendCamera(1.6);
    this.waveActive = false;
    this.input.wantLock = false; this.input.unlock();
    sfx('dayClear');
    setMusic('calm');
    this.clearData = clearData;
    this.hud.show(null);
    if (!this.isClient) this.hud.banner(`DAY ${clearData.day} SURVIVED`, 'The children are safe. For now.', 4.2, 'green');
    this.player.victory = true;
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
    this.partners.update(dt, false);
    this.world.update(dt, p.pos, null);
  }

  gameOver(reason, fromNet = false) {
    if (this.state === 'gameover') return;
    if (this.mode === 'playground') { this.player.spawn(); this.player.hp = this.player.maxHp; this.hud.toast('RESPAWNED'); return; }
    if (this.isClient && !fromNet) return; // the host decides when the run is over
    this.state = 'gameover';
    this.goT = 0;
    this.waveActive = false;
    this.input.wantLock = false; this.input.unlock();
    this.net?.phase('gameover', { reason });
    const survived = this.day - 1;
    const best = this.save.best[this.diff.id] || 0;
    const newBest = this.mode === 'campaign' && survived > best;
    if (this.mode === 'campaign') {
      this.save.run = null;
      if (newBest) this.save.best[this.diff.id] = survived;
      this.persist();
    }
    setMusic('off');
    sfx('gameOver');
    setTimeout(() => this.hud.showGameOver({ reason, day: this.day, survived, kills: this.stats.kills, headshots: this.stats.headshots, newBest, best: Math.max(best, survived) }), 1800);
  }

  // ---------- combat hooks
  onZombieKilled(z, { headshot, revive }) {
    if (this.isClient) {
      // money is the host's business; just show the reward
      if (revive) return;
      const reward = Math.round(z.def.$ * this.diff.money * (headshot ? 1.5 : 1));
      this.effects.text(z.root.position.clone().setY(2.2 * z.scale), headshot ? `HEADSHOT +$${reward}` : `+$${reward}`, headshot ? 'head' : 'money');
      sfx('coin'); this.hud.onKill(headshot);
      return;
    }
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
    if (this.isClient) { this.effects.text(z.root.position.clone().setY(1), 'FINISHED', 'head'); return; }
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
    if (this.isClient) { this.slowmoT = 1.6; this.hud.banner(`${z.def.name.replace(/^THE /, '')} SLAIN`, '', 2.5, 'green'); this.effects.explosion(z.root.position.clone(), 6); setMusic('combat'); return; }
    this.boss = this.zombies.list.find((o) => o.def.boss && o !== z && o.state !== 'dead') || null;
    this.slowmoT = 1.6;
    this.hud.banner(`${z.def.name.replace(/^THE /, '')} SLAIN`, '', 2.5, 'green');
    this.effects.explosion(z.root.position.clone(), 6);
    setMusic('combat');
  }

  // survivors zombies can go after: you and your living allies
  targets() {
    const t = this._targets || (this._targets = []);
    t.length = 0; t.push(this.player);
    for (const a of this.partners.list) if (a.alive) t.push(a);
    if (this.isHost) for (const a of this.net.avatars.values()) if (a.s && a.alive) t.push(a);
    return t;
  }

  damageTarget(t, dmg, z) {
    if (t === this.player) { this.damagePlayer(dmg, z); return; }
    if (this.state !== 'wave') return;
    t.damage(dmg);
    sfx('bite');
    this.effects.blood(t.pos.clone().setY(t.pos.y + 1.3), null, 5);
  }

  onPartnerDied(a) {
    this.net?.event('toast', { msg: `${a.def.name.toUpperCase()} HAS FALLEN`, cls: 'bad' });
    this.hud.toast(`${a.def.name.toUpperCase()} HAS FALLEN`, 'bad');
    sfx('hurt');
  }

  // killed zombies sometimes drop a snack
  onZombieDrop(z) {
    if (this.state !== 'wave' || this.net || Math.random() > (z.def.boss ? 1 : 0.045)) return;
    const kind = z.def.boss || Math.random() < 0.15 ? 'medkit' : 'banana';
    const mesh = buildPickup(kind);
    mesh.position.copy(z.root.position).setY(0.5);
    this.world.scene.add(mesh);
    this.pickups.push({ mesh, kind, t: 0 });
  }

  clearPickups() { for (const pk of this.pickups) this.world.scene.remove(pk.mesh); this.pickups = []; }

  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      pk.mesh.rotation.y += dt * 2.5;
      pk.mesh.position.y = 0.45 + Math.sin(pk.t * 3) * 0.12;
      const near = p.alive && Math.hypot(p.pos.x - pk.mesh.position.x, p.pos.z - pk.mesh.position.z) < 1.4 && p.pos.y < 2;
      if (near || pk.t > 30) {
        this.world.scene.remove(pk.mesh); this.pickups.splice(i, 1);
        if (near) { p.heals[pk.kind]++; sfx('eat'); this.hud.toast(`+1 ${HEALS[pk.kind].name.toUpperCase()}`); this.hud.updateAmmo(); }
      }
    }
  }

  onStructureDestroyed(s) {
    this.net?.event('toast', { msg: `${s.def.name.toUpperCase()} DESTROYED`, cls: 'bad' }); this.hud.toast(`${s.def.name.toUpperCase()} DESTROYED`, 'bad'); }

  onPlayerDied() {
    this.world.hurt = 1.5;
    if (this.mode === 'coop') {
      // co-op: spectate until dawn; the host ends the run if everyone is down
      this.hud.banner('YOU DIED', 'Your team fights on. You get back up at dawn.', 3.5, 'red');
      return;
    }
    this.hud.banner('YOU DIED', '', 3, 'red');
    this.gameOver('You were eaten alive.');
  }

  damagePlayer(dmg, z) {
    if (this.state !== 'wave') return;
    this.player.damage(dmg);
    sfx('bite');
    // no shove: zombies never push you around (you can't collide with them), only boss attacks do
    if (z) {
      _v.subVectors(this.player.pos, z.root.position).setY(0).normalize();
      this.effects.blood(this.player.pos.clone().setY(this.player.pos.y + 1.3), _v, 6);
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
    // your shots stop at walls (barricades, cars, the orphanage): climb a platform to shoot over them
    let block = null;
    if (source === 'player') {
      const b = this.structures.rayBlock(origin, dir, end);
      if (b) { end = b.t; block = b.s; }
      for (const c of this.world.colliders) {
        const t = rayBox(origin, dir, c.minX, 0, c.minZ, c.maxX, c.h ?? 3, c.maxZ);
        if (t !== null && t < end) { end = t; block = c; }
      }
    }
    let n = 0, lastT = end;
    let d = dmg;
    for (const h of hits) {
      if (h.t > end) break;
      const res = this.hitZombie(h.z, d, { dir, part: h.part, knock, source });
      if (source === 'player') this.hud.hitmarker(h.part === 'head');
      lastT = h.t; n++;
      if (res === 'blocked') { n = pierce + 1; break; } // riot shield stops the round
      if (n > pierce) break;
      d *= 0.8;
    }
    const endP = origin.clone().addScaledVector(dir, n > pierce ? lastT : end);
    if (n <= pierce && end < range) {
      if (block && block.def) {
        this.effects.splinters(endP, CHIP[block.id] ?? 0x8a7a60, 2);
        if (METAL.has(block.id)) this.effects.sparks(endP, 3); else this.effects.dust(endP, 1, 0x8a7a60);
        sfx(METAL.has(block.id) ? 'metal' : 'wood');
      } else if (block) { this.effects.sparks(endP, 3); this.effects.dust(endP, 1, 0x6a6a6a); }
      else this.effects.dust(endP, 2, 0x8a7a60);
    }
    if (source === 'player') this.net?.localShot(tracerFrom || origin, endP, false, null);
    if (tracerFrom) this.effects.tracer(tracerFrom, endP, tracerColor, source === 'tower' ? 0.06 : 0.035);
    else this.effects.tracer(origin, endP, tracerColor);
    return n;
  }

  explode(pos, radius, dmg, { fromZombie = false, source = 'explosion', noPlayer = false, remote = false } = {}) {
    this.effects.explosion(pos, radius);
    sfx('explosion');
    const pd = this.player.pos.distanceTo(pos);
    if (!remote) {
      this.shake(Math.max(0.2, 1.2 - pd / 25));
      this.world.flash = Math.max(this.world.flash, Math.max(0, 0.5 - pd / 40));
    }
    if (this.isClient) {
      // guest: my own grenade. The host applies zombie damage; I only take my own splash.
      this.net.send({ t: 'boom', p: [pos.x, pos.y, pos.z], r: radius, dmg });
      if (!noPlayer && pd < radius && this.state === 'wave') this.player.damage(dmg * 0.35 * (1 - pd / radius) * 0.5);
      return;
    }
    for (const z of [...this.zombies.list]) {
      const d = z.root.position.distanceTo(pos);
      if (d > radius + z.radius) continue;
      const k = 1 - Math.min(1, d / (radius + z.radius)) * 0.6;
      const dir = _v.subVectors(z.root.position, pos).setY(0).normalize().clone();
      this.zombies.damage(z, dmg * k, { dir, knock: 10 * k, explosive: true, source, part: 'body' });
    }
    if (fromZombie && this.state === 'wave') for (const a of this.targets()) { if (a === this.player) continue; const ad = a.pos.distanceTo(pos); if (a.alive && ad < radius) a.damage(dmg * 0.35 * (1 - ad / radius)); }
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
  spend(p) {
    if (this.mode === 'playground') return;
    this.money -= p;
    if (this.isClient) this.net.send({ t: 'spend', a: p }); // shared team money lives on the host
  }
  earn(a) { if (this.mode === 'playground') return; this.money += a; if (this.isClient) this.net.send({ t: 'earn', a }); }

  buy(kind, id) {
    const p = this.player;
    if (kind === 'weapon') {
      const w = WEAPONS[id];
      if (p.owned.includes(id)) {
        // owned: equip into / unequip from the loadout
        if (!p.toggleLoadout(id)) { sfx('deny'); this.hud.toast(p.loadout.includes(id) ? 'YOU NEED AT LEAST ONE WEAPON' : `LOADOUT FULL (${LOADOUT_SIZE}) · UNEQUIP SOMETHING`, 'bad'); }
        else sfx('click');
      } else {
        if (!this.canAfford(w.price)) return this.deny();
        this.spend(w.price); p.give(id); sfx('buy');
        if (!p.loadout.includes(id)) this.hud.toast(`LOADOUT FULL · ${w.name.toUpperCase()} IS IN YOUR LOCKER`);
      }
    } else if (kind === 'upgrade') {
      const w = WEAPONS[id], lvl = p.upgrades[id] || 0;
      if (lvl >= UPGRADE.max) return;
      const c = UPGRADE.cost(w, lvl);
      if (!this.canAfford(c)) return this.deny();
      this.spend(c); p.upgrade(id); sfx('buy');
      this.hud.toast(`${w.name.toUpperCase()} UPGRADED TO MK ${lvl + 2}`);
    } else if (kind === 'heal') {
      const c = this.healCost();
      if (!c) return;
      if (!this.canAfford(c)) return this.deny();
      this.spend(c); p.hp = p.maxHp; sfx('eat');
    } else if (kind === 'consumable') {
      const h = HEALS[id];
      if (!this.canAfford(h.price)) return this.deny();
      this.spend(h.price); p.heals[id]++; sfx('buy');
    } else if (kind === 'partner') {
      if (this.net) { sfx('deny'); this.hud.toast('ALLIES ARE SINGLE-PLAYER ONLY', 'bad'); return; }
      const hired = this.partners.list.find((a) => a.id === id && a.alive);
      if (hired) {
        const refund = Math.floor(PARTNERS[id].price * 0.25);
        this.partners.dismiss(hired);
        if (this.mode !== 'playground') this.money += refund;
        this.hud.toast(`${PARTNERS[id].name.toUpperCase()} DISMISSED +$${refund}`);
      } else {
        if (this.partners.alive.length >= MAX_PARTNERS) { sfx('deny'); this.hud.toast(`MAX ${MAX_PARTNERS} ALLIES`, 'bad'); return; }
        if (!this.canAfford(PARTNERS[id].price)) return this.deny();
        this.spend(PARTNERS[id].price); this.partners.hire(id); sfx('buy');
      }
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
      this.spend(400); p.maxHp += 25; p.hp += 25; sfx('buy');
    } else if (kind === 'structure') {
      const s = STRUCTURES[id];
      if (!this.canAfford(s.price)) return this.deny();
      this.cancelPlacing();
      this.placing = { id, left: s.count || 1, paid: false };
      this.structures.setGhost(id);
      this.hud.placingHint(true);
    } else if ((kind === 'repair' || kind === 'orphanage') && this.isClient) {
      this.net.send({ t: 'req', k: kind }); sfx('buy'); return;
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

  healCost() { return Math.ceil((this.player.maxHp - this.player.hp) * HEAL_COST_PER_HP); }

  orphanageRepairCost() { return Math.ceil((ORPHANAGE_HP - this.orphanageHp) * 0.5); }

  deny() { sfx('deny'); this.hud.toast('NOT ENOUGH MONEY', 'bad'); }

  cancelPlacing() {
    if (!this.placing) return;
    const pl = this.placing, def = STRUCTURES[pl.id];
    if (pl.paid && pl.left > 0) this.earn(Math.floor(def.price * pl.left / (def.count || 1)));
    this.placing = null; this.structures.clearGhost(); this.hud.placingHint(false);
  }

  tryPlace() {
    const pl = this.placing, gh = this.structures.ghost;
    if (!pl || !gh || !gh.ok) { sfx('deny'); return; }
    const def = STRUCTURES[pl.id];
    if (this.isClient) {
      // the host places it and charges the team
      if (!this.canAfford(Math.ceil(def.price / (def.count || 1)))) { this.deny(); this.cancelPlacing(); return; }
      this.net.send({ t: 'place', id: pl.id, x: gh.x, z: gh.z, rot: gh.rot });
      sfx('place');
      if (--pl.left <= 0) { if (this.input.down('ShiftLeft')) pl.left = def.count || 1; else this.cancelPlacing(); }
      return;
    }
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
    if (this.isClient) { this.net.send({ t: 'sell', uid: s.uid }); this.selected = null; sfx('coin'); this.hud.selectStructure(null); return; }
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
    if (p && this.net) this.hud.toast('CO-OP DOESN\'T PAUSE: THE FIGHT GOES ON');
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
      if (inp.act('forward')) bc.z -= pan;
      if (inp.act('back')) bc.z += pan;
      if (inp.act('left')) bc.x -= pan;
      if (inp.act('right')) bc.x += pan;
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
    this.partners.update(dt, false);

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
    if (inp.capture) { this.hud.update(dt); this.effects.update(0); return; }
    if (inp.actHit('view') && (this.state === 'wave')) { this.player.setView(this.player.view === 'fps' ? 'tps' : 'fps'); this.save.settings.view = this.player.view; this.persist(); }
    if (inp.actHit('mute')) { this.save.settings.muted = !this.save.settings.muted; setMuted(this.save.settings.muted); this.persist(); this.hud.toast(this.save.settings.muted ? 'SOUND OFF' : 'SOUND ON'); }
    if (inp.actHit('pause') && this.state === 'wave') this.pause(!this.paused);

    if (this.state === 'menu') this.updateMenu(dt);
    else if (this.state === 'build') this.updateBuild(dt);
    else if (this.state === 'victory' || this.state === 'dayclear') {
      if (this.slowmoT > 0) { this.slowmoT -= dt; dt *= 0.35; }
      this.updateVictory(dt);
    }
    else if (this.state === 'gameover' && (this.goT = (this.goT || 0) + dt) > 3) { this.player.updateCamera(dt); this.world.update(dt, this.player.pos, null); }
    else if (!this.net && (this.paused || (this.state === 'wave' && !inp.locked && !inp.touchMode && !this.debugNoLock && this.player.alive))) { /* frozen until the pointer is captured (co-op never pauses) */ }
    else {
      if (this.hitStopT > 0) { this.hitStopT -= dt; dt *= 0.08; }
      if (this.slowmoT > 0) { this.slowmoT -= dt; dt *= 0.3; }
      const active = this.state === 'wave' && (inp.locked || inp.touchMode || this.debugNoLock);
      if (this.state === 'wave' && this.mode === 'playground') { this.playgroundKeys(); if (this.state !== 'wave') { this.hud.update(dt); return; } }
      this.player.update(dt, inp, active);
      if (this.state === 'wave' && !this.isClient) this.updateDirector(dt);
      this.zombies.update(dt);
      this.partners.update(dt, this.state === 'wave');
      if (this.state === 'wave') this.updatePickups(dt);
      this.structures.update(dt);
      this.world.update(dt, this.player.pos, this.player.forward(new THREE.Vector3()));
    }
    this.net?.update(dt);
    this.applyCameraBlend(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    this.effects.update(this.paused && !this.net ? 0 : dt);
    this.hud.update(dt);
  }

  playgroundKeys() {
    const inp = this.input;
    if (inp.hit('Tab')) { this.backToBuild(); return; }
    if (inp.hit('KeyZ')) {
      const types = Object.keys(ZOMBIES).filter((t) => !ZOMBIES[t].boss);
      for (let i = 0; i < 15; i++) this.spawnZombie(types[Math.floor(Math.random() * types.length)]);
      this.hud.toast('HORDE SPAWNED');
    }
    if (inp.hit('KeyX')) { const t = ['walker', 'runner', 'helmet', 'crawler', 'riser', 'bloater', 'spitter', 'leaper', 'screamer', 'riot', 'brute']; this.pgType = ((this.pgType ?? -1) + 1) % t.length; this.spawnZombie(t[this.pgType], new THREE.Vector3(this.player.pos.x, 0, this.player.pos.z - 14)); this.hud.toast('SPAWNED ' + ZOMBIES[t[this.pgType]].name.toUpperCase()); }
    if (inp.hit('KeyB')) { this.pgBoss = ((this.pgBoss ?? -1) + 1) % BOSS_ROTATION.length; this.spawnZombie(BOSS_ROTATION[this.pgBoss]); }
    if (inp.hit('KeyH')) { this.godMode = !this.godMode; this.hud.toast(this.godMode ? 'GOD MODE ON' : 'GOD MODE OFF'); }
    if (inp.hit('KeyK')) { for (const z of [...this.zombies.list]) this.zombies.damage(z, 1e6, { explosive: true, dir: new THREE.Vector3(0, 0, -1) }); }
  }

  backToBuild() {
    // playground only: return to build view keeping zombies cleared
    this.state = 'build';
    this.enterBuild();
  }
}
