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
    if (this.def.crawl) { this.rig.body.rotation.x = 1.25; this.rig.body.position.y = -0.55; }
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
      out[0][0].copy(p).addScaledVector(_v, 1.1 * s).setY(0.45 * s); out[0][1] = 0.27 * s;
      out[1][0].copy(p).addScaledVector(_v, 0.5 * s).setY(0.4 * s); out[1][1] = 0.4 * s;
      out[2][0].copy(p).addScaledVector(_v, -0.2 * s).setY(0.25 * s); out[2][1] = 0.3 * s;
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
  }

  clear() {
    for (const z of this.list) this.scene.remove(z.root);
    for (const z of this.corpses) { this.scene.remove(z.root); for (const d of z.detached) this.scene.remove(d.obj); }
    for (const c of this.chunks) this.scene.remove(c.obj);
    this.list = []; this.corpses = []; this.chunks = [];
  }

  spawn(type, scaling, pos) {
    const z = new Zombie(type, scaling, pos);
    this.scene.add(z.root);
    this.list.push(z);
    if (z.def.boss) { sfx('bossRoar'); this.game.onBossSpawn(z); }
    return z;
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
    if (part === 'head' && z.helmetHp > 0 && !explosive) {
      z.helmetHp -= amount;
      g.effects.sparks(hitPos, 6);
      sfx('helmet');
      if (z.helmetHp <= 0 && z.rig.helmet) this.detach(z, z.rig.helmet, dir, 4, false);
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

  kill(z, { dir, part, dismember, explosive, dmg, source }) {
    const g = this.game;
    dir = dir ? dir.clone() : new THREE.Vector3(0, 0, 1);
    dir.y = 0; if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    const overkill = dmg > z.maxHp * 0.8 || explosive;
    const headGone = (part === 'head' && (overkill || dmg >= 12 || dismember)) || (explosive && Math.random() < 0.5);
    const canRevive = z.def.revive && !z.revived && !headGone && !explosive;
    g.onZombieKilled(z, { headshot: part === 'head', source, revive: canRevive });

    z.state = canRevive ? 'down' : 'dead';
    z.deadT = 0;
    z.fallYaw = Math.atan2(dir.x, dir.z);
    z.fallAngle = 0;
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
      setTimeout(() => g.explode(z.root.position.clone(), e.radius, e.dmg * (g.scaling?.dmg ?? 1), { fromZombie: true, color: 0x9ab020 }), 60);
      z.root.visible = false;
      z.state = 'dead';
      for (let i = 0; i < 30; i++) g.effects.blood(hp, null, 2, 0x8a9a20);
    }
    if (z.def.boss) g.onBossKilled(z);
    if (z.state === 'dead') {
      this.list.splice(this.list.indexOf(z), 1);
      this.corpses.push(z);
      if (this.corpses.length > 45) this.removeCorpse(this.corpses[0]);
    }
  }

  finishCorpse(z) {
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

    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      const p = z.root.position;
      z.phase += dt;
      z.hitFlash = Math.max(0, z.hitFlash - dt);

      if (z.state === 'down') { this.updateDown(z, dt); continue; }

      z.groanT -= dt;
      if (z.groanT < 0) { z.groanT = 4 + Math.random() * 10; const d = p.distanceTo(pp); if (d < 30) sfx('groan', { vol: Math.max(0.15, 1 - d / 30) }); }

      // knockback velocity
      if (z.vel.lengthSq() > 0.001) {
        p.x += z.vel.x * dt; p.z += z.vel.z * dt;
        const damp = Math.max(0, 1 - 8 * dt); z.vel.x *= damp; z.vel.z *= damp;
      }
      if (z.stagger > 0) { z.stagger -= dt; this.animate(z, dt, 'stagger'); continue; }

      // choose goal
      let gx, gz, targetPlayer = false;
      const dxp = pp.x - p.x, dzp = pp.z - p.z, dp = Math.hypot(dxp, dzp);
      if (player.alive && (dp < z.aggro || (z.def.boss && dp < 25))) { gx = pp.x; gz = pp.z; targetPlayer = true; }
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
      for (const s of g.structures.list) {
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

      const spd = z.speed * z.slow * (p.z < WORLD.minZ ? 2.6 : 1);
      let mx = dx * spd * dt + sx * dt * 3, mz = dz * spd * dt + sz * dt * 3;

      // blocking structures (walls, towers)
      let blocker = null;
      const nx = p.x + mx, nz = p.z + mz;
      for (const s of g.structures.list) {
        if (s.def.type === 'trap' || s.dead) continue;
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
      p.x += mx; p.z += mz;
      this.collideWorld(z);

      // face movement
      const wantYaw = Math.atan2(dx, dz);
      let dy = wantYaw - z.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      z.yaw += dy * Math.min(1, dt * 6);
      z.root.rotation.y = z.yaw;

      // attacks
      z.attackT -= dt;
      let attacking = false;
      const reach = z.radius + (z.def.boss ? 1.5 : 0.55);
      if (targetPlayer && dp < reach + 0.35) {
        attacking = true;
        if (z.attackT <= 0) { z.attackT = 1 / z.def.rate; g.damagePlayer(z.dmg, z); }
      } else if (blocker) {
        attacking = true;
        if (z.attackT <= 0) { z.attackT = 1 / z.def.rate; g.structures.damage(blocker, z.dmg * (z.def.heavy ? 2.2 : 1.2), z); }
      } else if (p.z >= WORLD.doorZ - 0.1) {
        attacking = true;
        if (z.attackT <= 0) { z.attackT = 1 / z.def.rate; g.damageOrphanage(z.dmg, z); }
      }

      if (z.def.boss) this.bossUpdate(z, dt, dp);
      this.animate(z, dt, attacking ? 'attack' : 'walk', spd);
    }

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

  bossUpdate(z, dt, dp) {
    const g = this.game;
    z.bossT -= dt;
    if (z.bossT <= 0) {
      z.bossT = 9 + Math.random() * 4;
      if (dp < 9) {
        z.slamT = 0.6;
      } else {
        sfx('bossRoar');
        g.shake(0.4);
        const n = 3 + Math.floor(g.day / 5);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          g.spawnZombie(Math.random() < 0.3 ? 'runner' : 'walker', z.root.position.clone().add(new THREE.Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3 - 2)));
        }
      }
    }
    if (z.slamT > 0) {
      z.slamT -= dt;
      if (z.slamT <= 0) {
        const c = z.root.position.clone().addScaledVector(new THREE.Vector3(Math.sin(z.yaw), 0, Math.cos(z.yaw)), 2.5);
        g.effects.explosion(c, 3);
        g.effects.dust(c, 20);
        sfx('explosion'); g.shake(0.8);
        if (g.player.pos.distanceTo(c) < 5.5) { g.damagePlayer(z.dmg * 0.8, z); g.player.knock(new THREE.Vector3().subVectors(g.player.pos, c).setY(0).normalize(), 14); }
        for (const s of g.structures.list) if (!s.dead && Math.hypot(s.x - c.x, s.z - c.z) < 5.5) g.structures.damage(s, z.dmg * 3, z);
      }
    }
  }

  updateDown(z, dt) {
    this.updateFall(z, dt);
    z.reviveT -= dt;
    if (z.reviveT <= 0) {
      z.state = 'walk';
      z.revived = true;
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
