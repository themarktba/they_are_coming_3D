import * as THREE from 'three';
import { WEAPONS, GRENADE, WORLD, PLAYER_HP, ARMOR } from './config.js';
import { buildPlayer, buildWeapon, box } from './models.js';
import { sfx } from './audio.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class Player {
  constructor(game) {
    this.game = game;
    this.scene = game.world.scene;
    this.camera = game.world.camera;
    this.rig = buildPlayer();
    this.scene.add(this.rig.root);
    this.pos = this.rig.root.position;
    this.vel = new THREE.Vector3();
    this.knockVel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.view = 'tps';
    this.radius = 0.4;
    this.grenadeList = [];

    this.viewmodel = new THREE.Group();
    this.camera.add(this.viewmodel);
    const limb = (group, to) => {
      const sleeve = box(0.11, 0.11, to.length(), 0x3f6db3, to.x / 2, to.y / 2, to.z / 2);
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().normalize());
      group.add(sleeve);
      group.add(box(0.1, 0.1, 0.12, 0xe0b48c, 0, 0, 0));
    };
    this.vmArm = new THREE.Group(); limb(this.vmArm, new THREE.Vector3(0.22, -0.42, 0.55));
    this.vmArmL = new THREE.Group(); limb(this.vmArmL, new THREE.Vector3(-0.3, -0.45, 0.6));
    this.viewmodel.add(this.vmArm);
    this.viewmodel.add(this.vmArmL);
    this.viewmodel.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
    this.reset();
  }

  reset() {
    this.maxHp = PLAYER_HP;
    this.hp = this.maxHp;
    this.armor = 0;
    this.alive = true;
    this.owned = ['pistol', 'knife'];
    this.ammo = { pistol: WEAPONS.pistol.mag };
    this.current = 'pistol';
    this.grenades = 1;
    this.spawn();
    this.equip('pistol', true);
  }

  spawn() {
    this.pos.set(0, 0, 6);
    this.vel.set(0, 0, 0); this.knockVel.set(0, 0, 0);
    this.yaw = 0; this.pitch = -0.05;
    this.hp = this.maxHp;
    this.alive = true;
    this.stamina = 100;
    this.reloadT = 0; this.cd = 0; this.spin = 0; this.swingT = 0; this.kickT = 0; this.kickAnim = 0;
    this.recoil = 0; this.bob = 0; this.zoom = false; this.victory = false;
    this.rig.root.rotation.set(0, Math.PI, 0);
    this.rig.body.rotation.set(0, 0, 0);
    this.rig.root.position.y = 0;
    for (const g of this.grenadeList) this.scene.remove(g.obj);
    this.grenadeList = [];
  }

  get weapon() { return WEAPONS[this.current]; }
  get armorReduce() { return ARMOR[this.armor].reduce; }

  give(id) {
    if (!this.owned.includes(id)) this.owned.push(id);
    const w = WEAPONS[id];
    if (w.kind === 'gun') this.ammo[id] = w.mag;
    this.owned.sort((a, b) => (WEAPONS[a].slot - WEAPONS[b].slot) || (WEAPONS[a].price - WEAPONS[b].price));
    this.equip(id);
  }

  equip(id, silent) {
    if (!this.owned.includes(id)) return;
    this.current = id;
    this.reloadT = 0; this.spin = 0; this.zoom = false;
    this.cd = Math.max(this.cd, 0.25);
    this.swapAnim = 1;
    // TPS model weapon
    if (this.heldTps) this.heldTps.parent.remove(this.heldTps);
    this.heldTps = buildWeapon(this.weapon.model);
    this.heldTps.rotation.x = Math.PI / 2;
    this.heldTps.position.set(0, -0.62, 0.04);
    this.rig.armR.add(this.heldTps);
    // FPS viewmodel weapon
    if (this.heldFps) this.vmArm.remove(this.heldFps);
    this.heldFps = buildWeapon(this.weapon.model);
    this.heldFps.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
    this.heldFps.position.set(0, 0.03, 0);
    this.heldFps.rotation.y = Math.PI;
    this.vmArm.add(this.heldFps);
    if (!silent) sfx('click');
    this.game.hud?.updateWeapons();
  }

  cycle(dir) {
    const i = this.owned.indexOf(this.current);
    this.equip(this.owned[(i + dir + this.owned.length) % this.owned.length]);
  }

  setView(v) {
    this.view = v;
    this.game.hud?.toast(v === 'fps' ? 'FIRST PERSON' : 'THIRD PERSON');
  }

  forward(out = _v) { return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion); }

  damage(amount) {
    if (!this.alive || (this.game.mode === 'playground' && this.game.godMode)) return;
    const d = amount * (1 - this.armorReduce);
    this.hp -= d;
    this.regenDelay = 4;
    this.game.world.hurt = Math.min(1.2, this.game.world.hurt + 0.25 + d / 40);
    this.game.shake(0.25);
    sfx('hurt');
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  }

  knock(dir, force) { this.knockVel.x += dir.x * force; this.knockVel.z += dir.z * force; }

  die() {
    this.alive = false;
    this.deathT = 0;
    this.game.onPlayerDied();
  }

  update(dt, input, active) {
    const g = this.game;
    if (!this.alive) { this.updateDead(dt); this.updateCamera(dt); return; }

    // look
    if (input.canLook && active) {
      const sens = 0.0022 * input.sensitivity * (this.zoom ? 0.3 : 1);
      this.yaw -= input.mouse.dx * sens;
      this.pitch -= input.mouse.dy * sens;
      this.pitch = Math.max(-1.35, Math.min(1.3, this.pitch));
    }

    // move
    let mx = 0, mz = 0;
    if (active) {
      if (input.down('KeyW') || input.down('ArrowUp')) mz -= 1;
      if (input.down('KeyS') || input.down('ArrowDown')) mz += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
      mx += input.touch.mx; mz += input.touch.my;
    }
    const len = Math.hypot(mx, mz);
    const moving = len > 0.15;
    let sprint = active && input.down('ShiftLeft') && moving && this.stamina > 0 && mz < 0;
    if (sprint) this.stamina = Math.max(0, this.stamina - 28 * dt); else this.stamina = Math.min(100, this.stamina + 18 * dt);
    const w = this.weapon;
    const speed = (sprint ? 8.6 : 5.4) * (w.moveMul && this.spin > 0.1 ? w.moveMul : 1) * (this.zoom ? 0.5 : 1);
    if (len > 1) { mx /= len; mz /= len; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const wx = mx * c + mz * s, wz = -mx * s + mz * c;
    const accel = this.grounded() ? 14 : 4;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, accel * dt);
    if (active && input.hit('Space') && this.grounded()) { this.vel.y = 6.5; }
    this.vel.y -= 20 * dt;
    this.pos.x += (this.vel.x + this.knockVel.x) * dt;
    this.pos.z += (this.vel.z + this.knockVel.z) * dt;
    this.pos.y += this.vel.y * dt;
    this.knockVel.multiplyScalar(Math.max(0, 1 - 6 * dt));
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; }
    this.collide();

    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * hspeed * 1.6;
    if (hspeed > 1 && this.grounded()) sfx('step');

    this.regenDelay = (this.regenDelay || 0) - dt;
    if (this.regenDelay <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 4 * dt);

    // weapon actions
    this.cd -= dt; this.kickT -= dt; this.swapAnim = Math.max(0, (this.swapAnim || 0) - dt * 4);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    if (active) this.handleWeapons(dt, input, sprint);

    this.updateGrenades(dt);
    this.updateModel(dt, hspeed);
    this.updateCamera(dt);
  }

  grounded() { return this.pos.y <= 0.001; }

  collide() {
    const p = this.pos, r = this.radius;
    p.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, p.x));
    p.z = Math.max(WORLD.minZ, Math.min(WORLD.maxZ, p.z));
    const boxes = [...this.game.world.colliders];
    for (const s of this.game.structures.list) if (s.def.type !== 'trap') boxes.push(s);
    for (const c of boxes) {
      const h = c.def ? c.def.h : 3;
      if (p.y > h - 0.2) continue;
      if (p.x > c.minX - r && p.x < c.maxX + r && p.z > c.minZ - r && p.z < c.maxZ + r) {
        const dl = p.x - (c.minX - r), dr = (c.maxX + r) - p.x, dn = p.z - (c.minZ - r), df = (c.maxZ + r) - p.z;
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) p.x = c.minX - r; else if (m === dr) p.x = c.maxX + r; else if (m === dn) p.z = c.minZ - r; else p.z = c.maxZ + r;
      }
    }
  }

  handleWeapons(dt, input, sprint) {
    const g = this.game;
    for (let i = 0; i < 9; i++) if (input.hit('Digit' + (i + 1)) && this.owned[i]) this.equip(this.owned[i]);
    if (input.mouse.wheel) this.cycle(input.mouse.wheel > 0 ? 1 : -1);
    if (input.hit('KeyQ')) this.cycle(1);
    if (input.hit('KeyF')) this.kick();
    if (input.hit('KeyG')) this.throwGrenade();

    const w = this.weapon;
    if (w.kind === 'gun') {
      if (input.hit('KeyR') && this.ammo[this.current] < w.mag && this.reloadT <= 0) this.startReload();
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) { this.ammo[this.current] = w.mag; sfx('reloadDone'); g.hud.updateAmmo(); }
        this.zoom = false;
        return;
      }
      this.zoom = !!w.zoom && input.mouse.right;
      const firing = input.mouse.left && !sprint;
      if (w.spin) {
        this.spin = firing || input.mouse.right ? Math.min(1, this.spin + dt / w.spin) : Math.max(0, this.spin - dt / w.spin);
        if (this.heldFps.userData.spinner) { this.heldFps.userData.spinner.rotation.z += this.spin * dt * 40; this.heldTps.userData.spinner.rotation.z += this.spin * dt * 40; }
        if (this.spin > 0.05 && Math.random() < 0.4) sfx('chainsaw');
      }
      if (firing && this.cd <= 0 && (!w.spin || this.spin >= 1)) {
        if (this.ammo[this.current] <= 0) { if (input.mouse.leftPressed) sfx('empty'); this.startReload(); return; }
        this.fire(w);
      }
    } else {
      // melee
      if (w.continuous) {
        const on = input.mouse.left && !sprint;
        this.sawing = on;
        if (on) {
          sfx('chainsaw');
          if (this.cd <= 0) { this.cd = 0.1; this.meleeHit(w, w.dmg * 0.1, true); }
        }
      } else if (input.mouse.left && this.cd <= 0 && !sprint) {
        this.cd = 1 / w.rate;
        this.swingT = 1;
        sfx(this.current === 'saber' ? 'saber' : 'swing');
        setTimeout(() => { if (this.alive && this.weapon === w && g.state === 'wave' && !g.paused) this.meleeHit(w, w.dmg, false); }, 110);
      }
    }
  }

  startReload() {
    const w = this.weapon;
    if (w.kind !== 'gun' || this.reloadT > 0) return;
    this.reloadT = w.reload;
    sfx('reload');
    this.game.hud.updateAmmo();
  }

  aimRay() {
    const cam = this.camera;
    const origin = cam.position.clone();
    const dir = this.forward(new THREE.Vector3());
    if (this.view === 'tps') {
      const pivot = _v2.copy(this.pos).setY(this.pos.y + 1.6);
      const adv = Math.max(0, pivot.sub(origin).dot(dir));
      origin.addScaledVector(dir, adv);
    }
    return { origin, dir };
  }

  muzzleWorld() {
    const held = this.view === 'fps' ? this.heldFps : this.heldTps;
    held.updateWorldMatrix(true, true);
    return held.userData.muzzle.getWorldPosition(new THREE.Vector3());
  }

  fire(w) {
    const g = this.game;
    this.cd = 1 / (w.rate * g.rateMul);
    this.ammo[this.current]--;
    const { origin, dir } = this.aimRay();
    const muzzle = this.muzzleWorld();
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
    const spreadBase = (this.zoom ? 0 : w.spread) * (moving ? 1.6 : 1) * (this.grounded() ? 1 : 2);
    const right = _v.set(1, 0, 0).applyQuaternion(this.camera.quaternion).clone();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    for (let i = 0; i < w.pellets; i++) {
      const d = dir.clone();
      if (spreadBase > 0) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spreadBase;
        d.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      }
      g.fireRay(origin, d, w.range, w.dmg * g.dmgMul, { pierce: w.pierce, knock: w.knock ?? (w.dmg > 10 ? 2 : 0.6), source: 'player', tracerFrom: muzzle, tracerColor: 0xffe9a0 });
    }
    g.effects.muzzle(muzzle, dir, 0xffc060, w.pellets > 1 || w.dmg > 15);
    sfx(w.sound);
    this.recoil = Math.min(1, this.recoil + (w.shake * 1.2));
    this.pitch += w.shake * 0.04 * (this.zoom ? 0.3 : 1);
    this.yaw += (Math.random() - 0.5) * w.shake * 0.02;
    g.shake(w.shake * 0.3);
    g.hud.updateAmmo();
    g.alertNearby(this.pos, 18);
  }

  meleeHit(w, dmg, continuous) {
    const g = this.game;
    const fwd = _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let hitAny = false;
    for (const z of [...g.zombies.list]) {
      if (!z.alive && z.state !== 'down') continue;
      const dx = z.root.position.x - this.pos.x, dz = z.root.position.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + z.radius) continue;
      const cos = (dx * fwd.x + dz * fwd.z) / (d || 1);
      if (cos < Math.cos(w.arc / 2) && d > 0.8) continue;
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      const part = this.pitch > 0.05 || z.def.crawl ? 'head' : 'body';
      g.zombies.damage(z, dmg * g.dmgMul, { dir, part: z.state === 'down' ? 'head' : part, knock: w.knock, source: 'melee', dismember: w.dismember });
      hitAny = true;
      if (!w.dismember && !continuous) g.shake(0.15);
    }
    if (hitAny) { if (!continuous) sfx('hit'); g.hitStop(continuous ? 0 : 0.035); }
  }

  kick() {
    if (this.kickT > 0) return;
    this.kickT = 0.85; this.kickAnim = 1;
    sfx('swing');
    const g = this.game;
    const fwd = _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).clone();
    setTimeout(() => {
      if (g.state !== 'wave' || g.paused) return;
      let hit = false;
      for (const z of [...g.zombies.list]) {
        if (!z.alive) continue;
        const dx = z.root.position.x - this.pos.x, dz = z.root.position.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.3 + z.radius) continue;
        if ((dx * fwd.x + dz * fwd.z) / (d || 1) < 0.35) continue;
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        g.zombies.damage(z, 6 * g.dmgMul, { dir, knock: 11, source: 'kick' });
        hit = true;
      }
      if (hit) { sfx('kick'); g.shake(0.3); g.hitStop(0.05); }
    }, 90);
  }

  throwGrenade() {
    if (this.grenades <= 0) { sfx('deny'); this.game.hud.toast('NO GRENADES'); return; }
    this.grenades--;
    sfx('pin');
    const obj = buildWeapon('grenade');
    const { dir } = this.aimRay();
    const start = this.camera.position.clone().addScaledVector(dir, 0.6);
    if (this.view === 'tps') start.copy(this.pos).setY(this.pos.y + 1.6).addScaledVector(dir, 0.6);
    obj.position.copy(start);
    this.scene.add(obj);
    const v = dir.clone().multiplyScalar(17); v.y += 4;
    this.grenadeList.push({ obj, vel: v, t: GRENADE.fuse });
    this.game.hud.updateAmmo();
  }

  updateGrenades(dt) {
    for (let i = this.grenadeList.length - 1; i >= 0; i--) {
      const gr = this.grenadeList[i];
      gr.t -= dt;
      gr.vel.y -= 20 * dt;
      gr.obj.position.addScaledVector(gr.vel, dt);
      gr.obj.rotation.x += dt * 10;
      if (gr.obj.position.y < 0.1) { gr.obj.position.y = 0.1; gr.vel.y = -gr.vel.y * 0.35; gr.vel.x *= 0.6; gr.vel.z *= 0.6; if (Math.abs(gr.vel.y) > 1) sfx('metal'); }
      if (gr.t <= 0) {
        this.scene.remove(gr.obj);
        this.grenadeList.splice(i, 1);
        this.game.explode(gr.obj.position.clone(), GRENADE.radius, GRENADE.dmg * this.game.dmgMul, { source: 'grenade' });
      }
    }
  }

  updateModel(dt, hspeed) {
    const r = this.rig;
    r.root.rotation.y = this.yaw + Math.PI;
    const t = this.bob;
    const moving = hspeed > 0.5;
    r.legL.rotation.x = moving ? Math.sin(t) * 0.8 : 0;
    r.legR.rotation.x = moving ? -Math.sin(t) * 0.8 : 0;
    if (!this.grounded()) { r.legL.rotation.x = -0.6; r.legR.rotation.x = 0.3; }
    const w = this.weapon;
    if (this.victory) {
      const t = performance.now() / 1000;
      r.armR.rotation.set(-2.9 + Math.sin(t * 6) * 0.15, 0, 0.15);
      r.armL.rotation.set(-0.2, 0, -0.1);
      r.torso.rotation.x = -0.1; r.neck.rotation.x = -0.3;
      r.body.position.y = Math.abs(Math.sin(t * 3)) * 0.12;
      return;
    }
    const aim = -Math.PI / 2 - this.pitch;
    if (w.kind === 'gun') {
      r.armR.rotation.set(aim + this.recoil * 0.3, 0, 0);
      r.armL.rotation.set(aim + 0.1, 0, 0);
      r.armL.rotation.y = -0.6; r.armL.rotation.z = 0;
      r.armR.rotation.y = 0.1;
    } else {
      const sw = this.swingT > 0 ? Math.sin((1 - this.swingT) * Math.PI) : 0;
      const saw = this.sawing ? Math.sin(performance.now() / 30) * 0.05 : 0;
      r.armR.rotation.set(aim + 0.6 - sw * 2.2 + saw, sw * 1.2, 0);
      r.armL.rotation.set(-0.3 + (moving ? -Math.sin(t) * 0.5 : 0), 0, 0);
    }
    this.swingT = Math.max(0, this.swingT - dt * 3.5);
    this.kickAnim = Math.max(0, this.kickAnim - dt * 4);
    if (this.kickAnim > 0) r.legR.rotation.x = -Math.sin(this.kickAnim * Math.PI) * 1.6;
    r.torso.rotation.x = -this.pitch * 0.2;
    r.neck.rotation.x = -this.pitch * 0.5;
    r.body.position.y = moving ? Math.abs(Math.cos(t)) * 0.06 : 0;
    const saber = this.heldTps.userData.blade;
    if (saber) saber.material.opacity = 0.3 + Math.random() * 0.12;
  }

  updateCamera(dt) {
    const cam = this.camera, g = this.game;
    const fov = this.zoom ? 18 : 72;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix(); }
    const shake = g.shakeAmt || 0;
    const sx = (Math.random() - 0.5) * shake * 0.25, sy = (Math.random() - 0.5) * shake * 0.25;

    if (!this.alive) {
      const a = this.deathT * 0.25;
      cam.position.set(this.pos.x + Math.sin(a) * 7, 4 + Math.min(4, this.deathT), this.pos.z + Math.cos(a) * 7);
      cam.lookAt(this.pos.x, 0.5, this.pos.z);
      this.viewmodel.visible = false; this.rig.root.visible = true;
      return;
    }
    _e.set(this.pitch + sy, this.yaw + sx, 0);
    cam.quaternion.setFromEuler(_e);
    const fps = this.view === 'fps' || this.zoom;
    this.rig.root.visible = !fps;
    this.viewmodel.visible = fps && !this.zoom;
    if (fps) {
      cam.position.set(this.pos.x, this.pos.y + 1.62, this.pos.z);
      this.updateViewmodel(dt);
    } else {
      const pivot = _v.set(this.pos.x, this.pos.y + 1.75, this.pos.z);
      const off = _v2.set(1.05, 0.3, 3.3).applyQuaternion(cam.quaternion);
      cam.position.copy(pivot).add(off);
      if (cam.position.y < 0.4) cam.position.y = 0.4;
      // pull camera in front of the orphanage wall
      if (cam.position.z > 13.4 && Math.abs(cam.position.x) < 16.5) cam.position.z = 13.4;
    }
  }

  updateViewmodel(dt) {
    const w = this.weapon;
    const t = this.bob;
    const bobX = Math.sin(t) * 0.02, bobY = Math.abs(Math.cos(t)) * 0.02;
    const rel = this.reloadT > 0 ? Math.sin((1 - this.reloadT / w.reload) * Math.PI) : 0;
    const sw = this.swingT > 0 ? Math.sin((1 - this.swingT) * Math.PI) : 0;
    const swap = this.swapAnim || 0;
    this.vmArm.position.set(0.2 + bobX, -0.2 - bobY - rel * 0.12 - swap * 0.3, -0.42 + this.recoil * 0.08);
    this.vmArm.rotation.set(this.recoil * 0.25 - rel * 0.7, 0, -rel * 0.4);
    this.vmArmL.visible = w.kind === 'gun' && (w.slot === 2 || this.current === 'revolver');
    this.vmArmL.position.set(0.14 + bobX, -0.23 - bobY - rel * 0.25, this.current === 'revolver' ? -0.5 : -0.78);
    this.vmArmL.rotation.set(this.recoil * 0.2, 0, 0);
    if (w.kind === 'melee') {
      this.vmArm.position.set(0.28 + bobX, -0.3 - bobY - swap * 0.3, -0.5);
      const saw = this.sawing ? (Math.random() - 0.5) * 0.03 : 0;
      this.vmArm.rotation.set(0.9 - sw * 2.0 + saw, sw * 1.0, sw * 0.7);
      if (this.current === 'chainsaw') { this.vmArm.position.set(0.22 + bobX, -0.34 - bobY, -0.5); this.vmArm.rotation.set(0.08 + saw, 0.1, 0); }
    }
    if (this.kickAnim > 0) this.vmArm.position.y -= Math.sin(this.kickAnim * Math.PI) * 0.1;
    const saber = this.heldFps.userData.blade;
    if (saber) saber.material.opacity = 0.3 + Math.random() * 0.12;
  }

  updateDead(dt) {
    this.deathT += dt;
    const r = this.rig;
    const k = Math.min(1, this.deathT * 2);
    r.body.rotation.x = -k * Math.PI / 2;
    r.body.position.y = k * 0.25;
    r.root.visible = true;
  }
}
