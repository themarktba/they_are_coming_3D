import * as THREE from 'three';
import { ZOMBIES, WEAPONS } from './config.js';
import { buildCharacter, buildWeapon } from './models.js';
import { sfx, setSfxHook } from './audio.js';

// Co-op model: the host's browser simulates zombies, structures, waves and money.
// Guests simulate only their own player, send their state/hits, and render the host's snapshots.
const ZTYPES = Object.keys(ZOMBIES);
const MODES = ['walk', 'attack', 'stagger'];
export const TEAM_COLORS = [0x3f6db3, 0xb33a3a, 0x3aa84a, 0xc8a02a];
const FX = ['blood', 'gib', 'dust', 'sparks', 'splinters', 'muzzle', 'tracer', 'explosion', 'decal', 'text', 'shockwave', 'firework'];
const QUIET_SFX = new Set(['click', 'buy', 'deny', 'hurt', 'step', 'reload', 'reloadDone', 'empty', 'pin', 'eat', 'swing']);
const SNAP_HZ = 15, STATE_HZ = 20;
const r2 = (v) => Math.round(v * 100) / 100;
const enc = (a) => (a && a.isVector3 ? [r2(a.x), r2(a.y), r2(a.z)] : a);
const dec = (a) => (Array.isArray(a) && a.length === 3 && typeof a[0] === 'number' ? new THREE.Vector3(a[0], a[1], a[2]) : a);
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function defaultServer() {
  if (import.meta.env?.VITE_COOP_SERVER) return import.meta.env.VITE_COOP_SERVER;
  // served by the co-op server itself: same origin. Vite dev server / file://: local server on 8787.
  if (location.protocol.startsWith('http') && location.port !== '5173') return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return `ws://${location.hostname || 'localhost'}:8787/ws`;
}

// A teammate's body, driven by their streamed state.
class Avatar {
  constructor(scene, id, name) {
    this.id = id; this.name = name;
    this.rig = buildCharacter({ skin: 0xe0b48c, shirt: TEAM_COLORS[id % 4], pants: 0x2d3b55, hair: 0x3a2a1a, player: true, knees: true });
    this.pos = this.rig.root.position;
    this.pos.set(0, 0, 6);
    this.s = null; this.alive = true; this.hp = 100; this.maxHp = 100; this.phase = 0; this.weapon = null;
    this.tag = this.makeTag(name);
    this.rig.root.add(this.tag);
    scene.add(this.rig.root);
    this.scene = scene;
  }

