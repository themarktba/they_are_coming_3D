import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = opts.basic
      ? new THREE.MeshBasicMaterial({ color, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, depthWrite: opts.depthWrite ?? true })
      : new THREE.MeshLambertMaterial({ color, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1, flatShading: true, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
    matCache.set(key, m);
  }
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

// --- geometry baking: merge plain-colored meshes into one vertex-colored mesh to cut draw calls
const bakedMats = {
  lambert: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  basic: new THREE.MeshBasicMaterial({ vertexColors: true }),
};
function bakeKind(m) {
  if (!m.isMesh || m.userData.keep || Array.isArray(m.material)) return null;
  const mt = m.material;
  if (mt.map || mt.transparent || mt.vertexColors) return null;
  if (mt.isMeshLambertMaterial && mt.emissive.getHex() === 0) return 'lambert';
  if (mt.isMeshBasicMaterial) return 'basic';
  return null;
}
export function bake(group, recursive = true) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = { lambert: [], basic: [] };
  const visit = (o) => {
    for (const ch of [...o.children]) {
      const kind = bakeKind(ch);
      if (kind) {
        let g = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld));
        const c = ch.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        buckets[kind].push(g);
        ch.parent.remove(ch);
      } else if (recursive && !ch.isMesh && !ch.userData.keep && !ch.isLight) visit(ch);
    }
  };
  visit(group);
  for (const kind of ['lambert', 'basic']) {
    if (!buckets[kind].length) continue;
    const merged = new THREE.Mesh(mergeGeometries(buckets[kind]), bakedMats[kind]);
    merged.castShadow = kind === 'lambert'; merged.receiveShadow = true;
    group.add(merged);
  }
  return group;
}
export function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(boxGeo, mat(color, opts));
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function shade(hex, f) {
  const c = new THREE.Color(hex); c.multiplyScalar(f); return c.getHex();
}

