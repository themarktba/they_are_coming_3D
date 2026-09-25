import * as THREE from 'three';

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
export function buildCharacter({ skin, shirt, pants, hair, zombie = false, fat = false, heavy = false, boss = false, helmet = false, player = false }) {
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
  const eyeOpts = zombie ? { emissive: eyeColor, ei: 0.9 } : undefined;
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
  for (const l of [legL, legR]) {
    l.add(box(0.23, 0.78, 0.25, pants, 0, -0.39, 0));
    l.add(box(0.25, 0.13, 0.32, zombie ? shade(pants, 0.6) : 0x2a1f16, 0, -0.84, 0.03));
  }

  root.traverse((o) => { if (o.isMesh) o.userData.char = root; });
  return { root, body, hips, torso, neck, head, armL, armR, legL, legR, helmet: helmetMesh };
}

export function buildZombie(type, def) {
  const rig = buildCharacter({
    skin: pick(def.skin), shirt: pick(def.shirt), pants: pick([0x3a4a6a, 0x4a3a2a, 0x2e2e36, 0x5a5040]),
    zombie: true, fat: !!def.fat, heavy: !!def.heavy, boss: !!def.boss, helmet: !!def.helmet,
    hair: pick([0x2e2418, 0x6b5030, 0x1a1a1a, 0x9a9080]),
  });
  rig.root.scale.setScalar(def.scale * (0.93 + Math.random() * 0.14));
  return rig;
}

export function buildPlayer() {
  return buildCharacter({ skin: 0xe0b48c, shirt: 0x3f6db3, pants: 0x2d3b55, hair: 0xb33a2a, player: true });
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
    case 'shotgun': add(0.08, 0.1, 0.35, wood, 0, -0.03, -0.2); add(0.08, 0.1, 0.2, dark, 0, 0.0, 0.08); add(0.06, 0.06, 0.6, metal, 0, 0.04, 0.45); add(0.07, 0.06, 0.25, wood, 0, -0.03, 0.35); muzzle.position.set(0, 0.04, 0.76); break;
    case 'rifle': add(0.07, 0.11, 0.45, wood, 0, -0.03, -0.12); add(0.05, 0.05, 0.75, metal, 0, 0.04, 0.4); add(0.05, 0.06, 0.2, dark, 0, 0.1, 0.1); muzzle.position.set(0, 0.04, 0.78); break;
    case 'ar': add(0.07, 0.12, 0.25, dark, 0, -0.01, -0.22); add(0.08, 0.12, 0.35, dark, 0, 0.02, 0.1); add(0.05, 0.05, 0.35, metal, 0, 0.04, 0.42); add(0.06, 0.18, 0.08, dark, 0, -0.12, 0.12); add(0.04, 0.05, 0.12, dark, 0, 0.11, 0.08); muzzle.position.set(0, 0.04, 0.6); break;
    case 'sniper': add(0.07, 0.12, 0.4, 0x3d4a30, 0, -0.02, -0.2); add(0.08, 0.1, 0.35, 0x3d4a30, 0, 0.01, 0.12); add(0.045, 0.045, 0.85, dark, 0, 0.04, 0.55); add(0.07, 0.07, 0.3, dark, 0, 0.13, 0.05); muzzle.position.set(0, 0.04, 0.98); break;
    case 'mg': add(0.1, 0.14, 0.3, dark, 0, 0, -0.2); add(0.12, 0.15, 0.4, dark, 0, 0.02, 0.12); add(0.07, 0.07, 0.55, metal, 0, 0.04, 0.55); add(0.14, 0.12, 0.14, 0x4a5a3a, 0.1, -0.08, 0.1); muzzle.position.set(0, 0.04, 0.84); break;
    case 'minigun': {
      add(0.16, 0.18, 0.4, dark, 0, 0, -0.05);
      const barrels = new THREE.Group(); barrels.position.set(0, 0.02, 0.2);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = box(0.035, 0.035, 0.7, metal, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.35); barrels.add(b); }
      barrels.add(box(0.16, 0.16, 0.04, dark, 0, 0, 0.55));
      g.add(barrels); g.userData.spinner = barrels;
      add(0.2, 0.2, 0.2, 0x4a5a3a, 0.14, -0.1, -0.05);
      muzzle.position.set(0, 0.02, 0.92); break;
    }
    case 'knife': add(0.05, 0.05, 0.13, 0x222222, 0, 0, 0); add(0.02, 0.06, 0.28, 0xcfd4da, 0, 0.01, 0.2); break;
    case 'bat': add(0.06, 0.06, 0.25, 0x3a2a1a, 0, 0, 0); add(0.09, 0.09, 0.55, 0xc49a6c, 0, 0, 0.38); break;
    case 'axe': add(0.06, 0.06, 0.8, wood, 0, 0, 0.3); add(0.04, 0.28, 0.18, 0xb02020, 0, 0.1, 0.62); add(0.045, 0.05, 0.08, 0xcfd4da, 0, 0.25, 0.62); break;
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
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = add(0.08, 0.9, 0.08, 0x333333, Math.cos(a) * 0.35, 0.4, Math.sin(a) * 0.35); l.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
      const head = new THREE.Group(); head.position.y = 0.95; g.add(head);
      head.add(box(0.5, 0.35, 0.55, 0x4a5a3a, 0, 0, 0));
      head.add(box(0.07, 0.07, 0.6, 0x222222, 0.1, 0.02, -0.5));
      head.add(box(0.07, 0.07, 0.6, 0x222222, -0.1, 0.02, -0.5));
      head.add(box(0.3, 0.3, 0.3, 0x3a4a2a, 0.35, -0.05, 0.05));
      head.add(box(0.1, 0.06, 0.02, 0xff2020, 0, 0.08, -0.28, { emissive: 0xff2020, ei: 1 }));
      const mz = new THREE.Object3D(); mz.position.set(0, 0.02, -0.82); head.add(mz);
      g.userData.head = head; g.userData.muzzle = mz;
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
      g.add(guard.root); g.userData.head = guard.root; guard.root.rotation.y = Math.PI;
      const mz = new THREE.Object3D(); mz.position.set(0, 0.64, 1.45); guard.torso.add(mz); g.userData.muzzle = mz;
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
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