  makeTag(name) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 8, 256, 48);
    x.fillStyle = '#' + TEAM_COLORS[this.id % 4].toString(16).padStart(6, '0'); x.fillRect(0, 8, 8, 48);
    x.fillStyle = '#fff'; x.font = '22px "Press Start 2P", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name.toUpperCase().slice(0, 12), 132, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    sp.scale.set(1.6, 0.4, 1); sp.position.y = 2.45; sp.renderOrder = 20;
    return sp;
  }

  setState(s) {
    this.s = s; this.alive = s.alive; this.hp = s.hp; this.maxHp = s.mhp;
    if (s.w !== this.weapon && WEAPONS[s.w]) {
      if (this.gun) this.gun.parent.remove(this.gun);
      this.gun = buildWeapon(WEAPONS[s.w].model);
      this.gun.rotation.x = Math.PI / 2 + (WEAPONS[s.w].kind === 'melee' ? 0.3 : 0);
      this.gun.position.set(0, -0.62, 0.04);
      this.rig.armR.add(this.gun);
      this.weapon = s.w;
    }
  }

  update(dt) {
    const s = this.s, r = this.rig;
    if (!s) return;
    const k = Math.min(1, dt * 12);
    if (this.pos.distanceToSquared(V(s.p)) > 36) this.pos.set(...s.p);
    this.pos.x += (s.p[0] - this.pos.x) * k; this.pos.y += (s.p[1] - this.pos.y) * k; this.pos.z += (s.p[2] - this.pos.z) * k;
    let dy = s.yaw + Math.PI - r.root.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    r.root.rotation.y += dy * k;
    if (!s.alive) { r.body.rotation.x = -Math.PI / 2; r.body.position.y = 0.25; this.tag.visible = false; return; }
    r.body.rotation.x = s.sl ? -0.2 : 0; this.tag.visible = true;
    this.phase += dt * s.sp * 1.6;
    const t = this.phase, moving = s.sp > 0.5 && s.og, ck = s.ck, sprintK = Math.min(1, Math.max(0, (s.sp - 5.6) / 3));
    const amp = (0.55 + 0.4 * sprintK) * (1 - 0.5 * ck);
    let tl = 0, tr = 0, kl = 0.05, kr = 0.05, by = 0, lean = 0;
    if (moving) {
      tl = Math.sin(t) * amp; tr = -tl;
      kl = 0.1 + Math.max(0, -Math.cos(t)) * (0.9 + 0.5 * sprintK); kr = 0.1 + Math.max(0, Math.cos(t)) * (0.9 + 0.5 * sprintK);
      by = -0.02 + Math.abs(Math.cos(t)) * 0.06; lean = 0.22 * sprintK;
    }
    tl += -1.05 * ck; tr += -0.75 * ck; kl += 1.75 * ck; kr += 1.45 * ck; by += -0.36 * ck;
    if (s.sl) { tl = -1.45; kl = 0.25; tr = -0.55; kr = 1.9; by = -0.5; lean = -0.35; }
    else if (!s.og) { tl = -0.95; kl = 1.35; tr = -0.25; kr = 0.7; }
    r.legL.rotation.x = tl; r.legR.rotation.x = tr; r.kneeL.rotation.x = kl; r.kneeR.rotation.x = kr;
    r.body.position.y = by;
    const aim = -Math.PI / 2 - s.pitch;
    const w = WEAPONS[s.w];
    if (w && w.kind === 'melee') {
      const sw = s.sw ? Math.sin(s.sw * Math.PI) : 0;
      r.armR.rotation.set(aim + 0.6 - sw * 2.2, sw * 0.8, 0);
      r.armL.rotation.set(-0.3, 0, 0);
    } else {
      r.armR.rotation.set(aim, 0.1, 0);
      r.armL.rotation.set(aim + 0.1, -0.6, 0);
    }
    r.torso.rotation.x = -s.pitch * 0.2 + lean;
    r.neck.rotation.x = -s.pitch * 0.5;
  }

  // zombies on the host bite avatars; the damage is forwarded to that guest
  damage(amount) { this.net.sendTo(this.id, { t: 'dmg', a: Math.round(amount * 10) / 10 }); }

  remove() { this.scene.remove(this.rig.root); }
}

class Socket {
  constructor(url) { this.url = url; this.handlers = []; }
  open() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      this.ws = ws;
      const t = setTimeout(() => { reject(new Error('Could not reach the server')); ws.close(); }, 6000);
      ws.onopen = () => { clearTimeout(t); resolve(); };
      ws.onerror = () => { clearTimeout(t); reject(new Error('Could not reach the server')); };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onmessage?.(m); };
      ws.onclose = () => this.onclose?.();
    });
  }
  send(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { this.onclose = null; try { this.ws?.close(); } catch { /* already closed */ } }
}

export class Net {
  static async host(game, url, name) { return Net.open(game, url, { t: 'create', name }, 'host', name); }
  static async join(game, url, code, name) { return Net.open(game, url, { t: 'join', code, name }, 'client', name); }

  static async open(game, url, hello, role, name) {
    const sock = new Socket(url);
    await sock.open();
    return new Promise((resolve, reject) => {
      sock.onmessage = (m) => {
        if (m.t === 'error') { sock.close(); reject(new Error(m.msg)); return; }
        if (m.t === 'created' || m.t === 'joined') { const n = new Net(game, sock, role, m.id, m.code, name); n.hostName = m.host; resolve(n); }
      };
      sock.send(hello);
    });
  }

  constructor(game, sock, role, id, code, name) {
    this.game = game; this.sock = sock; this.role = role; this.id = id; this.code = code; this.name = name;
    this.avatars = new Map(); // id -> Avatar (everyone but me)
    this.names = new Map([[id, name]]);
    this.snapT = 0; this.stateT = 0; this.snapN = 0;
    this.fxQueue = []; this.evQueue = []; this.shots = [];
    this.structDirty = true;
    sock.onmessage = (m) => this.receive(m);
    sock.onclose = () => { this.game.hud.toast('DISCONNECTED FROM SERVER', 'bad'); this.game.leaveNet(); };
    if (role === 'host') this.installRecorder();
  }

  get isHost() { return this.role === 'host'; }
  send(m) { this.sock.send(this.isHost ? { to: 'all', m } : { m }); }
  sendTo(id, m) { this.sock.send({ to: id, m }); }

  leave() {
    this.sock.close();
    for (const a of this.avatars.values()) a.remove();
    this.avatars.clear();
    this.uninstallRecorder();
  }