// Character facing +Z, root at feet. Returned rig parts are pivots for animation.
export function buildCharacter({ skin, shirt, pants, hair, zombie = false, fat = false, heavy = false, boss = false, helmet = false, player = false, knees = false, variant = null }) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const tw = fat ? 0.95 : heavy ? 0.8 : 0.6, td = fat ? 0.6 : heavy ? 0.45 : 0.34;

  const hips = new THREE.Group(); hips.position.y = 0.9; body.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  torso.add(box(tw, 0.72, td, shirt, 0, 0.36, 0));
  torso.add(box(tw + 0.02, 0.14, td + 0.02, pants, 0, 0.02, 0));
  if (zombie) {
    // torn shirt showing skin + blood
    torso.add(box(tw * 0.35, 0.22, 0.02, skin, tw * 0.15, 0.42, td / 2 + 0.005));
    torso.add(box(0.14, 0.12, 0.02, 0x7a0f0f, -tw * 0.2, 0.2, td / 2 + 0.01));
    if (Math.random() < 0.6) torso.add(box(0.1, 0.25, 0.02, 0x6a0c0c, tw * 0.28, 0.5, td / 2 + 0.012));
  }
  if (player) {
    torso.add(box(tw + 0.03, 0.08, td + 0.03, 0x3b2a1a, 0, 0.1, 0));
    torso.add(box(0.28, 0.35, 0.18, 0x55603a, 0, 0.42, -td / 2 - 0.09)); // backpack
  }
  if (boss) {
    for (let i = 0; i < 4; i++) torso.add(box(0.12, 0.3, 0.12, 0xe8dcc0, -0.25 + i * 0.17, 0.75, -td / 2 + 0.05));
    torso.add(box(0.3, 0.25, 0.05, 0xb03040, 0.1, 0.3, td / 2 + 0.02));
  }

  const neck = new THREE.Group(); neck.position.y = 0.72; torso.add(neck);
  const head = new THREE.Group(); neck.add(head);
  const hs = heavy ? 0.46 : 0.42;
  head.add(box(hs, hs, hs, skin, 0, hs / 2, 0));
  const eyeColor = zombie ? (boss ? 0xff2020 : 0xfff04a) : 0x1a1a1a;
  const eyeOpts = zombie ? { basic: true } : undefined;
  head.add(box(0.08, 0.06, 0.02, eyeColor, -0.1, hs * 0.58, hs / 2 + 0.01, eyeOpts));
  head.add(box(0.08, 0.06, 0.02, eyeColor, 0.1, hs * 0.58, hs / 2 + 0.01, eyeOpts));
  if (zombie) {
    head.add(box(0.2, 0.05, 0.02, 0x3a0a0a, 0, hs * 0.25, hs / 2 + 0.01));
    if (Math.random() < 0.5) head.add(box(hs + 0.02, 0.08, hs + 0.02, hair ?? 0x2e2418, 0, hs - 0.03, 0));
  } else if (hair !== undefined) {
    head.add(box(hs + 0.04, 0.1, hs + 0.04, hair, 0, hs, 0));
    head.add(box(hs + 0.04, 0.05, 0.14, hair, 0, hs - 0.02, hs / 2 + 0.06)); // cap brim
  }
  let helmetMesh = null;
  if (helmet) {
    helmetMesh = new THREE.Group();
    helmetMesh.add(box(hs + 0.1, 0.16, hs + 0.1, 0x4a5a3a, 0, 0, 0));
    helmetMesh.add(box(hs + 0.16, 0.04, hs + 0.16, 0x3d4a30, 0, -0.07, 0));
    helmetMesh.position.y = hs + 0.03;
    head.add(helmetMesh);
  }

  const aw = heavy ? 0.26 : 0.17, al = heavy ? 0.78 : 0.64;
  const armL = new THREE.Group(); armL.position.set(tw / 2 + aw / 2, 0.64, 0); torso.add(armL);
  const armR = new THREE.Group(); armR.position.set(-tw / 2 - aw / 2, 0.64, 0); torso.add(armR);
  for (const a of [armL, armR]) {
    a.add(box(aw, al * 0.45, aw, shirt, 0, -al * 0.22, 0));
    a.add(box(aw * 0.95, al * 0.55, aw * 0.95, skin, 0, -al * 0.72, 0));
  }
  if (boss) armL.scale.set(1.4, 1.35, 1.4);

  const legL = new THREE.Group(); legL.position.set(0.16 * (tw / 0.6), 0, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(-0.16 * (tw / 0.6), 0, 0); hips.add(legR);
  const kneeParts = [];
  for (const l of [legL, legR]) {
    const boot = zombie ? shade(pants, 0.6) : 0x2a1f16;
    if (knees) {
      // thigh + shin on a knee pivot so walking, jumping and crouching can bend the leg
      l.add(box(0.23, 0.42, 0.25, pants, 0, -0.21, 0));
      const knee = new THREE.Group(); knee.position.y = -0.4; l.add(knee);
      knee.add(box(0.22, 0.4, 0.24, shade(pants, 0.92), 0, -0.19, 0));
      knee.add(box(0.25, 0.13, 0.32, boot, 0, -0.44, 0.03));
      l.userData.knee = knee; kneeParts.push(knee);
    } else {
      l.add(box(0.23, 0.78, 0.25, pants, 0, -0.39, 0));
      l.add(box(0.25, 0.13, 0.32, boot, 0, -0.84, 0.03));
    }
  }
  if (variant) decorate(variant, { torso, head, armL, armR, tw, td, hs, skin });

  for (const part of [torso, head, armL, armR, legL, legR, helmetMesh, ...kneeParts]) if (part) bake(part, false);
  // arms yaw around the body before pitching, so horizontal swings read correctly
  armL.rotation.order = 'YXZ'; armR.rotation.order = 'YXZ';
  return { root, body, hips, torso, neck, head, armL, armR, legL, legR, kneeL: legL.userData.knee, kneeR: legR.userData.knee, helmet: helmetMesh };
}

