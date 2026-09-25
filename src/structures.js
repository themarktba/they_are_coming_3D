import * as THREE from 'three';
import { STRUCTURES, WORLD } from './config.js';
import { buildStructure, box } from './models.js';
import { sfx } from './audio.js';

const CHIP = { wood: 0x8a5a2c, roadblock: 0xd6281c, sandbag: 0xc9b27f, concrete: 0xb8b8b0, steel: 0x6a6e76, wire: 0x9a9a9a, spikes: 0x9a6a38, claymore: 0x4a5a2a, sentry: 0x4a5a3a, tower: 0x7a4e24 };
const METAL = new Set(['steel', 'roadblock', 'sentry', 'wire', 'claymore']);

export class StructureManager {
  constructor(game) {
    this.game = game;
    this.scene = game.world.scene;
    this.list = [];
    this.ghost = null;
  }

  clear() { for (const s of this.list) this.scene.remove(s.obj); this.list = []; this.clearGhost(); }

  footprint(id, x, z, rot) {
    const d = STRUCTURES[id];
    const swap = rot % 2 === 1;
    const hw = (swap ? d.d : d.w) / 2, hd = (swap ? d.w : d.d) / 2;
    return { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
  }

  canPlace(id, x, z, rot) {
    const f = this.footprint(id, x, z, rot);
    if (f.minX < WORLD.minX || f.maxX > WORLD.maxX || f.minZ < WORLD.buildMinZ || f.maxZ > WORLD.buildMaxZ) return false;
    const overlap = (a, b, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
    for (const s of this.list) if (!s.dead && overlap(f, s, 0.05)) return false;
    for (const c of this.game.world.colliders) if (overlap(f, c, 0.2)) return false;
    return true;
  }

  place(id, x, z, rot) {
    const def = STRUCTURES[id];
    const obj = buildStructure(id);
    obj.position.set(x, 0, z);
    obj.rotation.y = rot * Math.PI / 2;
    this.scene.add(obj);
    const bar = new THREE.Group();
    const bg = box(1.2, 0.12, 0.05, 0x222222, 0, 0, 0, { basic: true }); bg.castShadow = false;
    const fg = box(1.16, 0.08, 0.06, 0x5ad85a, 0, 0, 0, { basic: true }); fg.material = fg.material.clone(); fg.castShadow = false;
    bar.add(bg); bar.add(fg); bar.position.set(x, def.h + 0.5, z); bar.visible = false;
    this.scene.add(bar);
    const s = { id, def, obj, x, z, rot, hp: def.hp, maxHp: def.hp, dead: false, cd: 0, bar, barFg: fg, shakeT: 0, ...this.footprint(id, x, z, rot) };
    this.list.push(s);
    this.game.effects.dust(new THREE.Vector3(x, 0.2, z), 10);
    sfx('place');
    return s;
  }

  damage(s, amount) {
    if (s.dead) return;
    s.hp -= amount;
    s.shakeT = 0.15;
    if (s.def.type !== 'trap') {
      sfx(METAL.has(s.id) ? 'metal' : 'wood');
      if (Math.random() < 0.5) this.game.effects.splinters(new THREE.Vector3(s.x, s.def.h * 0.6, s.z), CHIP[s.id], 3);
    }
    if (s.hp <= 0) this.destroy(s);
  }

  destroy(s) {
    s.dead = true;
    this.scene.remove(s.obj); this.scene.remove(s.bar);
    const i = this.list.indexOf(s); if (i >= 0) this.list.splice(i, 1);
    this.game.effects.splinters(new THREE.Vector3(s.x, s.def.h * 0.5, s.z), CHIP[s.id], 18);
    this.game.effects.dust(new THREE.Vector3(s.x, 0.3, s.z), 14);
    if (s.id !== 'claymore') { sfx('break'); this.game.onStructureDestroyed(s); }
  }

  repairCost() {
    let c = 0;
    for (const s of this.list) c += Math.ceil((1 - s.hp / s.maxHp) * s.def.price * 0.5);
    return c;
  }

  repairAll() { for (const s of this.list) { s.hp = s.maxHp; s.bar.visible = false; } }

  sell(s) {
    const refund = Math.floor(s.def.price * 0.5 * (s.hp / s.maxHp) / (s.def.count || 1));
    this.destroyQuiet(s);
    return refund;
  }

  destroyQuiet(s) {
    s.dead = true; this.scene.remove(s.obj); this.scene.remove(s.bar);
    const i = this.list.indexOf(s); if (i >= 0) this.list.splice(i, 1);
  }

  at(x, z) {
    for (const s of this.list) if (x > s.minX - 0.3 && x < s.maxX + 0.3 && z > s.minZ - 0.3 && z < s.maxZ + 0.3) return s;
    return null;
  }

  // --- ghost preview for build mode
  setGhost(id) {
    this.clearGhost();
    if (!id) return;
    const g = buildStructure(id);
    g.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.45, depthWrite: false }); o.castShadow = false; } });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.25, depthWrite: false }));
    ring.position.y = 0.05; g.add(ring); g.userData.ring = ring;
    if (STRUCTURES[id].range) {
      const r = STRUCTURES[id].range;
      const rr = new THREE.Mesh(new THREE.RingGeometry(r - 0.15, r, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
      rr.position.y = 0.06; g.add(rr);
    }
    this.ghost = { id, obj: g, rot: 0 };
    this.scene.add(g);
  }

  updateGhost(x, z) {
    if (!this.ghost) return false;
    const g = this.ghost;
    x = Math.round(x * 2) / 2; z = Math.round(z * 2) / 2;
    g.x = x; g.z = z;
    g.obj.position.set(x, 0, z);
    g.obj.rotation.y = g.rot * Math.PI / 2;
    const def = STRUCTURES[g.id];
    g.obj.userData.ring.scale.set(def.w, 1, def.d);
    const ok = this.canPlace(g.id, x, z, g.rot);
    const col = ok ? 0x40ff60 : 0xff3030;
    g.obj.traverse((o) => { if (o.isMesh) o.material.color.setHex(o.geometry.type === 'RingGeometry' ? 0xffffff : col); });
    g.ok = ok;
    return ok;
  }

  clearGhost() { if (this.ghost) { this.scene.remove(this.ghost.obj); this.ghost = null; } }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (s.shakeT > 0) { s.shakeT -= dt; s.obj.position.x = s.x + (Math.random() - 0.5) * 0.08; } else s.obj.position.x = s.x;
      const frac = s.hp / s.maxHp;
      s.bar.visible = frac < 0.999 && s.id !== 'claymore';
      if (s.bar.visible) {
        s.barFg.scale.x = 1.16 * Math.max(0.01, frac); s.barFg.position.x = -0.58 * (1 - frac);
        s.barFg.material.color.setHex(frac > 0.5 ? 0x5ad85a : frac > 0.25 ? 0xffc93c : 0xff3b3b);
        s.bar.quaternion.copy(g.world.camera.quaternion);
      }
      if (!g.waveActive) continue;
      if (s.id === 'claymore') this.updateClaymore(s, dt);
      else if (s.def.type === 'tower') this.updateTower(s, dt);
    }
  }

  updateClaymore(s, dt) {
    const g = this.game;
    const led = s.obj.userData.led;
    if (led) led.visible = Math.floor(performance.now() / 400) % 2 === 0;
    const fx = -Math.sin(s.rot * Math.PI / 2), fz = -Math.cos(s.rot * Math.PI / 2);
    for (const z of g.zombies.list) {
      if (!z.alive) continue;
      const dx = z.root.position.x - s.x, dz = z.root.position.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < s.def.radius * 0.55 && (dx * fx + dz * fz) > -0.5) {
        this.destroyQuiet(s);
        sfx('beep');
        g.explode(new THREE.Vector3(s.x + fx * 1.5, 0.4, s.z + fz * 1.5), s.def.radius, s.def.dmg, { source: 'trap', noPlayer: false });
        return;
      }
    }
  }

  updateTower(s, dt) {
    const g = this.game;
    s.cd -= dt;
    let best = null, bd = s.def.range;
    for (const z of g.zombies.list) {
      if (!z.alive) continue;
      const d = Math.hypot(z.root.position.x - s.x, z.root.position.z - s.z);
      if (d < bd) { bd = d; best = z; }
    }
    const head = s.obj.userData.head;
    if (!best) return;
    const tp = best.root.position;
    const yaw = Math.atan2(tp.x - s.x, tp.z - s.z) - s.obj.rotation.y;
    if (s.id === 'sentry') head.rotation.y = yaw + Math.PI; else head.rotation.y = yaw;
    if (s.cd <= 0) {
      s.cd = 1 / s.def.rate;
      head.updateMatrixWorld(true);
      const mz = s.obj.userData.muzzle.getWorldPosition(new THREE.Vector3());
      const aim = best.hitSpheres()[s.id === 'tower' && Math.random() < 0.5 ? 0 : 1][0].clone();
      aim.x += (Math.random() - 0.5) * 0.2; aim.y += (Math.random() - 0.5) * 0.2;
      const dir = aim.clone().sub(mz).normalize();
      g.fireRay(mz, dir, s.def.range + 5, s.def.dmg, { pierce: s.def.pierce || 0, source: 'tower', knock: s.id === 'tower' ? 3 : 0.4, tracerColor: s.id === 'tower' ? 0xfff0c0 : 0xffd060 });
      g.effects.muzzle(mz, dir, 0xffc060, s.id === 'tower');
      sfx(s.id === 'tower' ? 'tower' : 'turret');
    }
  }
}