  // ---------- host: record effects/sounds/banners so guests see and hear the host's simulation
  installRecorder() {
    const fx = this.game.effects, hud = this.game.hud;
    this.orig = {};
    let depth = 0;
    for (const name of FX) {
      const f = this.orig[name] = fx[name];
      fx[name] = (...a) => {
        if (depth === 0 && !fx.mute && this.fxQueue.length < 500) this.fxQueue.push([name, a.map(enc), fx.origin ?? -1]);
        depth++;
        try { return f.apply(fx, a); } finally { depth--; }
      };
    }
    setSfxHook((name, opts) => { if (!QUIET_SFX.has(name) && !fx.mute && this.fxQueue.length < 500) this.fxQueue.push(['sfx', [name, opts?.vol ?? 1], fx.origin ?? -1]); });
    this.origBanner = hud.banner;
    hud.banner = (...a) => { if (!fx.mute) this.fxQueue.push(['banner', a, -1]); return this.origBanner.apply(hud, a); };
  }

  uninstallRecorder() {
    if (!this.orig) return;
    const fx = this.game.effects;
    for (const [k, f] of Object.entries(this.orig)) fx[k] = f;
    this.game.hud.banner = this.origBanner;
    setSfxHook(null);
    this.orig = null;
  }

  // gameplay events guests must replay exactly (kills, revives...)
  event(name, data) { if (this.isHost) this.evQueue.push([name, data]); }

  phase(st, extra = {}) { if (this.isHost) this.send({ t: 'phase', st, day: this.game.day, diff: this.game.diff.id, ...extra }); }

  // ---------- host
  hostTick(dt) {
    const g = this.game;
    if (g.mode !== 'coop') return; // still in the lobby
    this.snapT += dt;
    if (this.snapT >= 1 / SNAP_HZ) { this.snapT = 0; this.sendSnapshot(); }
    // everyone down in the middle of a day = run over
    if (g.state === 'wave' && !g.player.alive && [...this.avatars.values()].every((a) => !a.alive)) g.gameOver('Everyone was eaten alive.');
  }

  sendSnapshot() {
    const g = this.game, zl = g.zombies.list;
    this.snapN++;
    const z = zl.map((o) => {
      const p = o.root.position;
      const fl = (o.slamT > 0 ? 1 : 0) | (o.windT > 0 ? 2 : 0) | (o.chargeT > 0 ? 4 : 0) | (o.leaping ? 8 : 0) | (o.screamAnim > 0 ? 16 : 0) | (o.spitAnim > 0 ? 32 : 0) | (o.state === 'down' ? 64 : 0);
      return [o.id, ZTYPES.indexOf(o.type), r2(p.x), r2(p.y), r2(p.z), r2(o.yaw), MODES.indexOf(o.animMode || 'walk'), fl, o.def.boss ? r2(Math.max(0, o.hp / o.maxHp)) : 0];
    });
    const me = g.player;
    const pl = [this.playerState(0, this.name)];
    for (const a of this.avatars.values()) if (a.s) pl.push({ ...a.s, id: a.id, n: a.name });
    const m = {
      t: 'snap', st: g.state, day: g.day, wave: g.wave || 0, wt: g.wavesTotal || 0, money: g.money, orph: Math.round(g.orphanageHp),
      earn: g.dayEarn || 0, left: g.zombies.aliveCount + (g.spawnQueue ? g.spawnQueue.length : 0), boss: g.boss && g.boss.state !== 'dead' ? g.boss.id : 0,
      tod: r2(g.world.timeOfDay ?? 0), rm: !!(g.diff.night && g.day % 5 === 0), z, pl, fx: this.fxQueue, ev: this.evQueue,
    };
    if (this.structDirty || this.snapN % 3 === 0) { m.s = g.structures.list.map((s) => [s.uid, s.id, r2(s.x), r2(s.z), s.rot, Math.round(s.hp)]); this.structDirty = false; }
    this.fxQueue = []; this.evQueue = [];
    void me;
    this.send(m);
  }

  onPeer(m) {
    const g = this.game;
    if (m.on) {
      const a = new Avatar(g.world.scene, m.id, m.name); a.net = this;
      this.avatars.set(m.id, a); this.names.set(m.id, m.name);
      g.hud.toast(`${m.name.toUpperCase()} JOINED`);
      // late joiners jump straight into the current run
      if (g.mode === 'coop') this.sendTo(m.id, { t: 'phase', st: g.state === 'wave' ? 'wave' : 'build', day: g.day, diff: g.diff.id, fresh: true });
    } else {
      const a = this.avatars.get(m.id);
      if (a) { a.remove(); this.avatars.delete(m.id); }
      this.names.delete(m.id);
      g.hud.toast(`${m.name.toUpperCase()} LEFT`, 'bad');
    }
    g.hud.updateLobby();
  }