// per-type extras for zombies and bosses
function decorate(v, { torso, head, armL, armR, tw, td, hs, skin }) {
  switch (v) {
    case 'spitter': // swollen acid throat and dripping mouth
      head.add(box(hs * 0.8, 0.18, 0.2, 0xb8e040, 0, 0.02, hs / 2 + 0.02, { emissive: 0x5a8a10, ei: 0.6 }));
      torso.add(box(0.3, 0.2, 0.05, 0x9ad030, 0.1, 0.55, td / 2 + 0.02, { emissive: 0x4a7a10, ei: 0.5 }));
      break;
    case 'leaper': // long clawed arms
      for (const a of [armL, armR]) { a.scale.y = 1.25; a.add(box(0.05, 0.12, 0.05, 0xe8e0c8, 0.05, -0.68, 0.06)); a.add(box(0.05, 0.12, 0.05, 0xe8e0c8, -0.05, -0.68, 0.06)); }
      break;
    case 'screamer': // wild white hair and a gaping mouth
      head.add(box(hs + 0.14, 0.3, hs + 0.14, 0xe8e8e8, 0, hs - 0.02, -0.04));
      head.add(box(hs + 0.12, 0.34, 0.1, 0xd8d8d8, 0, hs * 0.55, -hs / 2 - 0.05));
      head.add(box(0.16, 0.16, 0.03, 0x1a0000, 0, hs * 0.22, hs / 2 + 0.015));
      break;
    case 'riot': { // riot shield held in front of the body
      const sh = new THREE.Group(); sh.position.set(0.08, 0.2, td / 2 + 0.2); torso.add(sh);
      sh.add(box(0.8, 1.15, 0.06, 0x2a2e36, 0, 0, 0));
      sh.add(box(0.56, 0.22, 0.03, 0x6a8ab0, 0, 0.32, 0.04));
      sh.add(box(0.66, 0.06, 0.03, 0xe0e0e0, 0, -0.22, 0.04));
      torso.add(box(tw + 0.04, 0.4, td + 0.04, 0x1a1a22, 0, 0.45, 0)); // body armour
      break;
    }
    case 'butcher': { // apron, cleaver, meat hooks
      torso.add(box(tw * 0.85, 0.6, 0.03, 0xd8c8b0, 0, 0.3, td / 2 + 0.02));
      torso.add(box(0.25, 0.3, 0.035, 0x8a1010, -0.08, 0.25, td / 2 + 0.03));
      const cl = new THREE.Group(); cl.position.set(0, -0.72, 0.08); armR.add(cl);
      cl.add(box(0.06, 0.25, 0.06, 0x3a2a1a, 0, 0, 0));
      cl.add(box(0.04, 0.3, 0.5, 0xcfd4da, 0, -0.1, 0.3));
      cl.add(box(0.045, 0.06, 0.5, 0x8a1010, 0, -0.24, 0.3));
      head.add(box(hs + 0.04, 0.12, hs + 0.04, 0x2a2a2a, 0, hs * 0.7, 0)); // mask band
      break;
    }
    case 'queen': // egg sacs and a crown of bone
      for (let i = 0; i < 5; i++) torso.add(box(0.26, 0.26, 0.26, 0xd8e070, -0.45 + i * 0.22, 0.2 + (i % 2) * 0.3, -td / 2 - 0.1, { emissive: 0x6a7a10, ei: 0.4 }));
      for (let i = 0; i < 5; i++) head.add(box(0.07, 0.22, 0.07, 0xe8dcc0, -0.16 + i * 0.08, hs + 0.1, 0));
      break;
  }
}

export function buildZombie(type, def) {
  const rig = buildCharacter({
    skin: pick(def.skin), shirt: pick(def.shirt), pants: pick([0x3a4a6a, 0x4a3a2a, 0x2e2e36, 0x5a5040]),
    zombie: true, fat: !!def.fat, heavy: !!def.heavy, boss: !!def.boss, helmet: !!def.helmet,
    variant: ['spitter', 'leaper', 'screamer', 'riot', 'butcher', 'queen'].includes(type) ? type : null,
    hair: pick([0x2e2418, 0x6b5030, 0x1a1a1a, 0x9a9080]),
  });
  rig.root.scale.setScalar(def.scale * (0.93 + Math.random() * 0.14));
  return rig;
}

export function buildPlayer() {
  return buildCharacter({ skin: 0xe0b48c, shirt: 0x3f6db3, pants: 0x2d3b55, hair: 0xb33a2a, player: true, knees: true });
}

export function buildPartner(def) {
  return buildCharacter({ skin: pick([0xe0b48c, 0xc68c64, 0x8a5a3a, 0xf0c8a0]), shirt: def.color, pants: 0x2d2d2d, hair: shade(def.color, 0.6), player: true, knees: true });
}

export function buildPickup(kind) {
  const g = new THREE.Group();
  if (kind === 'banana') {
    for (let i = 0; i < 4; i++) { const b = box(0.08, 0.08, 0.14, 0xf2d43a, 0, Math.sin(i / 3 * Math.PI) * 0.06, -0.21 + i * 0.14); b.rotation.x = -0.5 + i * 0.33; g.add(b); }
    g.add(box(0.05, 0.05, 0.06, 0x5a3a1c, 0, 0.02, -0.3));
  } else {
    g.add(box(0.36, 0.26, 0.24, 0xe8e8e8, 0, 0, 0));
    g.add(box(0.2, 0.06, 0.25, 0xd62b1f, 0, 0, 0)); g.add(box(0.06, 0.2, 0.25, 0xd62b1f, 0, 0, 0));
  }
  return g;
}

