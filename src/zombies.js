import * as THREE from 'three';
import { ZOMBIES, WORLD } from './config.js';
import { buildZombie } from './models.js';
import { sfx } from './audio.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export class Zombie {
  constructor(type, scaling, pos) {
    this.type = type;
    this.def = ZOMBIES[type];
    this.rig = buildZombie(type, this.def);
    this.root = this.rig.root;
    this.scale = this.root.scale.x;
    this.root.position.copy(pos);
    this.maxHp = this.def.hp * scaling.hp;
    this.hp = this.maxHp;
    this.speed = this.def.speed * scaling.speed * (0.85 + Math.random() * 0.3);
    this.dmg = this.def.dmg * scaling.dmg;
    this.helmetHp = this.def.helmet ? this.def.helmet * scaling.hp : 0;
    this.radius = 0.38 * this.scale * (this.def.fat ? 1.3 : 1);
    this.state = 'walk';
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.phase = Math.random() * 10;
    this.attackT = Math.random();
    this.stagger = 0;
    this.slow = 1;
    this.revived = false;
    this.laneX = pos.x * 0.6 + (Math.random() - 0.5) * 6;
    this.aggro = 9 + Math.random() * 5;
    this.groanT = 2 + Math.random() * 8;
    this.hitFlash = 0;
    this.deadT = 0;
    this.detached = [];
    this.bossT = 5;
    this.vy = 0; this.leapCd = 1 + Math.random() * 2; this.leaping = false;
    this.spitCd = 1 + Math.random() * 2; this.screamT = 3 + Math.random() * 3; this.rageT = 0;
    this.chargeCd = 4; this.windT = 0; this.chargeT = 0; this.volleyCd = 4;
    if (this.def.crawl) { this.rig.body.rotation.x = 1.4; this.rig.body.position.y = 0.22; }
    this.meshes = [];
    this.root.traverse((o) => { if (o.isMesh) this.meshes.push(o); });
  }

  get alive() { return this.state !== 'dead' && this.state !== 'down'; }

  // approximate hit spheres in world space: [center, radius, part]
  hitSpheres() {
    const p = this.root.position, s = this.scale;
    const out = this._hs || (this._hs = [[new THREE.Vector3(), 0, 'head'], [new THREE.Vector3(), 0, 'body'], [new THREE.Vector3(), 0, 'legs']]);
    const fat = this.def.fat ? 1.35 : 1;
    if (this.state === 'down') {
      _v.set(Math.sin(this.fallYaw), 0, Math.cos(this.fallYaw));
      out[0][0].copy(p).addScaledVector(_v, 1.6 * s).setY(0.25 * s); out[0][1] = 0.28 * s;
      out[1][0].copy(p).addScaledVector(_v, 1.0 * s).setY(0.25 * s); out[1][1] = 0.45 * s;
      out[2][0].copy(p).addScaledVector(_v, 0.4 * s).setY(0.2 * s); out[2][1] = 0.35 * s;
      return out;
    }
    if (this.def.crawl) {
      _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      out[0][0].copy(p).addScaledVector(_v, 1.75 * s).setY(0.5 * s); out[0][1] = 0.28 * s;
      out[1][0].copy(p).addScaledVector(_v, 1.15 * s).setY(0.38 * s); out[1][1] = 0.42 * s;
      out[2][0].copy(p).addScaledVector(_v, 0.45 * s).setY(0.28 * s); out[2][1] = 0.32 * s;
      return out;
    }
    out[0][0].set(p.x, p.y + 1.83 * s, p.z); out[0][1] = 0.26 * s * (this.def.heavy ? 1.1 : 1);
    out[1][0].set(p.x, p.y + 1.25 * s, p.z); out[1][1] = 0.42 * s * fat;
    out[2][0].set(p.x, p.y + 0.5 * s, p.z); out[2][1] = 0.36 * s * fat;
    return out;
  }
}

export class ZombieManager {
  constructor(game) {
    this.game = game;
    this.scene = game.world.scene;
    this.list = [];
    this.corpses = [];
    this.chunks = [];
    this.globs = [];
    this.globGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.globMat = new THREE.MeshBasicMaterial({ color: 0xa8e030 });
  }

  clear() {
    for (const gl of this.globs) this.scene.remove(gl.mesh);
    this.globs = [];
    for (const z of this.list) { this.scene.remove(z.root); this.clearSlam(z); }
    for (const z of this.corpses) { this.scene.remove(z.root); for (const d of z.detached) this.scene.remove(d.obj); }
    for (const c of this.chunks) this.scene.remove(c.obj);
    this.list = []; this.corpses = []; this.chunks = [];
  }

  spawn(type, scaling, pos) {
    const z = new Zombie(type, scaling, pos);
    z.id = this.idSeq = (this.idSeq || 0) + 1;
    this.scene.add(z.root);
    this.list.push(z);
    if (z.def.boss) { sfx('bossRoar'); this.game.onBossSpawn(z); }
    return z;
  }

  // --- co-op guest: zombies are puppets of the host's simulation
  spawnPuppet(type, id, pos, yaw) {
    const z = new Zombie(type, { hp: 1, speed: 1, dmg: 1 }, pos);
    z.id = id; z.yaw = yaw; z.root.rotation.y = yaw;
    this.scene.add(z.root);
    this.list.push(z);
    return z;
  }

  removePuppet(z) {
    this.scene.remove(z.root); this.clearSlam(z);
    const i = this.list.indexOf(z); if (i >= 0) this.list.splice(i, 1);
  }