  onGuestMsg(from, m) {
    const g = this.game, fx = g.effects;
    const a = this.avatars.get(from);
    switch (m.t) {
      case 'st':
        if (!a) return;
        a.setState(m);
        for (const [s0, s1, big] of m.shots || []) { fx.origin = from; fx.tracer(V(s0), V(s1)); fx.muzzle(V(s0), V(s1).sub(V(s0)).normalize(), 0xffc060, big); fx.origin = undefined; }
        if (m.snd) { fx.origin = from; sfx(m.snd, { vol: 0.7 }); fx.origin = undefined; }
        break;
      case 'hit': {
        const z = g.zombies.list.find((o) => o.id === m.id);
        if (!z) return;
        fx.origin = from;
        g.zombies.damage(z, m.dmg, { dir: new THREE.Vector3(m.dir[0], 0, m.dir[1]), part: m.part, knock: m.knock, source: m.src || 'player', dismember: m.dis, explosive: m.exp });
        fx.origin = undefined;
        if (m.src !== 'melee' && m.src !== 'kick') g.alertNearby(z.root.position, 10);
        break;
      }
      case 'boom': fx.origin = from; g.explode(V(m.p), m.r, m.dmg, { source: 'grenade', noPlayer: true, remote: true }); fx.origin = undefined; break;
      case 'spend': if (g.mode !== 'playground') g.money = Math.max(0, g.money - m.a); break;
      case 'earn': g.money += m.a; break;
      case 'place': {
        const def = g.structuresDef(m.id);
        if (!def || !g.structures.canPlace(m.id, m.x, m.z, m.rot)) return;
        const cost = Math.ceil(def.price / (def.count || 1));
        if (g.money < cost) { this.sendTo(from, { t: 'toast', msg: 'NOT ENOUGH MONEY', cls: 'bad' }); return; }
        g.money -= cost; g.structures.place(m.id, m.x, m.z, m.rot); this.structDirty = true; g.hud.refreshShop();
        break;
      }
      case 'sell': {
        const s = g.structures.list.find((o) => o.uid === m.uid);
        if (s) { g.money += g.structures.sell(s); this.structDirty = true; if (g.selected === s) { g.selected = null; g.hud.selectStructure(null); } g.hud.refreshShop(); }
        break;
      }
      case 'req': if (m.k === 'repair' || m.k === 'orphanage') { g.buy(m.k); this.structDirty = true; } break;
    }
  }

  // ---------- guest
  clientTick(dt) {
    if (this.game.mode !== 'coop') return;
    this.stateT += dt;
    if (this.stateT < 1 / STATE_HZ) return;
    this.stateT = 0;
    const m = this.playerState(this.id, this.name);
    m.t = 'st';
    if (this.shots.length) { m.shots = this.shots.splice(0, 12); m.snd = this.shotSound; this.shotSound = null; }
    this.send(m);
  }

  playerState(id, name) {
    const p = this.game.player, pos = p.pos;
    return {
      id, n: name, p: [r2(pos.x), r2(pos.y), r2(pos.z)], yaw: r2(p.yaw), pitch: r2(p.pitch), w: p.current,
      ck: r2(p.crouchK), sl: p.slideT > 0 ? 1 : 0, og: p.onGround ? 1 : 0, sp: r2(Math.hypot(p.vel.x, p.vel.z)),
      hp: Math.ceil(p.hp), mhp: p.maxHp, alive: p.alive, sw: p.swingT > 0 ? r2(p.swingT / p.swingDur) : 0,
    };
  }

  // my own shot, shown to everyone else
  localShot(from, to, big, sound) {
    if (this.isHost) return; // the host's shots are already recorded as effects
    if (this.shots.length < 24) this.shots.push([enc(from), enc(to), big]);
    this.shotSound = sound;
  }