// --- Weapons: built pointing +Z (forward), grip at origin. muzzle = barrel tip.
export function buildWeapon(id) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  const dark = 0x2a2a2e, metal = 0x55575e, wood = 0x7a4a24;
  const add = (...a) => { const m = box(...a); g.add(m); return m; };
  switch (id) {
    case 'pistol': add(0.07, 0.12, 0.08, dark, 0, -0.04, 0); add(0.07, 0.07, 0.26, metal, 0, 0.04, 0.08); muzzle.position.set(0, 0.04, 0.22); break;
    case 'revolver': add(0.07, 0.13, 0.08, wood, 0, -0.05, -0.01); add(0.1, 0.1, 0.1, metal, 0, 0.04, 0.07); add(0.05, 0.05, 0.3, metal, 0, 0.05, 0.22); muzzle.position.set(0, 0.05, 0.38); break;
    case 'deagle': add(0.08, 0.14, 0.09, 0x1a1a1a, 0, -0.05, 0); add(0.09, 0.09, 0.34, 0xb8b8c0, 0, 0.045, 0.1); add(0.03, 0.03, 0.04, dark, 0, 0.1, -0.04); muzzle.position.set(0, 0.045, 0.28); break;
    case 'uzi': add(0.06, 0.15, 0.07, dark, 0, -0.06, 0); add(0.09, 0.1, 0.3, dark, 0, 0.03, 0.05); add(0.04, 0.04, 0.08, metal, 0, 0.03, 0.24); add(0.04, 0.12, 0.05, metal, 0, -0.12, 0.1); muzzle.position.set(0, 0.03, 0.28); break;
    case 'shotgun': add(0.08, 0.1, 0.35, wood, 0, -0.03, -0.2); add(0.08, 0.1, 0.2, dark, 0, 0.0, 0.08); add(0.06, 0.06, 0.6, metal, 0, 0.04, 0.45); { const pump = add(0.08, 0.07, 0.22, wood, 0, -0.02, 0.36); g.userData.pump = pump; } muzzle.position.set(0, 0.04, 0.76); break;
    case 'dbarrel': add(0.08, 0.11, 0.38, wood, 0, -0.03, -0.2); add(0.09, 0.09, 0.12, metal, 0, 0.01, 0.04); add(0.05, 0.05, 0.62, dark, 0.028, 0.04, 0.4); add(0.05, 0.05, 0.62, dark, -0.028, 0.04, 0.4); add(0.1, 0.05, 0.22, wood, 0, -0.02, 0.24); muzzle.position.set(0, 0.04, 0.72); break;
    case 'autoshot': add(0.08, 0.12, 0.28, dark, 0, -0.02, -0.2); add(0.1, 0.13, 0.32, dark, 0, 0.02, 0.1); add(0.07, 0.07, 0.4, metal, 0, 0.05, 0.42); add(0.16, 0.16, 0.16, 0x3a3a3e, 0, -0.1, 0.12); add(0.04, 0.05, 0.14, dark, 0, 0.12, 0.05); muzzle.position.set(0, 0.05, 0.64); break;
    case 'smg': add(0.06, 0.08, 0.2, dark, 0, 0, -0.18); add(0.08, 0.11, 0.3, 0x2a2a30, 0, 0.02, 0.05); add(0.045, 0.045, 0.16, metal, 0, 0.04, 0.28); add(0.05, 0.16, 0.06, dark, 0, -0.1, 0.1); muzzle.position.set(0, 0.04, 0.37); break;
    case 'rifle': add(0.07, 0.11, 0.45, wood, 0, -0.03, -0.12); add(0.05, 0.05, 0.75, metal, 0, 0.04, 0.4); add(0.05, 0.06, 0.2, dark, 0, 0.1, 0.1); { const bolt = add(0.03, 0.03, 0.08, metal, 0.06, 0.06, 0.02); g.userData.bolt = bolt; } muzzle.position.set(0, 0.04, 0.78); break;
    case 'lever': add(0.07, 0.11, 0.4, 0x8a5a2c, 0, -0.03, -0.14); add(0.07, 0.09, 0.16, 0x6a6a50, 0, 0.0, 0.1); add(0.045, 0.045, 0.6, metal, 0, 0.04, 0.44); add(0.06, 0.05, 0.3, 0x8a5a2c, 0, -0.01, 0.34); { const lv = add(0.03, 0.08, 0.12, metal, 0, -0.08, 0.04); g.userData.bolt = lv; } muzzle.position.set(0, 0.04, 0.74); break;
    case 'ar': add(0.07, 0.12, 0.25, dark, 0, -0.01, -0.22); add(0.08, 0.12, 0.35, dark, 0, 0.02, 0.1); add(0.05, 0.05, 0.35, metal, 0, 0.04, 0.42); add(0.06, 0.18, 0.08, dark, 0, -0.12, 0.12); add(0.04, 0.05, 0.12, dark, 0, 0.11, 0.08); muzzle.position.set(0, 0.04, 0.6); break;
    case 'ak': add(0.07, 0.11, 0.28, 0x8a4a20, 0, -0.02, -0.24); add(0.08, 0.11, 0.3, 0x3a3a3a, 0, 0.02, 0.08); add(0.07, 0.07, 0.2, 0x8a4a20, 0, 0.02, 0.32); add(0.04, 0.04, 0.3, metal, 0, 0.05, 0.5); { const m = add(0.06, 0.2, 0.08, 0x3a3a3a, 0, -0.14, 0.14); m.rotation.x = -0.35; } muzzle.position.set(0, 0.05, 0.66); break;
    case 'burst': add(0.08, 0.12, 0.25, 0x4a4a40, 0, -0.01, -0.22); add(0.09, 0.13, 0.4, 0x5a5a4a, 0, 0.02, 0.12); add(0.05, 0.05, 0.28, metal, 0, 0.04, 0.46); add(0.06, 0.16, 0.08, dark, 0, -0.12, 0.08); add(0.05, 0.06, 0.2, dark, 0, 0.13, 0.08); muzzle.position.set(0, 0.04, 0.6); break;
    case 'dmr': add(0.07, 0.12, 0.35, 0x5a4a3a, 0, -0.02, -0.2); add(0.08, 0.11, 0.35, dark, 0, 0.01, 0.12); add(0.045, 0.045, 0.55, metal, 0, 0.04, 0.5); add(0.06, 0.06, 0.24, dark, 0, 0.12, 0.08); add(0.05, 0.15, 0.07, dark, 0, -0.11, 0.18); muzzle.position.set(0, 0.04, 0.78); break;
    case 'sniper': add(0.07, 0.12, 0.4, 0x3d4a30, 0, -0.02, -0.2); add(0.08, 0.1, 0.35, 0x3d4a30, 0, 0.01, 0.12); add(0.045, 0.045, 0.85, dark, 0, 0.04, 0.55); add(0.07, 0.07, 0.3, dark, 0, 0.13, 0.05); { const bolt = add(0.03, 0.03, 0.08, metal, 0.06, 0.06, -0.02); g.userData.bolt = bolt; } muzzle.position.set(0, 0.04, 0.98); break;
    case 'antimat': add(0.09, 0.14, 0.4, 0x2a2e30, 0, -0.02, -0.25); add(0.11, 0.13, 0.45, 0x3a3e40, 0, 0.02, 0.12); add(0.06, 0.06, 0.95, dark, 0, 0.04, 0.8); add(0.12, 0.08, 0.1, dark, 0, 0.04, 1.28); add(0.09, 0.09, 0.36, dark, 0, 0.16, 0.08); for (const x of [-0.08, 0.08]) { const b = add(0.025, 0.28, 0.025, metal, x, -0.1, 0.62); b.rotation.x = 0.5; } muzzle.position.set(0, 0.04, 1.34); break;
    case 'lmg': add(0.08, 0.12, 0.3, dark, 0, -0.01, -0.22); add(0.11, 0.14, 0.4, 0x3a3a30, 0, 0.02, 0.12); add(0.06, 0.06, 0.45, metal, 0, 0.04, 0.52); add(0.18, 0.16, 0.18, 0x4a5a3a, 0, -0.12, 0.12); muzzle.position.set(0, 0.04, 0.76); break;
    case 'mg': add(0.1, 0.14, 0.3, dark, 0, 0, -0.2); add(0.12, 0.15, 0.4, dark, 0, 0.02, 0.12); add(0.07, 0.07, 0.55, metal, 0, 0.04, 0.55); add(0.14, 0.12, 0.14, 0x4a5a3a, 0.1, -0.08, 0.1); muzzle.position.set(0, 0.04, 0.84); break;
    case 'launcher': add(0.08, 0.12, 0.3, 0x4a5a3a, 0, -0.02, -0.2); add(0.16, 0.16, 0.3, dark, 0, 0.03, 0.1); add(0.12, 0.12, 0.45, 0x3d4a30, 0, 0.04, 0.42); add(0.05, 0.16, 0.06, dark, 0, -0.12, 0.05); muzzle.position.set(0, 0.04, 0.66); break;
    case 'minigun': {
      // big and heavy: carried at the hip with a carry handle and an ammo box
      add(0.26, 0.28, 0.6, dark, 0, 0, -0.08);
      add(0.08, 0.14, 0.34, metal, 0, 0.22, -0.05);
      const barrels = new THREE.Group(); barrels.position.set(0, 0.02, 0.26);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = box(0.055, 0.055, 1.05, metal, Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.52); barrels.add(b); }
      barrels.add(box(0.25, 0.25, 0.06, dark, 0, 0, 0.3)); barrels.add(box(0.25, 0.25, 0.06, dark, 0, 0, 0.98));
      g.add(barrels); g.userData.spinner = barrels;
      add(0.3, 0.3, 0.32, 0x4a5a3a, 0.24, -0.16, -0.1);
      muzzle.position.set(0, 0.02, 1.32); break;
    }
    case 'knife': add(0.05, 0.05, 0.13, 0x222222, 0, 0, 0); add(0.02, 0.06, 0.28, 0xcfd4da, 0, 0.01, 0.2); break;
    case 'crowbar': add(0.05, 0.05, 0.75, 0xa01818, 0, 0, 0.28); { const h = add(0.05, 0.05, 0.16, 0xa01818, 0, -0.06, 0.66); h.rotation.x = 0.9; } add(0.05, 0.1, 0.04, 0x888888, 0, 0.03, -0.1); break;
    case 'bat': add(0.06, 0.06, 0.25, 0x3a2a1a, 0, 0, 0); add(0.09, 0.09, 0.55, 0xc49a6c, 0, 0, 0.38); break;
    case 'machete': add(0.05, 0.06, 0.18, 0x2a2a2a, 0, 0, 0); add(0.08, 0.03, 0.03, 0x555555, 0, 0, 0.1); add(0.02, 0.09, 0.6, 0xc8ccd0, 0, -0.015, 0.42); add(0.022, 0.03, 0.6, 0xe8ecf0, 0, -0.06, 0.42); break;
    // axe head: the cutting edge points along -Y, the direction every swing travels
    case 'axe': add(0.06, 0.06, 0.8, wood, 0, 0, 0.3); add(0.04, 0.28, 0.18, 0xb02020, 0, -0.1, 0.62); add(0.045, 0.05, 0.18, 0xcfd4da, 0, -0.25, 0.62); add(0.05, 0.08, 0.1, 0x2a2a2a, 0, 0.06, 0.62); break;
    case 'hammer': add(0.07, 0.07, 0.9, wood, 0, 0, 0.35); add(0.2, 0.2, 0.34, 0x444449, 0, 0, 0.8); break;
    case 'katana': add(0.05, 0.05, 0.3, 0x1a1a2a, 0, 0, 0); add(0.12, 0.03, 0.03, 0xc9a227, 0, 0, 0.16); add(0.02, 0.05, 0.85, 0xe6ecf2, 0, 0, 0.6); break;
    case 'chainsaw': {
      add(0.16, 0.2, 0.3, 0xe08a1a, 0, 0, 0); add(0.04, 0.12, 0.7, 0xa0a4ab, 0, 0, 0.5);
      const chain = box(0.05, 0.14, 0.72, 0x333333, 0, 0, 0.5); g.add(chain); g.userData.chain = chain; break;
    }
    case 'saber': {
      add(0.06, 0.06, 0.28, 0x9aa0a8, 0, 0, 0);
      const blade = box(0.05, 0.05, 1.1, 0x9fe8ff, 0, 0, 0.7, { basic: true }); g.add(blade);
      const glow = box(0.1, 0.1, 1.14, 0x40c0ff, 0, 0, 0.7, { basic: true, transparent: true, opacity: 0.35, depthWrite: false }); glow.castShadow = false; g.add(glow);
      g.userData.blade = glow; break;
    }
    case 'grenade': add(0.12, 0.14, 0.12, 0x3d4a30, 0, 0, 0); add(0.04, 0.05, 0.04, 0x888888, 0, 0.09, 0); break;
  }
  g.add(muzzle); g.userData.muzzle = muzzle;
  return g;
}

