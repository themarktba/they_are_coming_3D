import * as THREE from 'three';
import { WEAPONS, GRENADE, WORLD, PLAYER_HP, ARMOR, LOADOUT_SIZE, HEALS, weaponStats } from './config.js';
import { buildPlayer, buildWeapon, box } from './models.js';
import { sfx } from './audio.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const TWO_HANDED = new Set(['bat', 'axe', 'hammer', 'katana', 'chainsaw']);
const sortIds = (a, b) => (WEAPONS[a].slot - WEAPONS[b].slot) || (WEAPONS[a].price - WEAPONS[b].price);

// Melee swing keyframes. p = swing progress 0..1: rest -> wind-up (until a) -> strike (a..b) -> recover.
// fps: [viewmodel position, rotation]; tps: right-arm [pitch offset from aim, yaw, roll]. side flips alternating slashes.
const SWINGS = {
  stab: { a: 0.28, b: 0.46,
    fps: { R: [[0.24, -0.28, -0.5], [0.25, 0, 0]], W: [[0.27, -0.24, -0.3], [0.12, 0, 0.15]], S: [[0.1, -0.2, -0.95], [-0.05, 0, 0]] },
    tps: { R: [0.6, 0, 0], W: [1.0, 0.25, 0], S: [-0.1, -0.05, 0] } },
  hswing: { a: 0.36, b: 0.6,
    fps: { R: [[0.3, -0.3, -0.5], [0.9, 0, 0]], W: [[0.5, -0.12, -0.3], [0.3, -1.5, 0.5]], S: [[-0.25, -0.25, -0.5], [0.1, 1.3, -0.3]] },
    tps: { R: [0.6, 0, 0], W: [0.1, -1.4, 0], S: [0.25, 1.2, 0] } },
  chop: { a: 0.4, b: 0.56,
    fps: { R: [[0.26, -0.3, -0.5], [0.9, 0, 0]], W: [[0.2, -0.02, -0.3], [1.9, 0, 0.1]], S: [[0.12, -0.45, -0.6], [-1.1, 0, 0]] },
    tps: { R: [0.6, 0, 0], W: [-1.4, 0, 0], S: [0.8, 0, 0] } },
  slam: { a: 0.52, b: 0.68,
    fps: { R: [[0.26, -0.32, -0.5], [0.8, 0, 0]], W: [[0.15, 0.08, -0.2], [2.3, 0, 0.05]], S: [[0.05, -0.55, -0.7], [-1.3, 0, 0]] },
    tps: { R: [0.6, 0, 0], W: [-1.7, 0, 0.1], S: [1.15, 0, 0] } },
  slash: { a: 0.25, b: 0.5,
    fps: { R: [[0.28, -0.3, -0.5], [0.9, 0, 0]], W: [[0.45, -0.05, -0.35], [1.4, -0.7, 0.6]], S: [[-0.25, -0.4, -0.55], [-0.6, 0.8, -0.4]] },
    tps: { R: [0.6, 0, 0], W: [-1.1, -0.7, 0], S: [0.7, 0.9, 0] } },
  saber: { a: 0.2, b: 0.55,
    fps: { R: [[0.28, -0.3, -0.5], [0.9, 0, 0]], W: [[0.5, 0.0, -0.3], [1.6, -0.9, 1.0]], S: [[-0.3, -0.35, -0.55], [-0.7, 1.0, -1.2]] },
    tps: { R: [0.6, 0, 0], W: [-1.3, -0.9, 0], S: [0.6, 1.1, 0] } },
};
const ease = (x) => x * x * (3 - 2 * x);
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
function swingPose(frames, sw, p, side) {
  const mirror = (f) => (side < 0 ? (Array.isArray(f[0]) ? [[0.25 - (f[0][0] - 0.25), f[0][1], f[0][2]], [f[1][0], -f[1][1], -f[1][2]]] : [f[0], -f[1], -f[2]]) : f);
  const R = frames.R, W = mirror(frames.W), S = mirror(frames.S);
  let A, B, k;
  if (p < sw.a) { A = R; B = W; k = ease(p / sw.a); }
  else if (p < sw.b) { A = W; B = S; const x = (p - sw.a) / (sw.b - sw.a); k = 1 - (1 - x) * (1 - x); }
  else { A = S; B = R; k = ease((p - sw.b) / (1 - sw.b)); }
  if (Array.isArray(A[0])) return [lerp3(A[0], B[0], k), lerp3(A[1], B[1], k)];
  return lerp3(A, B, k);
}

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
    this.loadout = ['pistol', 'knife'];
    this.upgrades = {};
    this.heals = { banana: 1, medkit: 0 };
    this.ammo = { pistol: WEAPONS.pistol.mag };
    this.current = 'pistol';
    this.grenades = 1;
    this.spawn();
    this.equip('pistol', true);
  }

  // placement + transient state for a new phase. Health is NOT restored: healing costs money now.
  spawn() {
    this.pos.set(0, 0, 6);
    this.vel.set(0, 0, 0); this.knockVel.set(0, 0, 0);
    this.yaw = 0; this.pitch = -0.05;
    this.alive = true;
    this.stamina = 100;
    this.reloadT = 0; this.cd = 0; this.spin = 0; this.swingT = 0; this.swingDur = 0.3; this.kickT = 0; this.kickAnim = 0;
    this.recoil = 0; this.bob = 0; this.zoom = false; this.victory = false;
    this.crouchK = 0; this.slideT = 0; this.slideCd = 0; this.landT = 0; this.groundH = 0; this.onGround = true;
    this.burstLeft = 0; this.actionT = 0; this.aimHold = 0; this.pendingHit = null; this.swingSide = 1;
    this.rig.root.rotation.set(0, Math.PI, 0);
    this.rig.body.rotation.set(0, 0, 0);
    this.rig.root.position.y = 0;
    for (const g of this.grenadeList) this.scene.remove(g.obj);
    this.grenadeList = [];
    for (const id of this.loadout) this.refill(id);
  }

  stats(id) { return weaponStats(id, this.upgrades[id] || 0); }
  get weapon() { return this.wstats || WEAPONS[this.current]; }
  get armorReduce() { return ARMOR[this.armor].reduce; }
  refill(id) { const w = this.stats(id); if (w.kind === 'gun') this.ammo[id] = w.mag; }

  give(id) {
    if (!this.owned.includes(id)) this.owned.push(id);
    this.owned.sort(sortIds);
    this.refill(id);
    if (!this.loadout.includes(id) && this.loadout.length < LOADOUT_SIZE) { this.loadout.push(id); this.loadout.sort(sortIds); }
    if (this.loadout.includes(id)) this.equip(id);
  }

  // add/remove a weapon from what you carry into the fight
  toggleLoadout(id) {
    if (!this.owned.includes(id)) return false;
    const i = this.loadout.indexOf(id);
    if (i >= 0) {
      if (this.loadout.length <= 1) return false;
      this.loadout.splice(i, 1);
      if (this.current === id) this.equip(this.loadout[0], true);
    } else {
      if (this.loadout.length >= LOADOUT_SIZE) return false;
      this.loadout.push(id); this.loadout.sort(sortIds);
      this.refill(id);
    }
    this.game.hud?.updateWeapons();
    return true;
  }

  upgrade(id) {
    this.upgrades[id] = (this.upgrades[id] || 0) + 1;
    this.refill(id);
    if (this.current === id) this.wstats = this.stats(id);
  }

  equip(id, silent) {
    if (!this.loadout.includes(id)) return;
    this.current = id;
    this.wstats = this.stats(id);
    this.reloadT = 0; this.spin = 0; this.zoom = false; this.burstLeft = 0; this.pendingHit = null; this.swingT = 0;
    this.cd = Math.max(this.cd, 0.25);
    this.swapAnim = 1;
    const w = this.weapon;
    // TPS model weapon: guns continue the arm line, blades are angled forward out of the fist
    if (this.heldTps) this.heldTps.parent.remove(this.heldTps);
    this.heldTps = buildWeapon(w.model);
    this.heldTps.rotation.x = Math.PI / 2 + (w.kind === 'melee' ? 0.3 : 0);
    this.heldTps.position.set(0, -0.62, 0.04);
    this.rig.armR.add(this.heldTps);
    // FPS viewmodel weapon
    if (this.heldFps) this.vmArm.remove(this.heldFps);
    this.heldFps = buildWeapon(w.model);
    this.heldFps.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
    this.heldFps.position.set(0, 0.03, 0);
    this.heldFps.rotation.y = Math.PI;
    this.vmArm.add(this.heldFps);
    if (!silent) sfx('click');
    this.game.hud?.updateWeapons();
  }

  cycle(dir) {
    const i = this.loadout.indexOf(this.current);
    this.equip(this.loadout[(i + dir + this.loadout.length) % this.loadout.length]);
  }

  useHeal(kind) {
    const h = HEALS[kind];
    if (!this.heals[kind]) { sfx('deny'); this.game.hud.toast(`NO ${h.name.toUpperCase()}S`); return; }
    if (this.hp >= this.maxHp) { this.game.hud.toast('ALREADY AT FULL HEALTH'); return; }
    this.heals[kind]--;
    this.hp = Math.min(this.maxHp, this.hp + h.heal);
    sfx('eat');
    this.game.effects.text(this.pos.clone().setY(this.pos.y + 2.2), `+${h.heal} HP`, 'heal');
    this.game.hud.updateAmmo();
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
      if (input.act('forward')) mz -= 1;
      if (input.act('back')) mz += 1;
      if (input.act('left')) mx -= 1;
      if (input.act('right')) mx += 1;
      mx += input.touch.mx; mz += input.touch.my;
    }
    const len = Math.hypot(mx, mz);
    const moving = len > 0.15;
    const hspeed0 = Math.hypot(this.vel.x, this.vel.z);
    const crouchHeld = active && input.act('crouch');
    let sprint = active && input.act('sprint') && moving && this.stamina > 0 && mz < 0 && this.slideT <= 0 && !crouchHeld;
    // sprint + crouch = slide
    this.slideCd -= dt;
    if (active && input.actHit('crouch') && hspeed0 > 6.5 && this.onGround && this.slideCd <= 0) {
      this.slideT = 0.8; this.slideCd = 1.1;
      this.slideDir = new THREE.Vector3(this.vel.x, 0, this.vel.z).normalize();
      sfx('swing');
      this.game.effects.dust(this.pos.clone().setY(this.pos.y + 0.1), 6);
    }
    if (sprint) this.stamina = Math.max(0, this.stamina - 28 * dt); else this.stamina = Math.min(100, this.stamina + 18 * dt);
    const w = this.weapon;
    const crouching = crouchHeld || this.slideT > 0;
    this.crouchK += ((crouching ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
    const speed = (sprint ? 8.6 : crouchHeld ? 2.9 : 5.4) * (w.moveMul && (this.spin > 0.1 || !w.spin) ? w.moveMul : 1) * (this.zoom ? 0.5 : 1);
    if (len > 1) { mx /= len; mz /= len; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const wx = mx * c + mz * s, wz = -mx * s + mz * c;
    if (this.slideT > 0) {
      this.slideT -= dt;
      const sp = 3.5 + 8 * Math.max(0, this.slideT / 0.8);
      this.vel.x = this.slideDir.x * sp; this.vel.z = this.slideDir.z * sp;
      if (Math.random() < dt * 20) this.game.effects.dust(this.pos.clone().setY(this.pos.y + 0.05), 1);
    } else {
      const accel = this.onGround ? 14 : 4;
      this.vel.x += (wx * speed - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (wz * speed - this.vel.z) * Math.min(1, accel * dt);
    }
    if (active && input.actHit('jump') && this.onGround && this.slideT <= 0) { this.vel.y = 6.5; this.onGround = false; this.jumpT = 0; }
    this.pos.x += (this.vel.x + this.knockVel.x) * dt;
    this.pos.z += (this.vel.z + this.knockVel.z) * dt;
    this.knockVel.multiplyScalar(Math.max(0, 1 - 6 * dt));
    this.collide();

    // vertical: platforms are climbed by walking into them (ladders), and you fall off their edges
    const gh = this.game.structures.groundAt(this.pos.x, this.pos.z);
    this.groundH = gh;
    this.climbing = false;
    if (this.pos.y < gh - 0.01) {
      this.pos.y = Math.min(gh, this.pos.y + 4.5 * dt);
      this.vel.y = 0; this.climbing = true; this.onGround = this.pos.y >= gh - 0.01;
      if (Math.random() < dt * 6) sfx('step');
    } else {
      this.vel.y -= 20 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= gh) {
        if (!this.onGround && this.vel.y < -3.5) { this.landT = Math.min(1, -this.vel.y / 12); sfx('step'); }
        this.pos.y = gh; this.vel.y = 0; this.onGround = true;
      } else this.onGround = false;
    }
    this.jumpT = (this.jumpT || 0) + dt;
    this.landT = Math.max(0, this.landT - dt * 4);

    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.slideT <= 0) this.bob += dt * hspeed * 1.6;
    if (hspeed > 1 && this.onGround && this.slideT <= 0 && !this.climbing) sfx('step');

    // weapon actions
    this.cd -= dt; this.kickT -= dt; this.swapAnim = Math.max(0, (this.swapAnim || 0) - dt * 4);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.aimHold = Math.max(0, this.aimHold - dt);
    this.actionT = Math.max(0, this.actionT - dt / Math.max(0.2, 0.8 / (w.rate || 1)));
    this.sprinting = sprint;
    if (active) this.handleWeapons(dt, input);
    if (this.pendingHit) {
      this.pendingHit.t -= dt;
      if (this.pendingHit.t <= 0) { const ph = this.pendingHit; this.pendingHit = null; if (this.weapon === ph.w) this.meleeHit(ph.w, ph.w.dmg, false); }
    }

    this.updateGrenades(dt);
    this.updateModel(dt, hspeed);
    this.updateCamera(dt);
  }

  grounded() { return this.onGround; }

  // the world and zombies block you; your own barricades, traps and towers can be walked through
  collide() {
    const p = this.pos, r = this.radius;
    // zombies are solid: you get pushed out of their bodies instead of walking through them
    for (const z of this.game.zombies.list) {
      if (!z.alive || Math.abs(z.root.position.y - p.y) > 1.2 * z.scale) continue;
      const zp = z.root.position;
      // crawlers lie along their facing, so their body sits ahead of the root
      const cx = z.def.crawl ? zp.x + Math.sin(z.yaw) * 1.0 * z.scale : zp.x, cz = z.def.crawl ? zp.z + Math.cos(z.yaw) * 1.0 * z.scale : zp.z;
      const dx = p.x - cx, dz = p.z - cz, min = r + z.radius * 0.9, d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001;
        p.x = cx + (dx / d) * min; p.z = cz + (dz / d) * min;
      }
    }
    p.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, p.x));
    p.z = Math.max(WORLD.minZ, Math.min(WORLD.maxZ, p.z));
    for (const c of this.game.world.colliders) {
      if (p.y > (c.h ?? 3) - 0.2) continue;
      if (p.x > c.minX - r && p.x < c.maxX + r && p.z > c.minZ - r && p.z < c.maxZ + r) {
        const dl = p.x - (c.minX - r), dr = (c.maxX + r) - p.x, dn = p.z - (c.minZ - r), df = (c.maxZ + r) - p.z;
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) p.x = c.minX - r; else if (m === dr) p.x = c.maxX + r; else if (m === dn) p.z = c.minZ - r; else p.z = c.maxZ + r;
      }
    }
  }

  handleWeapons(dt, input) {
    const g = this.game;
    for (let i = 0; i < LOADOUT_SIZE; i++) if (input.actHit('slot' + (i + 1)) && this.loadout[i]) this.equip(this.loadout[i]);
    if (input.mouse.wheel) this.cycle(input.mouse.wheel > 0 ? 1 : -1);
    if (input.actHit('swap')) this.cycle(1);
    if (input.actHit('kick')) this.kick();
    if (input.actHit('grenade')) this.throwGrenade();
    if (input.actHit('banana')) this.useHeal('banana');
    if (input.actHit('medkit')) this.useHeal('medkit');

    const w = this.weapon;
    if (w.kind === 'gun') {
      if (this.burstLeft > 0) {
        this.burstT -= dt;
        if (this.burstT <= 0) {
          if (this.ammo[this.current] > 0) { this.fire(w, true); this.burstLeft--; this.burstT = 0.065; } else this.burstLeft = 0;
        }
        return;
      }
      if (input.actHit('reload') && this.ammo[this.current] < w.mag && this.reloadT <= 0) this.startReload();
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) { this.ammo[this.current] = w.mag; sfx('reloadDone'); g.hud.updateAmmo(); }
        this.zoom = false;
        return;
      }
      this.zoom = !!w.zoom && input.mouse.right && this.slideT <= 0;
      const firing = input.mouse.left; // sprinting no longer blocks shooting
      if (w.spin) {
        this.spin = firing || input.mouse.right ? Math.min(1, this.spin + dt / w.spin) : Math.max(0, this.spin - dt / w.spin);
        if (this.heldFps.userData.spinner) { this.heldFps.userData.spinner.rotation.z += this.spin * dt * 40; this.heldTps.userData.spinner.rotation.z += this.spin * dt * 40; }
        if (this.spin > 0.05 && Math.random() < 0.4) sfx('chainsaw');
      }
      if (firing && this.cd <= 0 && (!w.spin || this.spin >= 1)) {
        if (this.ammo[this.current] <= 0) { if (input.mouse.leftPressed) sfx('empty'); this.startReload(); return; }
        this.fire(w);
        if (w.burst) { this.burstLeft = w.burst - 1; this.burstT = 0.065; }
      }
    } else {
      // melee
      if (w.continuous) {
        const on = input.mouse.left;
        this.sawing = on;
        if (on) {
          sfx('chainsaw');
          this.aimHold = 0.3;
          if (this.cd <= 0) { this.cd = 0.1; this.meleeHit(w, w.dmg * 0.1, true); }
        }
      } else if (input.mouse.left && this.cd <= 0) {
        const sw = SWINGS[w.anim] || SWINGS.hswing;
        this.cd = 1 / w.rate;
        this.swingDur = Math.min(0.8, Math.max(0.3, 0.92 / w.rate));
        this.swingT = 0.0001;
        this.swingSide = w.anim === 'slash' || w.anim === 'saber' ? -this.swingSide : 1;
        this.aimHold = this.swingDur;
        this.pendingHit = { t: this.swingDur * (sw.a + sw.b) / 2, w };
        sfx(this.current === 'saber' ? 'saber' : 'swing');
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
      const pivot = _v2.copy(this.pos).setY(this.pos.y + 1.6 - 0.5 * this.crouchK);
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

  fire(w, burstFollow = false) {
    const g = this.game;
    if (!burstFollow) this.cd = 1 / (w.rate * g.rateMul);
    this.ammo[this.current]--;
    this.aimHold = 0.6;
    if (w.action) this.actionT = 1;
    const { origin, dir } = this.aimRay();
    const muzzle = this.muzzleWorld();
    if (w.explosive) {
      this.launch(w, muzzle, dir);
    } else {
      const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
      const spreadBase = (this.zoom ? 0 : w.spread) * (moving ? 1.6 : 1) * (this.sprinting ? 1.8 : 1) * (this.onGround ? 1 : 2) * (1 - 0.4 * this.crouchK);
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
    }
    g.effects.muzzle(muzzle, dir, 0xffc060, w.pellets > 1 || w.dmg > 15);
    sfx(w.sound);
    if (g.net && !g.net.isHost) g.net.shotSound = w.sound;
    const kick = w.shake * (1 - 0.35 * this.crouchK);
    this.recoil = Math.min(1, this.recoil + (kick * 1.2));
    this.pitch += kick * 0.04 * (this.zoom ? 0.3 : 1);
    this.yaw += (Math.random() - 0.5) * kick * 0.02;
    g.shake(kick * 0.3);
    g.hud.updateAmmo();
    g.alertNearby(this.pos, 18);
  }

  // grenade launcher round: flies fast and bursts on the first thing it touches
  launch(w, from, dir) {
    const obj = buildWeapon('grenade');
    obj.position.copy(from);
    this.scene.add(obj);
    const v = dir.clone().multiplyScalar(38); v.y += 1.5;
    this.grenadeList.push({ obj, vel: v, t: 4, impact: true, radius: w.explosive, dmg: w.dmg * this.game.dmgMul, g: 9 });
  }

  meleeHit(w, dmg, continuous) {
    const g = this.game;
    const fwd = _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let hitAny = false;
    for (const z of [...g.zombies.list]) {
      if (!z.alive && z.state !== 'down') continue;
      if (Math.abs(z.root.position.y - this.pos.y) > 1.6 * z.scale + 0.4) continue;
      const dx = z.root.position.x - this.pos.x, dz = z.root.position.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + z.radius) continue;
      const cos = (dx * fwd.x + dz * fwd.z) / (d || 1);
      if (cos < Math.cos(w.arc / 2) && d > 0.8) continue;
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      const part = this.pitch > 0.05 || z.def.crawl || w.anim === 'chop' || w.anim === 'slam' ? 'head' : 'body';
      g.hitZombie(z, dmg * g.dmgMul, { dir, part: z.state === 'down' ? 'head' : part, knock: w.knock, source: 'melee', dismember: w.dismember });
      hitAny = true;
      if (!w.dismember && !continuous) g.shake(0.15);
    }
    if (w.anim === 'slam') { g.effects.dust(this.pos.clone().addScaledVector(fwd, 1.8).setY(this.pos.y + 0.1), 8); g.shake(0.25); }
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
        g.hitZombie(z, 6 * g.dmgMul, { dir, knock: 11, source: 'kick' });
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
    this.grenadeList.push({ obj, vel: v, t: GRENADE.fuse, radius: GRENADE.radius, dmg: GRENADE.dmg * this.game.dmgMul, g: 20 });
    this.game.hud.updateAmmo();
  }

  updateGrenades(dt) {
    const g = this.game;
    for (let i = this.grenadeList.length - 1; i >= 0; i--) {
      const gr = this.grenadeList[i];
      const p = gr.obj.position;
      gr.t -= dt;
      gr.vel.y -= gr.g * dt;
      p.addScaledVector(gr.vel, dt);
      gr.obj.rotation.x += dt * 10;
      let boom = gr.t <= 0;
      if (gr.impact) {
        if (p.y < 0.15 || g.structures.solidAt(p.x, p.y, p.z) || g.world.colliders.some((c) => p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ && p.y < (c.h ?? 3))) boom = true;
        else for (const z of g.zombies.list) { if (z.alive && z.hitSpheres().some(([c, r]) => c.distanceToSquared(p) < (r + 0.25) ** 2)) { boom = true; break; } }
      } else if (p.y < 0.1) { p.y = 0.1; gr.vel.y = -gr.vel.y * 0.35; gr.vel.x *= 0.6; gr.vel.z *= 0.6; if (Math.abs(gr.vel.y) > 1) sfx('metal'); }
      if (boom) {
        this.scene.remove(gr.obj);
        this.grenadeList.splice(i, 1);
        g.explode(p.clone().setY(Math.max(0.2, p.y)), gr.radius, gr.dmg, { source: 'grenade' });
      }
    }
  }

  updateModel(dt, hspeed) {
    const r = this.rig;
    r.root.rotation.y = this.yaw + Math.PI;
    const t = this.bob;
    const moving = hspeed > 0.5 && this.onGround;
    const ck = this.crouchK, slide = this.slideT > 0;
    const sprintK = Math.min(1, Math.max(0, (hspeed - 5.6) / 3));
    if (this.victory) {
      const tt = performance.now() / 1000;
      r.armR.rotation.set(-2.9 + Math.sin(tt * 6) * 0.15, 0, 0.15);
      r.armL.rotation.set(-0.2, 0, -0.1);
      r.torso.rotation.x = -0.1; r.neck.rotation.x = -0.3;
      r.body.position.y = Math.abs(Math.sin(tt * 3)) * 0.12;
      r.legL.rotation.x = r.legR.rotation.x = 0; r.kneeL.rotation.x = r.kneeR.rotation.x = 0;
      return;
    }

    // --- legs: thigh swing + knee bend through the gait cycle
    const amp = (0.55 + 0.4 * sprintK) * (1 - 0.5 * ck);
    let tl = 0, tr = 0, kl = 0.05, kr = 0.05, bodyY = 0, lean = 0;
    if (moving) {
      tl = Math.sin(t) * amp; tr = -Math.sin(t) * amp;
      kl = 0.1 + Math.max(0, -Math.cos(t)) * (0.9 + 0.5 * sprintK);
      kr = 0.1 + Math.max(0, Math.cos(t)) * (0.9 + 0.5 * sprintK);
      bodyY = -0.02 + Math.abs(Math.cos(t)) * (0.05 + 0.04 * sprintK);
      lean = 0.22 * sprintK;
    }
    // crouch: thighs forward, knees deep, hips drop
    tl += -1.05 * ck; tr += -0.75 * ck; kl += 1.75 * ck; kr += 1.45 * ck; bodyY += -0.36 * ck; lean += 0.15 * ck;
    if (slide) { tl = -1.45; kl = 0.25; tr = -0.55; kr = 1.9; bodyY = -0.5; lean = -0.35; }
    else if (this.climbing) { const c = Math.sin(performance.now() / 110); tl = -0.8 + c * 0.5; tr = -0.8 - c * 0.5; kl = 1.2 - c * 0.4; kr = 1.2 + c * 0.4; }
    else if (!this.onGround) {
      // tuck on the way up, reach for the ground on the way down
      if (this.vel.y > 0) { tl = -0.95; kl = 1.35; tr = -0.25; kr = 0.7; }
      else { const k = Math.min(1, -this.vel.y / 8); tl = -0.95 + 0.6 * k; kl = 1.35 - 0.9 * k; tr = -0.25 + 0.1 * k; kr = 0.7 - 0.4 * k; }
      lean = 0.05;
    }
    if (this.landT > 0) { const k = this.landT; tl -= 0.5 * k; tr -= 0.5 * k; kl += 0.9 * k; kr += 0.9 * k; bodyY -= 0.2 * k; }
    r.legL.rotation.x = tl; r.legR.rotation.x = tr;
    r.kneeL.rotation.x = kl; r.kneeR.rotation.x = kr;
    r.body.position.y = bodyY;
    r.body.rotation.x = slide ? -0.2 : 0;

    // --- arms
    const w = this.weapon;
    const aim = -Math.PI / 2 - this.pitch;
    const armSwing = moving ? Math.sin(t) * (0.35 + 0.6 * sprintK) : 0;
    const lowered = this.sprinting && this.aimHold <= 0;
    if (w.kind === 'gun') {
      const oneHand = w.slot === 1 && this.current !== 'revolver' && this.current !== 'deagle';
      if (lowered) {
        r.armR.rotation.set(-0.95, 0.35, 0);
        r.armL.rotation.set(-1.05, -0.75, 0);
        if (oneHand) r.armL.rotation.set(armSwing * 1.2, 0, -0.05);
      } else {
        const act = this.actionT > 0 ? Math.sin(this.actionT * Math.PI) : 0;
        r.armR.rotation.set(aim + this.recoil * 0.3 + (w.action === 'bolt' ? act * 0.15 : 0), 0.1, 0);
        r.armL.rotation.set(aim + 0.1 + (w.action === 'pump' ? act * 0.25 : 0), -0.6, 0);
        if (oneHand) r.armL.rotation.set(-0.15 + armSwing * 0.6, 0, -0.08);
      }
      if (this.reloadT > 0) { const k = Math.sin((1 - this.reloadT / w.reload) * Math.PI); r.armL.rotation.x += k * 0.9; r.armR.rotation.x += k * 0.25; }
    } else {
      let rx = aim + 0.6, ry = 0, rz = 0;
      if (w.anim === 'saw') {
        rx = aim + 0.35 + (this.sawing ? Math.sin(performance.now() / 30) * 0.05 : 0); ry = 0.25;
      } else if (this.swingT > 0) {
        const sw = SWINGS[w.anim] || SWINGS.hswing;
        const pose = swingPose(sw.tps, sw, Math.min(1, this.swingT / this.swingDur), this.swingSide);
        rx = aim + pose[0]; ry = pose[1]; rz = pose[2];
        r.torso.rotation.y = ry * 0.25;
      } else if (lowered) { rx = -0.6 + armSwing * 0.5; }
      r.armR.rotation.set(rx, ry, rz);
      if (TWO_HANDED.has(this.current)) r.armL.rotation.set(rx + 0.05, ry - 0.55, 0);
      else r.armL.rotation.set(-0.2 - armSwing * 0.8, 0, -0.05);
      if (w.anim === 'slam' && this.swingT > 0) lean += 0.25 * Math.max(0, Math.sin(Math.min(1, this.swingT / this.swingDur) * Math.PI));
    }
    if (this.swingT > 0) { this.swingT += dt; if (this.swingT >= this.swingDur) { this.swingT = 0; r.torso.rotation.y = 0; } }
    this.kickAnim = Math.max(0, this.kickAnim - dt * 4);
    if (this.kickAnim > 0) { const k = Math.sin(this.kickAnim * Math.PI); r.legR.rotation.x = -k * 1.6; r.kneeR.rotation.x = (1 - k) * 0.8; }
    r.torso.rotation.x = -this.pitch * 0.2 + lean;
    r.neck.rotation.x = -this.pitch * 0.5 - lean * 0.6;
    const saber = this.heldTps.userData.blade;
    if (saber) saber.material.opacity = 0.3 + Math.random() * 0.12;
  }

  eyeHeight() { return 1.62 - 0.55 * this.crouchK - (this.slideT > 0 ? 0.15 : 0) - this.landT * 0.12; }

  updateCamera(dt) {
    const cam = this.camera, g = this.game;
    const fov = this.zoom ? (this.weapon.zoom || 18) : 72;
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
    const tilt = this.slideT > 0 ? 0.06 : 0;
    _e.set(this.pitch + sy, this.yaw + sx, tilt);
    cam.quaternion.setFromEuler(_e);
    const fps = this.view === 'fps' || this.zoom;
    this.rig.root.visible = !fps;
    this.viewmodel.visible = fps && !this.zoom;
    if (fps) {
      cam.position.set(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z);
      this.updateViewmodel(dt);
    } else {
      const pivot = _v.set(this.pos.x, this.pos.y + 1.75 - 0.5 * this.crouchK - this.landT * 0.1, this.pos.z);
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
    const sprintK = this.sprinting && this.aimHold <= 0 ? 1 : 0;
    this.vmSprint = (this.vmSprint || 0) + (sprintK - (this.vmSprint || 0)) * Math.min(1, dt * 10);
    const sk = this.vmSprint;
    const bobAmp = 0.02 * (1 + sk);
    const bobX = Math.sin(t) * bobAmp, bobY = Math.abs(Math.cos(t)) * bobAmp;
    // the weapon lags behind jumps and dips on landing
    const air = Math.max(-0.06, Math.min(0.06, -this.vel.y * 0.006)) - this.landT * 0.06;
    const rel = this.reloadT > 0 ? Math.sin((1 - this.reloadT / w.reload) * Math.PI) : 0;
    const swap = this.swapAnim || 0;
    const act = this.actionT > 0 ? Math.sin(this.actionT * Math.PI) : 0;
    const big = w.model === 'minigun' ? 1 : 0;
    this.vmArm.position.set(0.2 + bobX + big * 0.12, -0.2 - bobY - rel * 0.12 - swap * 0.3 + air - big * 0.17, -0.42 + this.recoil * 0.08 + big * 0.02);
    this.vmArm.rotation.set(this.recoil * 0.25 - rel * 0.7 - sk * 0.25, sk * 0.5, -rel * 0.4 + (w.action === 'bolt' || w.action === 'lever' ? act * 0.35 : 0));
    this.vmArmL.visible = w.kind === 'gun' && (w.slot === 2 || this.current === 'revolver' || this.current === 'deagle');
    this.vmArmL.position.set(0.14 + bobX, -0.23 - bobY - rel * 0.25 + air, (this.current === 'revolver' || this.current === 'deagle' ? -0.5 : -0.78) + (w.action === 'pump' ? act * 0.14 : 0));
    this.vmArmL.rotation.set(this.recoil * 0.2, 0, 0);
    const pump = this.heldFps.userData.pump;
    if (pump) pump.position.z = 0.36 - act * 0.12;
    if (w.kind === 'melee') {
      if (w.anim === 'saw') {
        const saw = this.sawing ? (Math.random() - 0.5) * 0.03 : 0;
        this.vmArm.position.set(0.22 + bobX, -0.34 - bobY + air, this.sawing ? -0.6 : -0.5);
        this.vmArm.rotation.set(0.08 + saw, 0.1, 0);
      } else {
        const sw = SWINGS[w.anim] || SWINGS.hswing;
        const p = this.swingT > 0 ? Math.min(1, this.swingT / this.swingDur) : 0;
        const [pp, rr] = swingPose(sw.fps, sw, p, this.swingSide);
        this.vmArm.position.set(pp[0] + bobX, pp[1] - bobY - swap * 0.3 + air, pp[2]);
        this.vmArm.rotation.set(rr[0] - sk * 0.3, rr[1] + sk * 0.3, rr[2]);
      }
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