  updatePuppets(dt) {
    for (const z of [...this.list]) {
      z.phase += dt;
      z.hitFlash = Math.max(0, z.hitFlash - dt);
      if (z.state === 'down') { this.updateFall(z, dt); continue; }
      const n = z.net; if (!n) continue;
      const p = z.root.position;
      if (Math.hypot(n.x - p.x, n.z - p.z) > 6) p.set(n.x, n.y, n.z);
      const k = Math.min(1, dt * 10);
      p.x += (n.x - p.x) * k; p.y += (n.y - p.y) * k; p.z += (n.z - p.z) * k;
      let dy = n.yaw - z.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      z.yaw += dy * k; z.root.rotation.y = z.yaw;
      if (z.netLeap) { const r = z.rig; r.legL.rotation.x = -1.1; r.legR.rotation.x = -0.4; if (r.armL.parent) r.armL.rotation.x = -2.6; if (r.armR.parent) r.armR.rotation.x = -2.6; r.torso.rotation.x = 0.4; continue; }
      this.animate(z, dt, z.animMode || 'walk', z.def.speed);
    }
  }

  // acid glob a guest sees; the host decides who it hurts
  visualGlob(from, vel, G, radius) {
    const mesh = new THREE.Mesh(this.globGeo, this.globMat);
    mesh.position.copy(from); this.scene.add(mesh);
    this.globs.push({ mesh, vel, dmg: 0, radius, G, t: 0 });
  }

  // does a riot shield stop a hit coming along dir?
  shieldBlocks(z, dir, part, explosive) {
    return !!(z.def.shield && !explosive && part !== 'head' && dir && Math.sin(z.yaw) * dir.x + Math.cos(z.yaw) * dir.z < -0.35);
  }

  get aliveCount() { let n = 0; for (const z of this.list) if (z.state !== 'dead') n++; return n; }

  damage(z, amount, { dir, part = 'body', knock = 0, source = 'gun', dismember = false, explosive = false, silent = false } = {}) {
    if (z.state === 'dead') return false;
    const g = this.game;
    const hitPos = _v2.copy(z.root.position).setY(z.root.position.y + (part === 'head' ? 1.8 : part === 'legs' ? 0.5 : 1.2) * z.scale);
    if (z.state === 'down') {
      z.hp -= amount;
      g.effects.blood(hitPos, dir, 4);
      if (z.hp <= -z.maxHp * 0.3 || part === 'head' || explosive) { z.revived = true; this.finishCorpse(z); }
      return false;
    }
    // riot shield soaks hits from the front; flank them, go for the head, or use explosives
    if (this.shieldBlocks(z, dir, part, explosive)) {
      g.effects.sparks(hitPos, 5, 0xe0e0ff);
      sfx('helmet');
      if (source === 'kick' || knock > 5) { z.vel.x += dir.x * knock * 0.3; z.vel.z += dir.z * knock * 0.3; }
      z.hp -= amount * 0.1;
      if (z.hp <= 0) { this.kill(z, { dir, part, dismember, explosive, dmg: amount, source }); return true; }
      return 'blocked';
    }
    if (part === 'head' && z.helmetHp > 0 && !explosive) {
      z.helmetHp -= amount;
      g.effects.sparks(hitPos, 6);
      sfx('helmet');
      if (z.helmetHp <= 0 && z.rig.helmet) { this.detach(z, z.rig.helmet, dir, 4, false); g.net?.event('helmet', { id: z.id, dir: [dir?.x ?? 0, dir?.z ?? 1] }); }
      return false;
    }
    let dmg = amount;
    if (part === 'head') dmg *= z.def.boss ? 1.5 : 2.5;
    if (part === 'legs') dmg *= 0.8;
    z.hp -= dmg;
    z.hitFlash = 0.08;
    const heavy = z.def.heavy;
    if (knock && dir) {
      const k = heavy ? knock * (z.def.boss ? 0.05 : 0.25) : knock;
      z.vel.x += dir.x * k; z.vel.z += dir.z * k;
      if (knock > 2.5 && !z.def.boss) z.stagger = Math.max(z.stagger, heavy ? 0.2 : 0.35 + knock * 0.03);
    }
    if (!silent) {
      g.effects.blood(hitPos, dir, part === 'head' ? 10 : 5, z.def.fat ? 0x8a9a20 : 0x9a0f0f);
      sfx(part === 'head' ? 'headshot' : 'hit');
    }
    if (z.hp <= 0) {
      this.kill(z, { dir, part, dismember, explosive, dmg, source });
      return true;
    }
    return false;
  }

  // co-op: the host tells guests about the kill; its own effects are not mirrored (guests replay the kill)
  kill(z, opts) {
    const fx = this.game.effects;
    fx.mute++;
    try { this.killBody(z, opts); } finally { fx.mute--; }
    const d = opts.dir;
    this.game.net?.event('kill', { id: z.id, dir: [d?.x ?? 0, d?.z ?? 1], part: opts.part, dis: opts.dismember, exp: opts.explosive, dmg: opts.dmg, rev: z.state === 'down' });
  }

