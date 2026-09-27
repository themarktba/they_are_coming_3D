import * as THREE from 'three';
import { PARTNERS, WORLD } from './config.js';
import { buildPartner, buildWeapon, box } from './models.js';
import { sfx } from './audio.js';

// formation slots around the player (world space, orphanage side)
const SLOTS = [[-3.2, -0.6], [3.2, -0.6], [-6, 0.8]]; // beside you, never between you and the camera

export class Partner {
  constructor(game, id, slot) {
    this.game = game;
    this.id = id;
    this.def = PARTNERS[id];
    this.slot = slot;
    this.rig = buildPartner(this.def);
    this.pos = this.rig.root.position;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.ammo = this.def.mag;
    this.cd = 0; this.reloadT = 0; this.phase = Math.random() * 6; this.yaw = 0; this.recoil = 0; this.deadT = 0;
    this.gun = buildWeapon(this.def.model);
    this.gun.rotation.x = Math.PI / 2; this.gun.position.set(0, -0.62, 0.04);
    this.rig.armR.add(this.gun);
    // name tag + health bar
    this.bar = new THREE.Group();
    this.bar.add(box(0.9, 0.1, 0.04, 0x222222, 0, 0, 0, { basic: true }));
    this.barFg = box(0.86, 0.06, 0.05, 0x5ad8ff, 0, 0, 0, { basic: true }); this.barFg.material = this.barFg.material.clone();
    this.bar.add(this.barFg);
    this.bar.traverse((o) => { o.castShadow = false; });
    this.bar.position.y = 2.25;
    this.rig.root.add(this.bar);
  }

  place() {
    const [ox, oz] = SLOTS[this.slot % SLOTS.length];
    this.pos.set(ox, 0, 6 + oz);
    this.yaw = Math.PI; this.rig.root.rotation.set(0, Math.PI, 0);
    this.rig.body.rotation.set(0, 0, 0); this.rig.body.position.set(0, 0, 0);
    this.ammo = this.def.mag; this.reloadT = 0;
  }

  damage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; this.deadT = 0;
      this.game.onPartnerDied(this);
    }
  }
}

export class PartnerManager {
  constructor(game) {
    this.game = game;
    this.scene = game.world.scene;
    this.list = [];
  }

  clear() { for (const p of this.list) this.scene.remove(p.rig.root); this.list = []; }

  hire(id) {
    const used = new Set(this.list.map((p) => p.slot));
    let slot = 0; while (used.has(slot)) slot++;
    const p = new Partner(this.game, id, slot);
    this.scene.add(p.rig.root);
    this.list.push(p);
    p.place();
    return p;
  }

  dismiss(p) { this.scene.remove(p.rig.root); this.list.splice(this.list.indexOf(p), 1); }

  // morning: survivors are patched up and take their positions
  resetForPhase() {
    for (const p of [...this.list]) { if (!p.alive) this.dismiss(p); else { p.hp = p.maxHp; p.place(); } }
  }

  get alive() { return this.list.filter((p) => p.alive); }