  receive(m) {
    const g = this.game;
    if (this.isHost) {
      if (m.t === 'peer') return this.onPeer(m);
      if (m.from !== undefined) return this.onGuestMsg(m.from, m.m);
      return;
    }
    if (m.t === 'hostleft') { g.hud.toast('THE HOST LEFT THE GAME', 'bad'); g.leaveNet(); return; }
    switch (m.t) {
      case 'snap': if (g.mode === 'coop') this.applySnapshot(m); break;
      case 'phase': g.netPhase(m); break;
      case 'dmg': if (g.state === 'wave') g.player.damage(m.a); break;
      case 'toast': g.hud.toast(m.msg, m.cls); break;
    }
  }

  applySnapshot(m) {
    const g = this.game, fx = g.effects, zm = g.zombies;
    g.money = m.money; g.orphanageHp = m.orph; g.wave = m.wave; g.wavesTotal = m.wt; g.dayEarn = m.earn; g.netLeft = m.left;
    if (Math.abs((g.world.timeOfDay ?? -1) - m.tod) > 0.004) g.world.setTime(m.tod, m.rm);
    // effects & sounds (skip the ones I caused, I already saw them locally)
    for (const [name, args, origin] of m.fx) {
      if (origin === this.id) continue;
      if (name === 'sfx') sfx(args[0], { vol: args[1] });
      else if (name === 'banner') g.hud.banner(...args);
      else fx[name]?.(...args.map(dec));
    }
    const byId = new Map(zm.list.map((z) => [z.id, z]));
    for (const [name, d] of m.ev) {
      const z = byId.get(d.id);
      if (name === 'kill' && z && z.state !== 'dead') zm.kill(z, { dir: new THREE.Vector3(d.dir[0], 0, d.dir[1]), part: d.part, dismember: d.dis, explosive: d.exp, dmg: d.dmg, source: 'net', forceRevive: d.rev });
      else if (name === 'finish' && z && z.state === 'down') zm.finishCorpse(z);
      else if (name === 'revive' && z && z.state === 'down') zm.revive(z);
      else if (name === 'helmet' && z && z.rig.helmet?.parent) { z.helmetHp = 0; zm.detach(z, z.rig.helmet, new THREE.Vector3(d.dir[0], 0, d.dir[1]), 4, false); }
      else if (name === 'glob') zm.visualGlob(V(d.p), V(d.v), d.G, d.r);
      else if (name === 'toast') g.hud.toast(d.msg, d.cls);
    }
    // zombies
    const seen = new Set();
    for (const e of m.z) {
      const [id, ti, x, y, zz, yaw, mi, fl, bhp] = e;
      seen.add(id);
      let z = byId.get(id);
      if (!z) {
        if (fl & 64) continue; // a downed body we never saw alive
        z = zm.spawnPuppet(ZTYPES[ti], id, new THREE.Vector3(x, y, zz), yaw);
      }
      if (z.state === 'dead') continue;
      z.net = { x, y, z: zz, yaw };
      z.animMode = MODES[mi] || 'walk';
      z.slamT = fl & 1 ? 1 : 0; z.windT = fl & 2 ? 1 : 0; z.chargeT = fl & 4 ? 1 : 0; z.netLeap = !!(fl & 8);
      if (fl & 16) z.screamAnim = 0.3; if (fl & 32) z.spitAnim = 0.3;
      if (z.def.boss) { z.maxHp = 1; z.hp = bhp; }
    }
    for (const z of [...zm.list]) if (!seen.has(z.id)) zm.removePuppet(z);
    const boss = m.boss ? zm.list.find((z) => z.id === m.boss) : null;
    if (boss && g.boss !== boss) g.onNetBoss(boss);
    g.boss = boss;
    // teammates
    const present = new Set();
    for (const s of m.pl) {
      if (s.id === this.id) continue;
      present.add(s.id);
      let a = this.avatars.get(s.id);
      if (!a) { a = new Avatar(g.world.scene, s.id, s.n); this.avatars.set(s.id, a); this.names.set(s.id, s.n); }
      a.setState(s);
    }
    for (const [id, a] of this.avatars) if (!present.has(id)) { a.remove(); this.avatars.delete(id); }
    if (m.s) g.structures.applyNet(m.s);
  }

  update(dt) {
    for (const a of this.avatars.values()) a.update(dt);
    if (this.isHost) this.hostTick(dt); else this.clientTick(dt);
  }

  team() {
    const me = { id: this.id, name: this.name, hp: this.game.player.hp, maxHp: this.game.player.maxHp, alive: this.game.player.alive, me: true };
    return [me, ...[...this.avatars.values()].map((a) => ({ id: a.id, name: a.name, hp: a.hp, maxHp: a.maxHp, alive: a.alive }))].sort((a, b) => a.id - b.id);
  }
}