  killBody(z, { dir, part, dismember, explosive, dmg, source, forceRevive }) {
    const g = this.game;
    dir = dir ? dir.clone() : new THREE.Vector3(0, 0, 1);
    dir.y = 0; if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    const overkill = dmg > z.maxHp * 0.8 || explosive;
    const headGone = (part === 'head' && (overkill || dmg >= 12 || dismember)) || (explosive && Math.random() < 0.5);
    const canRevive = forceRevive ?? (z.def.revive && !z.revived && !headGone && !explosive);
    g.onZombieKilled(z, { headshot: part === 'head', source, revive: canRevive });

    z.state = canRevive ? 'down' : 'dead';
    z.deadT = 0;
    z.fallYaw = Math.atan2(dir.x, dir.z);
    z.fallAngle = 0;
    if (z.def.crawl) {
      // already prone: keep lying along the crawl direction instead of tipping over
      z.rig.body.rotation.set(0, 0, 0); z.rig.body.position.set(0, 0, 0);
      z.fallYaw = z.yaw; z.fallAngle = Math.PI / 2;
    }
    const force = explosive ? 9 : Math.min(7, 2 + dmg * 0.08);
    z.vel.set(dir.x * force, explosive ? 6 + Math.random() * 4 : 1.5, dir.z * force);
    if (z.def.heavy) z.vel.multiplyScalar(0.3);
    z.limbSpin = [0, 1, 2, 3].map(() => (Math.random() - 0.5) * 8);
    if (canRevive) { z.hp = z.maxHp * 0.3; z.reviveT = 3 + Math.random() * 1.5; }

    const hp = z.root.position.clone().setY(1.2 * z.scale);
    if (headGone && z.rig.head.parent) {
      this.detach(z, z.rig.head, dir, 5 + Math.random() * 3, true);
      g.effects.gib(hp.setY(1.8 * z.scale), dir, z.def.skin[0]);
    }
    if ((explosive || (dismember && Math.random() < 0.6)) && g.effects.gore) {
      const limbs = [z.rig.armL, z.rig.armR, explosive ? z.rig.legL : null].filter(Boolean);
      for (const l of limbs) if (Math.random() < (explosive ? 0.7 : 0.5)) this.detach(z, l, dir, 4 + Math.random() * 5, true);
    }
    g.effects.blood(hp, dir, overkill ? 24 : 12, z.def.fat ? 0x8a9a20 : 0x9a0f0f);
    g.effects.decal(z.root.position.x + dir.x, z.root.position.z + dir.z, 0.8 + Math.random() * 0.8 * z.scale, z.def.fat ? 0x4a5a10 : 0x5a0a0a);
    sfx('splat', { vol: z.def.heavy ? 1.5 : 1 });

    if (z.def.explode) {
      const e = z.def.explode;
      if (!g.isClient) setTimeout(() => g.state === 'wave' && g.explode(z.root.position.clone(), e.radius, e.dmg * (g.scaling?.dmg ?? 1), { fromZombie: true, color: 0x9ab020 }), 60);
      z.root.visible = false;
      z.state = 'dead';
      for (let i = 0; i < 30; i++) g.effects.blood(hp, null, 2, 0x8a9a20);
    }
    if (z.def.boss) { this.clearSlam(z); g.onBossKilled(z); }
    g.onZombieDrop?.(z);
    if (z.state === 'dead') {
      this.list.splice(this.list.indexOf(z), 1);
      this.corpses.push(z);
      if (this.corpses.length > 45) this.removeCorpse(this.corpses[0]);
    }
  }

  finishCorpse(z) {
    this.game.net?.event('finish', { id: z.id });
    this.game.effects.mute++;
    try { this.finishBody(z); } finally { this.game.effects.mute--; }
  }

  finishBody(z) {
    z.state = 'dead';
    const i = this.list.indexOf(z);
    if (i >= 0) this.list.splice(i, 1);
    this.corpses.push(z);
    this.game.effects.gib(z.root.position.clone().setY(0.4), new THREE.Vector3(0, 0, 1), z.def.skin[0]);
    this.game.onReviverFinished(z);
  }

  removeCorpse(z) {
    this.scene.remove(z.root);
    for (const d of z.detached) { this.scene.remove(d.obj); const ci = this.chunks.indexOf(d); if (ci >= 0) this.chunks.splice(ci, 1); }
    this.corpses.splice(this.corpses.indexOf(z), 1);
  }