  update(dt, fighting) {
    const g = this.game, player = g.player;
    for (const p of [...this.list]) {
      const r = p.rig;
      p.phase += dt;
      if (!p.alive) {
        p.deadT += dt;
        const k = Math.min(1, p.deadT * 2);
        r.body.rotation.x = -k * Math.PI / 2; r.body.position.y = k * 0.25;
        p.bar.visible = false;
        continue;
      }
      p.bar.visible = p.hp < p.maxHp;
      if (p.bar.visible) {
        const f = p.hp / p.maxHp;
        p.barFg.scale.x = Math.max(0.01, f); p.barFg.position.x = -0.43 * (1 - f);
        p.bar.quaternion.copy(g.world.camera.quaternion).premultiply(r.root.quaternion.clone().invert());
      }

      // follow the player in formation
      let moving = false;
      if (fighting && player.alive) {
        const [ox, oz] = SLOTS[p.slot % SLOTS.length];
        const tx = Math.max(WORLD.minX + 1, Math.min(WORLD.maxX - 1, player.pos.x + ox)), tz = Math.min(WORLD.maxZ - 1, player.pos.z + oz);
        const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
        if (d > 1.2) {
          const sp = Math.min(d > 8 ? 7.5 : 5, d * 3);
          p.pos.x += (dx / d) * sp * dt; p.pos.z += (dz / d) * sp * dt;
          moving = true;
          p.walkYaw = Math.atan2(dx, dz);
        }
        this.collide(p);
      }

      // pick the nearest zombie in range and shoot it
      let target = null, best = p.def.range;
      if (fighting) for (const z of g.zombies.list) {
        if (!z.alive) continue;
        const d = Math.hypot(z.root.position.x - p.pos.x, z.root.position.z - p.pos.z);
        const score = d * (z.def.boss || z.def.heavy ? (p.id === 'marksman' ? 0.5 : 0.9) : 1);
        if (d < p.def.range && score < best) { best = score; target = z; }
      }
      const wantYaw = target ? Math.atan2(target.root.position.x - p.pos.x, target.root.position.z - p.pos.z) : moving ? p.walkYaw : p.yaw;
      let dy = wantYaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 8);
      r.root.rotation.y = p.yaw;

      p.cd -= dt; p.recoil = Math.max(0, p.recoil - dt * 6);
      if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) p.ammo = p.def.mag; }
      else if (target && p.cd <= 0 && Math.abs(dy) < 0.35) this.shoot(p, target);

      // medic patches up everyone nearby
      if (p.def.heal && fighting) {
        if (player.alive && player.hp < player.maxHp && player.pos.distanceTo(p.pos) < 7) {
          player.hp = Math.min(player.maxHp, player.hp + p.def.heal * dt);
          if (Math.random() < dt * 3) g.effects.text(player.pos.clone().setY(player.pos.y + 2.1), '+', 'heal');
        }
        for (const o of this.list) if (o !== p && o.alive && o.hp < o.maxHp && o.pos.distanceTo(p.pos) < 7) o.hp = Math.min(o.maxHp, o.hp + p.def.heal * dt);
      }

      // animation
      const s = Math.sin(p.phase * 9);
      r.legL.rotation.x = moving ? s * 0.6 : 0; r.legR.rotation.x = moving ? -s * 0.6 : 0;
      r.kneeL.rotation.x = moving ? 0.1 + Math.max(0, -Math.cos(p.phase * 9)) * 0.9 : 0.05;
      r.kneeR.rotation.x = moving ? 0.1 + Math.max(0, Math.cos(p.phase * 9)) * 0.9 : 0.05;
      r.body.position.y = moving ? Math.abs(Math.cos(p.phase * 9)) * 0.05 : 0;
      const aim = target ? -Math.PI / 2 : -0.9;
      r.armR.rotation.set(aim + p.recoil * 0.3, target ? 0.1 : 0.35, 0);
      r.armL.rotation.set(aim + 0.1 + (p.reloadT > 0 ? 0.8 : 0), target ? -0.6 : -0.75, 0);
    }
  }

  collide(p) {
    const r = 0.4;
    for (const c of this.game.world.colliders) {
      if (p.pos.x > c.minX - r && p.pos.x < c.maxX + r && p.pos.z > c.minZ - r && p.pos.z < c.maxZ + r) {
        const dl = p.pos.x - (c.minX - r), dr = (c.maxX + r) - p.pos.x, dn = p.pos.z - (c.minZ - r), df = (c.maxZ + r) - p.pos.z;
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) p.pos.x = c.minX - r; else if (m === dr) p.pos.x = c.maxX + r; else if (m === dn) p.pos.z = c.minZ - r; else p.pos.z = c.maxZ + r;
      }
    }
  }

  shoot(p, z) {
    const g = this.game, d = p.def;
    p.cd = 1 / d.rate;
    p.ammo--; if (p.ammo <= 0) p.reloadT = d.reload;
    p.recoil = 1;
    p.gun.updateWorldMatrix(true, true);
    const muzzle = p.gun.userData.muzzle.getWorldPosition(new THREE.Vector3());
    const aim = z.hitSpheres()[p.id === 'marksman' && Math.random() < 0.6 ? 0 : 1][0].clone();
    const dir = aim.sub(muzzle).normalize();
    for (let i = 0; i < d.pellets; i++) {
      const dd = dir.clone();
      dd.x += (Math.random() - 0.5) * d.spread * 2; dd.y += (Math.random() - 0.5) * d.spread * 2; dd.z += (Math.random() - 0.5) * d.spread * 2;
      dd.normalize();
      g.fireRay(muzzle, dd, d.range + 5, d.dmg * g.dmgMul, { pierce: d.pierce, source: 'partner', knock: d.pellets > 1 ? 2.5 : 0.8, tracerColor: 0xffe0a0 });
    }
    g.effects.muzzle(muzzle, dir, 0xffc060, d.pellets > 1 || d.dmg > 15);
    sfx(d.sound, { vol: 0.6 });
  }
}