// --- Structures: built along X (width), facing -Z (toward street).
export function buildStructure(id) {
  const g = new THREE.Group();
  const add = (...a) => { const m = box(...a); g.add(m); return m; };
  switch (id) {
    case 'wood':
      for (const x of [-1.4, 0, 1.4]) add(0.18, 1.4, 0.18, 0x5a3a1c, x, 0.7, 0);
      for (let i = 0; i < 3; i++) { const p = add(3.2, 0.26, 0.1, [0x8a5a2c, 0x9a6a38, 0x7a4e24][i], 0, 0.3 + i * 0.42, -0.12); p.rotation.z = (i - 1) * 0.06; }
      { const x1 = add(3.3, 0.18, 0.08, 0x6a4420, 0, 0.75, -0.2); x1.rotation.z = 0.35; }
      break;
    case 'roadblock':
      for (const x of [-1.6, 1.6]) { add(0.14, 1, 0.14, 0x444444, x, 0.5, 0); add(0.7, 0.1, 0.7, 0x333333, x, 0.05, 0); }
      for (let i = 0; i < 8; i++) add(0.5, 0.3, 0.12, i % 2 ? 0xffffff : 0xd6281c, -1.75 + i * 0.5, 0.85, -0.05);
      for (let i = 0; i < 8; i++) add(0.5, 0.2, 0.1, i % 2 ? 0xd6281c : 0xffffff, -1.75 + i * 0.5, 0.45, -0.05);
      add(0.12, 0.12, 0.12, 0xffa500, -1.6, 1.08, 0, { emissive: 0xff8800, ei: 0.8 });
      add(0.12, 0.12, 0.12, 0xffa500, 1.6, 1.08, 0, { emissive: 0xff8800, ei: 0.8 });
      break;
    case 'sandbag':
      for (let row = 0; row < 4; row++) for (let i = 0; i < 5 - (row % 2); i++) {
        const b = add(0.66, 0.28, 0.5, row % 2 ? 0xbfa878 : 0xc9b27f, -1.3 + i * 0.65 + (row % 2) * 0.32, 0.15 + row * 0.27, (row % 2 ? 0.2 : -0.2));
        b.rotation.y = (Math.random() - 0.5) * 0.15;
      }
      break;
    case 'concrete':
      add(3.6, 0.45, 1.0, 0xa8a8a0, 0, 0.22, 0);
      add(3.6, 0.9, 0.45, 0xb8b8b0, 0, 0.85, 0);
      for (let i = 0; i < 3; i++) add(0.8, 0.14, 0.02, i % 2 ? 0xff5a1a : 0xffffff, -1 + i, 0.95, -0.24);
      break;
    case 'steel':
      add(3.6, 2.2, 0.25, 0x6a6e76, 0, 1.1, 0);
      for (const x of [-1.7, 0, 1.7]) add(0.2, 2.3, 0.4, 0x4a4e56, x, 1.15, 0.05);
      for (let i = 0; i < 6; i++) add(0.08, 0.08, 0.03, 0x9aa0a8, -1.5 + i * 0.6, 1.9, -0.14);
      add(3.4, 0.14, 0.03, 0xe0c020, 0, 0.5, -0.14);
      break;
    case 'wire':
      for (const x of [-1.7, 0, 1.7]) add(0.1, 0.9, 0.1, 0x5a3a1c, x, 0.45, 0);
      for (let i = 0; i < 3; i++) add(3.6, 0.03, 0.03, 0x9a9a9a, 0, 0.2 + i * 0.28, 0);
      for (let i = 0; i < 9; i++) { const c = add(0.4, 0.4, 0.03, 0xaaaaaa, -1.6 + i * 0.4, 0.4, -0.3); c.rotation.set(0.3, 0, Math.PI / 4); }
      break;
    case 'spikes':
      add(3.2, 0.2, 0.3, 0x5a3a1c, 0, 0.1, 0.3);
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.3, 5), mat(0x9a6a38));
        s.position.set(-1.45 + i * 0.48, 0.45, -0.1); s.rotation.x = -0.75; s.castShadow = true; g.add(s);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), mat(0x6a0c0c));
        tip.position.set(-1.45 + i * 0.48, 0.86, -0.52); tip.rotation.x = -0.75; g.add(tip);
      }
      break;
    case 'claymore':
      add(0.5, 0.3, 0.12, 0x4a5a2a, 0, 0.28, 0);
      for (const x of [-0.18, 0.18]) { const l = add(0.03, 0.2, 0.03, 0x333333, x, 0.07, 0.05); l.rotation.x = 0.4; }
      add(0.3, 0.05, 0.01, 0xd0d0a0, 0, 0.32, -0.065);
      { const led = add(0.05, 0.05, 0.05, 0xff0000, 0.2, 0.44, 0, { emissive: 0xff0000, ei: 1 }); g.userData.led = led; }
      break;
    case 'sentry': {
      // tripod: feet splay out, tops meet the hub under the turret
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2, cx = Math.cos(a), cz = Math.sin(a);
        const l = add(0.08, 0.95, 0.08, 0x333333, cx * 0.3, 0.42, cz * 0.3);
        l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-cx * 0.4, 0.84, -cz * 0.4).normalize());
        add(0.14, 0.05, 0.14, 0x2a2a2a, cx * 0.5, 0.025, cz * 0.5);
      }
      add(0.26, 0.2, 0.26, 0x2a2a2a, 0, 0.82, 0);
      add(0.1, 0.2, 0.1, 0x444444, 0, 0.72, 0);
      const head = new THREE.Group(); head.position.y = 0.95; head.userData.keep = true; g.add(head);
      head.add(box(0.5, 0.35, 0.55, 0x4a5a3a, 0, 0, 0));
      head.add(box(0.07, 0.07, 0.6, 0x222222, 0.1, 0.02, -0.5));
      head.add(box(0.07, 0.07, 0.6, 0x222222, -0.1, 0.02, -0.5));
      head.add(box(0.3, 0.3, 0.3, 0x3a4a2a, 0.35, -0.05, 0.05));
      head.add(box(0.1, 0.06, 0.02, 0xff2020, 0, 0.08, -0.28, { emissive: 0xff2020, ei: 1 }));
      const mz = new THREE.Object3D(); mz.position.set(0, 0.02, -0.82); head.add(mz);
      g.userData.head = head; g.userData.muzzle = mz;
      bake(head, false);
      break;
    }
    case 'platform': case 'scaffold': {
      const steel = id === 'scaffold', h = steel ? 2.6 : 1.6, hw = steel ? 1.5 : 1.1, hd = 1.1;
      const post = steel ? 0x6a6e76 : 0x5a3a1c, deck = steel ? 0x7a7e86 : 0x8a5a2c;
      for (const x of [-hw, hw]) for (const z of [-hd, hd]) add(0.16, h, 0.16, post, x, h / 2, z);
      add(hw * 2 + 0.2, 0.14, hd * 2 + 0.2, deck, 0, h - 0.07, 0);
      for (let i = 0; i < 5; i++) add(0.04, 0.02, hd * 2 + 0.2, 0x2a2a2a, -hw + (i + 0.5) * (hw * 2 / 5), h + 0.005, 0);
      for (const z of [-hd, hd]) { const b = add(hw * 2, 0.08, 0.06, post, 0, h * 0.45, z); b.rotation.z = Math.atan2(h * 0.7, hw * 2); }
      // front railing (low, so you can shoot over it)
      add(hw * 2 + 0.2, 0.08, 0.06, post, 0, h + 0.6, -hd - 0.05);
      for (const x of [-hw, 0, hw]) add(0.07, 0.6, 0.07, post, x, h + 0.3, -hd - 0.05);
      // ladder on the back
      for (const x of [-0.3, 0.3]) add(0.06, h + 0.3, 0.06, 0x7a4e24, x, (h + 0.3) / 2, hd + 0.2);
      for (let y = 0.3; y < h; y += 0.35) add(0.6, 0.05, 0.05, 0x7a4e24, 0, y, hd + 0.2);
      break;
    }
    case 'tower': {
      for (const x of [-1, 1]) for (const z of [-1, 1]) add(0.2, 4, 0.2, 0x5a3a1c, x, 2, z);
      for (const y of [1.2, 2.6]) { const b = add(2.2, 0.12, 0.08, 0x6a4420, 0, y, -1); b.rotation.z = 0.5; const b2 = add(2.2, 0.12, 0.08, 0x6a4420, 0, y, 1); b2.rotation.z = -0.5; }
      add(2.6, 0.18, 2.6, 0x7a4e24, 0, 4.05, 0);
      for (const [x, z, w, d] of [[0, -1.25, 2.6, 0.1], [0, 1.25, 2.6, 0.1], [-1.25, 0, 0.1, 2.6], [1.25, 0, 0.1, 2.6]]) add(w, 0.7, d, 0x8a5a2c, x, 4.5, z);
      for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) add(0.12, 1.6, 0.12, 0x5a3a1c, x, 4.9, z);
      add(3, 0.12, 3, 0x6a2a1a, 0, 5.7, 0);
      const guard = buildCharacter({ skin: 0xd8a47c, shirt: 0x4a5a3a, pants: 0x3a3a2a, hair: 0x3d4a30 });
      guard.root.position.y = 4.15; guard.root.scale.setScalar(0.9);
      guard.armL.rotation.x = -Math.PI / 2; guard.armR.rotation.x = -Math.PI / 2; guard.armR.rotation.y = 0.35;
      const rifle = buildWeapon('sniper'); rifle.position.set(-0.12, 1.45, 0.3); guard.torso.add(rifle);
      rifle.position.set(0.05, 0.6, 0.45);
      g.add(guard.root); g.userData.head = guard.root; guard.root.rotation.y = Math.PI; guard.root.userData.keep = true;
      const mz = new THREE.Object3D(); mz.position.set(0, 0.64, 1.45); guard.torso.add(mz); g.userData.muzzle = mz;
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return bake(g);
}

export function textTexture(lines, { w = 512, h = 128, bg = '#6a1a12', fg = '#ffe9c0', font = '48px "Press Start 2P"', border = '#2a0a06' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = border; x.fillRect(0, 0, w, h);
  x.fillStyle = bg; x.fillRect(8, 8, w - 16, h - 16);
  x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  const lh = h / (lines.length + 0.3);
  lines.forEach((l, i) => x.fillText(l, w / 2, lh * (i + 0.65)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