  detach(z, obj, dir, force, bleed) {
    obj.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    obj.matrixWorld.decompose(wp, wq, ws);
    obj.parent.remove(obj);
    obj.position.copy(wp); obj.quaternion.copy(wq); obj.scale.copy(ws);
    this.scene.add(obj);
    const c = { obj, vel: new THREE.Vector3(dir.x * force + (Math.random() - 0.5) * 3, 3 + Math.random() * 4, dir.z * force + (Math.random() - 0.5) * 3), spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), t: 0, bleed: bleed ? 0.8 : 0, rest: false };
    this.chunks.push(c);
    z.detached.push(c);
    if (this.chunks.length > 80) { const old = this.chunks.shift(); this.scene.remove(old.obj); }
  }

  update(dt) {
    const g = this.game;
    const player = g.player;
    const pp = player.pos;
    const list = this.list;
    const targets = g.targets ? g.targets() : [player];
    this.updateGlobs(dt);
    if (g.isClient) { this.updatePuppets(dt); this.updateRemains(dt); return; }

    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      const p = z.root.position;
      z.phase += dt;
      z.hitFlash = Math.max(0, z.hitFlash - dt);

      if (z.state === 'down') { this.updateDown(z, dt); continue; }

      z.groanT -= dt;
      if (z.groanT < 0) { z.groanT = 4 + Math.random() * 10; const d = p.distanceTo(pp); if (d < 30) sfx('groan', { vol: Math.max(0.15, 1 - d / 30) }); }
      z.rageT = Math.max(0, z.rageT - dt);
      z.leapCd -= dt;

      // mid-leap: ballistic, ignores walls, lands on whatever is below (including platform decks)
      if (z.leaping) { this.updateLeap(z, dt, targets); continue; }

      // knockback velocity
      if (z.vel.lengthSq() > 0.001) {
        p.x += z.vel.x * dt; p.z += z.vel.z * dt;
        const damp = Math.max(0, 1 - 8 * dt); z.vel.x *= damp; z.vel.z *= damp;
      }
      if (z.stagger > 0) { z.stagger -= dt; this.animate(z, dt, 'stagger'); continue; }

      // choose goal: the nearest living survivor (you or an ally) if close enough, else the orphanage door
      let gx, gz, targetPlayer = false, tgt = null, dp = Infinity;
      for (const t of targets) { if (!t.alive) continue; const d = Math.hypot(t.pos.x - p.x, t.pos.z - p.z); if (d < dp) { dp = d; tgt = t; } }
      const aggroR = z.def.boss ? 25 : z.def.spit ? Math.max(z.aggro, z.def.spit.range + 2) : z.aggro * (z.rageT > 0 ? 1.6 : 1);
      if (tgt && dp < aggroR) { gx = tgt.pos.x; gz = tgt.pos.z; targetPlayer = true; }
      else {
        const lane = Math.max(-14, Math.min(14, z.laneX));
        const k = Math.min(1, Math.max(0, (p.z - WORLD.minZ) / (WORLD.doorZ - WORLD.minZ)));
        gx = lane * (1 - k * 0.4); gz = WORLD.doorZ + 1;
      }
      let dx = gx - p.x, dz = gz - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      dx /= dist; dz /= dist;

      // separation
      let sx = 0, sz = 0;
      for (let j = 0; j < list.length; j++) {
        if (j === i) continue;
        const o = list[j]; if (o.state === 'down') continue;
        const ox = p.x - o.root.position.x, oz = p.z - o.root.position.z;
        const r = z.radius + o.radius;
        const d2 = ox * ox + oz * oz;
        if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); const f = (r - d) / r; sx += (ox / d) * f; sz += (oz / d) * f; }
      }

      z.slow = 1;
      // traps affect
      for (const s of [...g.structures.list]) {
        if (s.def.type !== 'trap' || s.dead) continue;
        if (p.x > s.minX - z.radius && p.x < s.maxX + z.radius && p.z > s.minZ - z.radius && p.z < s.maxZ + z.radius) {
          if (s.id === 'claymore') continue;
          z.slow = Math.min(z.slow, 1 - s.def.slow * (z.def.heavy ? 0.5 : 1));
          const d = s.def.dps * dt;
          this.damage(z, d, { silent: true, source: 'trap' });
          g.structures.damage(s, d * 0.6);
          if (Math.random() < dt * 4) g.effects.blood(p.clone().setY(0.4), null, 2);
          if (!z.alive) break;
        }
      }
      if (z.state === 'dead') { i--; continue; }
      if (z.state === 'down') continue;

      let spd = z.speed * z.slow * (p.z < WORLD.minZ ? 2.6 : 1) * (z.slamT > 0 || z.windT > 0 ? 0 : 1) * (z.rageT > 0 ? 1.5 : 1);
      // spitters keep their distance and lob acid
      if (z.def.spit && targetPlayer && dp < z.def.spit.range) {
        if (dp < z.def.spit.range * 0.7) spd = 0;
        z.spitCd -= dt;
        if (z.spitCd <= 0) { z.spitCd = z.def.spit.cd * (0.8 + Math.random() * 0.4); this.spit(z, tgt.pos, z.def.spit.dmg * (g.scaling?.dmg ?? 1), z.def.spit.radius); z.spitAnim = 0.4; }
      }
      // screamers enrage everything around them
      if (z.def.scream) {
        z.screamT -= dt;
        if (z.screamT <= 0 && dp < 24) {
          z.screamT = 7 + Math.random() * 3; z.screamAnim = 0.8;
          sfx('scream');
          g.effects.shockwave(p.clone().setY(1.6), 10, 0xff6040);
          g.effects.text(p.clone().setY(2.4), 'SCREEEAM!', 'warn');
          for (const o of list) if (o !== z && o.root.position.distanceToSquared(p) < 144) { o.rageT = 5; o.aggro = Math.max(o.aggro, 18); }
        }
      }
      // leapers jump at you, and over your walls
      if (z.def.leap && z.leapCd <= 0 && targetPlayer && dp > 2.5 && dp < 8 && z.slow > 0.6) { this.startLeap(z, gx, gz, tgt.pos.y); continue; }
      let mx = dx * spd * dt + sx * dt * 3, mz = dz * spd * dt + sz * dt * 3;

      // blocking structures (walls, towers, platforms)
      let blocker = null;
      const nx = p.x + mx, nz = p.z + mz;
      for (const s of g.structures.list) {
        if (s.def.type === 'trap' || s.dead) continue;
        if (p.y >= s.def.h - 0.3) continue; // standing on top of it
        const r = z.radius;
        if (nx > s.minX - r && nx < s.maxX + r && nz > s.minZ - r && nz < s.maxZ + r) {
          blocker = s;
          // push out along the smaller overlap axis
          const ox = Math.min(nx - (s.minX - r), (s.maxX + r) - nx);
          const oz = Math.min(nz - (s.minZ - r), (s.maxZ + r) - nz);
          if (ox < oz) mx = 0; else mz = 0;
          // slide sideways a bit if the wall is narrow
          if (!targetPlayer && oz <= ox) mx += Math.sign(p.x - (s.minX + s.maxX) / 2 || 1) * spd * dt * 0.15;
        }
      }
      if (z.def.leap && blocker && z.leapCd <= 0) { this.startLeap(z, p.x + dx * 4.5, p.z + dz * 4.5, 0); continue; }
      if (z.chargeT > 0) blocker = null;
      p.x += mx; p.z += mz;
      this.collideWorld(z);
      this.applyGravity(z, dt);

      // face movement
      const wantYaw = Math.atan2(dx, dz);
      let dy = wantYaw - z.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      z.yaw += dy * Math.min(1, dt * 6);
      z.root.rotation.y = z.yaw;

      // attacks
      z.attackT -= dt;
      let attacking = false;
      const reach = z.radius + (z.def.boss ? 1.5 : 0.55);
      // you are out of reach up on a platform (unless it's something huge)
      const canReach = tgt && Math.abs(tgt.pos.y - p.y) < (z.def.boss ? 4 : 1.2 * z.scale);
      if (targetPlayer && dp < reach + 0.35 && canReach) {
        attacking = true;
        if (z.attackT <= 0) { z.attackT = 1 / z.def.rate; g.damageTarget(tgt, z.dmg, z); }
      } else if (blocker) {
        attacking = true;
        if (z.attackT <= 0) { z.attackT = 1 / z.def.rate; g.structures.damage(blocker, z.dmg * (z.def.heavy ? 2.2 : 1.2), z); }
      } else if (p.z >= WORLD.doorZ - 0.1) {
        attacking = true;
        if (z.attackT <= 0) { z.attackT = 1 / z.def.rate; g.damageOrphanage(z.dmg, z); }
      }

      if (z.def.boss) this.bossUpdate(z, dt, dp, tgt);
      this.animate(z, dt, attacking ? 'attack' : 'walk', spd);
    }
    this.updateRemains(dt);
  }

  updateRemains(dt) {
    const g = this.game;
    for (let i = this.corpses.length - 1; i >= 0; i--) this.updateCorpse(this.corpses[i], dt);
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.t += dt;
      if (!c.rest) {
        c.vel.y -= 20 * dt;
        c.obj.position.addScaledVector(c.vel, dt);
        c.obj.rotation.x += c.spin.x * dt; c.obj.rotation.y += c.spin.y * dt; c.obj.rotation.z += c.spin.z * dt;
        if (c.obj.position.y < 0.12) {
          c.obj.position.y = 0.12;
          if (Math.abs(c.vel.y) < 2) { c.rest = true; }
          c.vel.y = -c.vel.y * 0.3; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.4);
          g.effects.decal(c.obj.position.x, c.obj.position.z, 0.5, 0x5a0a0a);
        }
      }
      if (c.bleed > 0 && g.effects.gore) { c.bleed -= dt; if (Math.random() < 0.5) g.effects.blood(c.obj.position, null, 1); }
      if (c.t > 14) { c.obj.position.y -= dt * 0.3; if (c.t > 17) { this.scene.remove(c.obj); this.chunks.splice(i, 1); } }
    }
  }

  collideWorld(z) {
    const p = z.root.position;
    for (const c of this.game.world.colliders) {
      if (c.car) continue;
      const r = z.radius;
      if (p.x > c.minX - r && p.x < c.maxX + r && p.z > c.minZ - r && p.z < c.maxZ + r) {
        const dl = p.x - (c.minX - r), dr = (c.maxX + r) - p.x, dn = p.z - (c.minZ - r), df = (c.maxZ + r) - p.z;
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) p.x = c.minX - r; else if (m === dr) p.x = c.maxX + r; else if (m === dn) p.z = c.minZ - r; else p.z = c.maxZ + r;
      }
    }
    p.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, p.x));
    p.z = Math.min(WORLD.doorZ, p.z);
  }

  // zombies stand on platform decks they've landed on and drop off the edges
  groundFor(z) {
    const p = z.root.position;
    let h = 0;
    for (const s of this.game.structures.list) if (s.def.type === 'platform' && p.y >= s.def.h - 0.35 && p.x > s.minX && p.x < s.maxX && p.z > s.minZ && p.z < s.maxZ) h = Math.max(h, s.def.h);
    return h;
  }

  applyGravity(z, dt) {
    const p = z.root.position;
    const gh = this.groundFor(z);
    if (p.y > gh + 0.001) { z.vy -= 20 * dt; p.y = Math.max(gh, p.y + z.vy * dt); if (p.y <= gh) z.vy = 0; }
    else { p.y = gh; z.vy = 0; }
  }

  startLeap(z, tx, tz, ty) {
    const p = z.root.position;
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
    const T = 0.75;
    z.leaping = true; z.leapCd = 3.5 + Math.random() * 1.5;
    z.vy = (Math.max(0, ty - p.y) + 0.5 * 20 * T * T) / T;
    const hs = Math.min(13, d / T);
    z.leapVel = new THREE.Vector3((dx / d) * hs, 0, (dz / d) * hs);
    z.yaw = Math.atan2(dx, dz); z.root.rotation.y = z.yaw;
    sfx('swing');
    this.game.effects.dust(p.clone().setY(0.1), 5);
  }

  updateLeap(z, dt, targets) {
    const p = z.root.position, r = z.rig;
    p.x += z.leapVel.x * dt; p.z += z.leapVel.z * dt;
    z.vy -= 20 * dt; p.y += z.vy * dt;
    this.collideWorld(z);
    r.legL.rotation.x = -1.1; r.legR.rotation.x = -0.4;
    if (r.armL.parent) r.armL.rotation.x = -2.6; if (r.armR.parent) r.armR.rotation.x = -2.6;
    r.torso.rotation.x = 0.4;
    const gh = this.groundFor(z);
    if (z.vy < 0 && p.y <= gh) {
      p.y = gh; z.vy = 0; z.leaping = false;
      this.game.effects.dust(p.clone().setY(gh + 0.1), 6);
      // pounce: land on someone and bite straight away
      for (const t of targets) if (t.alive && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 1.3 && Math.abs(t.pos.y - p.y) < 1.2) { this.game.damageTarget(t, z.dmg * 1.3, z); z.attackT = 1 / z.def.rate; break; }
    }
  }

  // acid glob on a ballistic arc toward a point
  spit(z, target, dmg, radius) {
    const from = z.root.position.clone().setY(z.root.position.y + 1.75 * z.scale);
    const to = target.clone().setY(target.y + 0.5);
    to.x += (Math.random() - 0.5) * 1.2; to.z += (Math.random() - 0.5) * 1.2;
    const d = Math.hypot(to.x - from.x, to.z - from.z), T = Math.max(0.5, d / 13), G = 14;
    const vel = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y + 0.5 * G * T * T) / T, (to.z - from.z) / T);
    const mesh = new THREE.Mesh(this.globGeo, this.globMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.globs.push({ mesh, vel, dmg, radius, G, t: 0 });
    this.game.net?.event('glob', { p: [from.x, from.y, from.z], v: [vel.x, vel.y, vel.z], G, r: radius });
    sfx('spit');
  }

  updateGlobs(dt) {
    const g = this.game;
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const gl = this.globs[i], p = gl.mesh.position;
      gl.t += dt;
      gl.vel.y -= gl.G * dt;
      p.addScaledVector(gl.vel, dt);
      gl.mesh.rotation.x += dt * 8; gl.mesh.rotation.y += dt * 6;
      if (Math.random() < 0.5) { g.effects.mute++; g.effects.blood(p, null, 1, 0x9ad030); g.effects.mute--; }
      const wall = g.structures.solidAt(p.x, p.y, p.z);
      if (p.y > 0.12 && !wall && gl.t < 4) continue;
      this.scene.remove(gl.mesh); this.globs.splice(i, 1);
      g.effects.mute++; // guests simulate the splash themselves
      g.effects.blood(p, null, 14, 0xa8e030);
      g.effects.decal(p.x, p.z, gl.radius * 0.9, 0x4a6a10);
      sfx('splat');
      g.effects.mute--;
      if (g.isClient) continue;
      if (wall) g.structures.damage(wall, gl.dmg);
      if (g.state !== 'wave') continue;
      for (const t of (g.targets ? g.targets() : [g.player])) {
        if (!t.alive) continue;
        const d = Math.hypot(t.pos.x - p.x, t.pos.z - p.z);
        if (d < gl.radius && Math.abs(t.pos.y - p.y) < 2.2) g.damageTarget(t, gl.dmg * (1 - 0.5 * d / gl.radius), null);
      }
    }
  }

  bossUpdate(z, dt, dp, tgt) {
    const g = this.game;
    const d = z.def;
    z.bossT -= dt;
    z.summonT = (z.summonT ?? 7) - dt;
    if (d.summon && z.summonT <= 0 && g.state === 'wave' && this.aliveCount < 70) {
      z.summonT = (d.volley ? 10 : 12) + Math.random() * 4;
      sfx('bossRoar');
      g.shake(0.4);
      const n = 3 + Math.floor(g.day / 5);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const type = d.summon[Math.floor(Math.random() * d.summon.length)];
        g.spawnZombie(type, z.root.position.clone().setY(0).add(new THREE.Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3 - 2)));
      }
    }
    if (d.volley && tgt && tgt.alive) {
      z.volleyCd -= dt;
      if (z.volleyCd <= 0 && dp < 32) {
        z.volleyCd = 4.5 + Math.random() * 1.5; z.spitAnim = 0.6;
        for (let k = 0; k < 5; k++) setTimeout(() => { if (z.state !== 'dead' && g.state === 'wave') this.spit(z, tgt.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5)), 16 * (g.scaling?.dmg ?? 1), 2.2); }, k * 120);
      }
    }
    if (d.charge) this.chargeUpdate(z, dt, dp, tgt);
    if (d.slam && z.bossT <= 0 && dp < 10 && !(z.slamT > 0)) {
      z.bossT = 5 + Math.random() * 2.5;
      z.slamT = 1.1;
      z.slamC = z.root.position.clone().addScaledVector(new THREE.Vector3(Math.sin(z.yaw), 0, Math.cos(z.yaw)), 2.5);
      const ring = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.2, depthWrite: false }));
      ring.position.copy(z.slamC).setY(0.12);
      this.scene.add(ring);
      z.slamRing = ring;
      sfx('groan', { vol: 1 });
    }
    if (z.slamT > 0) {
      z.slamT -= dt;
      const k = 1 - z.slamT / 1.1;
      z.slamRing.material.opacity = 0.15 + 0.4 * k * (0.7 + 0.3 * Math.sin(k * 40));
      z.slamRing.scale.setScalar(0.3 + 0.7 * Math.min(1, k * 1.5));
      if (z.slamT <= 0) {
        this.clearSlam(z);
        const c = z.slamC;
        g.effects.explosion(c, 3);
        g.effects.dust(c, 20);
        sfx('explosion'); g.shake(0.8);
        for (const t of g.targets()) if (t.alive && t.pos.distanceTo(c) < 5.5) { g.damageTarget(t, z.dmg * 0.8, z); if (t === g.player) g.player.knock(new THREE.Vector3().subVectors(g.player.pos, c).setY(0).normalize(), 14); }
        for (const s of [...g.structures.list]) if (!s.dead && Math.hypot(s.x - c.x, s.z - c.z) < 5.5) g.structures.damage(s, z.dmg * 3, z);
      }
    }
  }

  // the Butcher: telegraphed bull rush that smashes through barricades
  chargeUpdate(z, dt, dp, tgt) {
    const g = this.game, p = z.root.position;
    z.chargeCd -= dt;
    if (z.windT <= 0 && z.chargeT <= 0 && z.chargeCd <= 0 && tgt && tgt.alive && dp > 5 && dp < 32) {
      z.windT = 0.9;
      sfx('bossRoar');
      g.effects.text(p.clone().setY(3.2 * z.scale), 'CHARGE!', 'warn');
    }
    if (z.windT > 0) {
      z.windT -= dt;
      if (tgt) { z.chargeDir = new THREE.Vector3(tgt.pos.x - p.x, 0, tgt.pos.z - p.z).normalize(); z.yaw = Math.atan2(z.chargeDir.x, z.chargeDir.z); z.root.rotation.y = z.yaw; }
      if (z.windT <= 0) { z.chargeT = 1.3; z.hitSet = new Set(); g.shake(0.4); }
      return;
    }
    if (z.chargeT > 0) {
      z.chargeT -= dt;
      p.x += z.chargeDir.x * 13 * dt; p.z += z.chargeDir.z * 13 * dt;
      this.collideWorld(z);
      if (Math.random() < 0.6) g.effects.dust(p.clone().setY(0.2), 2);
      for (const s of [...g.structures.list]) {
        if (s.dead || s.def.type === 'trap' || z.hitSet.has(s)) continue;
        if (p.x > s.minX - 1.2 && p.x < s.maxX + 1.2 && p.z > s.minZ - 1.2 && p.z < s.maxZ + 1.2) { z.hitSet.add(s); g.structures.damage(s, 260 * (g.scaling?.dmg ?? 1), z); g.shake(0.5); }
      }
      for (const t of g.targets()) {
        if (!t.alive || z.hitSet.has(t)) continue;
        if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 2.2 && t.pos.y - p.y < 2) {
          z.hitSet.add(t); g.damageTarget(t, z.dmg * 0.9, z);
          if (t === g.player) g.player.knock(z.chargeDir, 16);
          g.shake(0.8);
        }
      }
      if (z.chargeT <= 0) { z.chargeCd = 6 + Math.random() * 2; z.stagger = 0.8; }
    }
  }

  clearSlam(z) {
    if (z.slamRing) { this.scene.remove(z.slamRing); z.slamRing.geometry.dispose(); z.slamRing.material.dispose(); z.slamRing = null; }
    z.slamT = 0;
  }

  updateDown(z, dt) {
    this.updateFall(z, dt);
    z.reviveT -= dt;
    if (z.reviveT <= 0) {
      this.game.net?.event('revive', { id: z.id });
      this.game.effects.mute++;
      try { this.revive(z); } finally { this.game.effects.mute--; }
    }
  }

  revive(z) {
    {
      z.state = 'walk';
      z.revived = true;
      z.hp = Math.max(z.hp, z.maxHp * 0.3);
      z.root.quaternion.setFromAxisAngle(UP, z.yaw);
      z.rig.body.rotation.set(0, 0, 0);
      z.root.position.y = 0;
      for (const l of [z.rig.armL, z.rig.armR, z.rig.legL, z.rig.legR]) l.rotation.set(0, 0, 0);
      this.game.effects.dust(z.root.position.clone().setY(0.2), 8);
      sfx('groan', { vol: 1 });
      this.game.effects.text(z.root.position.clone().setY(2.2), 'IT GOT UP!', 'warn');
    }
  }

  updateFall(z, dt) {
    const p = z.root.position;
    z.deadT += dt;
    z.vel.y -= 20 * dt;
    p.addScaledVector(z.vel, dt);
    const lying = z.fallAngle >= Math.PI / 2 - 0.01;
    if (p.y <= 0) {
      p.y = 0;
      if (z.vel.y < -3 && !lying) z.vel.y = -z.vel.y * 0.2; else z.vel.y = 0;
      const f = Math.max(0, 1 - 6 * dt); z.vel.x *= f; z.vel.z *= f;
    }
    z.fallAngle = Math.min(Math.PI / 2, z.fallAngle + dt * (2.5 + z.fallAngle * 5));
    _v.set(Math.cos(z.fallYaw), 0, -Math.sin(z.fallYaw));
    _q.setFromAxisAngle(_v, z.fallAngle);
    _q2.setFromAxisAngle(UP, z.yaw);
    z.root.quaternion.copy(_q).multiply(_q2);
    const damp = Math.max(0, 1 - z.deadT * 1.2);
    const r = z.rig;
    if (r.armL.parent === r.torso) r.armL.rotation.x += z.limbSpin[0] * dt * damp;
    if (r.armR.parent === r.torso) r.armR.rotation.x += z.limbSpin[1] * dt * damp;
    if (r.legL.parent) r.legL.rotation.x += z.limbSpin[2] * dt * damp * 0.4;
    if (r.legR.parent) r.legR.rotation.x += z.limbSpin[3] * dt * damp * 0.4;
    if (r.head.parent) r.neck.rotation.x = Math.min(0.6, r.neck.rotation.x + dt * 2);
  }

  updateCorpse(z, dt) {
    this.updateFall(z, dt);
    if (z.deadT > 10) {
      z.root.position.y -= dt * 0.25;
      if (z.deadT > 14) this.removeCorpse(z);
    }
  }

  animate(z, dt, mode, spd = 1) {
    const r = z.rig, t = z.phase;
    z.animMode = mode;
    const flash = z.hitFlash > 0;
    if (flash !== z._flashOn) {
      z._flashOn = flash;
      r.body.position.x = flash ? 0.04 : 0;
    }
    if (z.def.crawl) {
      const s = Math.sin(t * 5);
      if (r.armL.parent) r.armL.rotation.x = -2.4 + s * 0.7;
      if (r.armR.parent) r.armR.rotation.x = -2.4 - s * 0.7;
      r.legL.rotation.x = 0.1 + s * 0.15; r.legR.rotation.x = 0.1 - s * 0.15;
      r.neck.rotation.x = -1.0;
      r.body.rotation.z = s * 0.06;
      r.body.position.y = 0.22 + Math.abs(s) * 0.04;
      return;
    }
    if (z.slamT > 0) {
      r.armL.rotation.x = -2.9; r.armR.rotation.x = -2.9; r.torso.rotation.x = -0.25; r.neck.rotation.x = -0.4;
      r.legL.rotation.x = 0; r.legR.rotation.x = 0;
      return;
    }
    if (z.windT > 0) {
      r.torso.rotation.x = 0.55; r.neck.rotation.x = -0.5; r.armR.rotation.x = -2.6; r.armL.rotation.x = -0.4;
      r.legL.rotation.x = -0.5; r.legR.rotation.x = 0.5;
      return;
    }
    if (z.chargeT > 0) {
      const s = Math.sin(t * 16);
      r.torso.rotation.x = 0.6; r.legL.rotation.x = s * 1.1; r.legR.rotation.x = -s * 1.1;
      r.armR.rotation.x = -1.4 + s * 0.4; r.armL.rotation.x = -1.4 - s * 0.4;
      return;
    }
    if ((z.screamAnim = Math.max(0, (z.screamAnim || 0) - dt)) > 0) {
      r.torso.rotation.x = -0.3; r.neck.rotation.x = -0.7; r.neck.rotation.z = Math.sin(t * 40) * 0.08;
      if (r.armL.parent) r.armL.rotation.x = -2.8; if (r.armR.parent) r.armR.rotation.x = -2.8;
      return;
    }
    if ((z.spitAnim = Math.max(0, (z.spitAnim || 0) - dt)) > 0) {
      r.torso.rotation.x = -0.25 + (0.4 - Math.min(0.4, z.spitAnim)) * 1.2; r.neck.rotation.x = -0.4;
      if (r.armL.parent) r.armL.rotation.x = -0.6; if (r.armR.parent) r.armR.rotation.x = -0.6;
      r.legL.rotation.x = 0; r.legR.rotation.x = 0;
      return;
    }
    if (mode === 'stagger') {
      r.body.rotation.x = -0.35; r.armL.rotation.x = -0.5; r.armR.rotation.x = -0.4; r.neck.rotation.x = -0.4;
      return;
    }
    r.body.rotation.x = 0;
    if (mode === 'attack') {
      const s = Math.sin(t * 9 * z.def.rate);
      if (r.armL.parent) r.armL.rotation.x = -1.9 + s * 0.8;
      if (r.armR.parent) r.armR.rotation.x = -1.9 - s * 0.8;
      r.torso.rotation.x = 0.25 + s * 0.08;
      r.legL.rotation.x = 0; r.legR.rotation.x = 0;
      r.neck.rotation.x = 0.1;
      return;
    }
    const f = z.type === 'runner' ? 13 : 5.5 * Math.max(0.6, spd / 1.4) / Math.sqrt(z.scale);
    const s = Math.sin(t * f);
    const amp = z.type === 'runner' ? 0.9 : 0.5;
    r.legL.rotation.x = s * amp; r.legR.rotation.x = -s * amp;
    if (z.type === 'runner') {
      if (r.armL.parent) r.armL.rotation.x = -s * 1.1 - 0.3;
      if (r.armR.parent) r.armR.rotation.x = s * 1.1 - 0.3;
      r.torso.rotation.x = 0.35;
    } else {
      if (r.armL.parent) r.armL.rotation.x = -1.5 + Math.sin(t * 2.3) * 0.12;
      if (r.armR.parent) r.armR.rotation.x = -1.45 + Math.sin(t * 2.1 + 1) * 0.12;
      r.torso.rotation.z = Math.sin(t * f * 0.5) * 0.08;
      r.torso.rotation.x = 0.1;
    }
    r.neck.rotation.z = Math.sin(t * 1.3) * 0.25;
    r.body.position.y = Math.abs(Math.cos(t * f)) * 0.05;
  }
}
