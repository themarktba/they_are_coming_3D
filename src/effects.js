import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

class Particles {
  constructor(scene, max, material) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.p = [];
  }
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life, max: o.life, size: o.size, grow: o.grow || 0, color: o.color, g: o.g ?? 18, drag: o.drag ?? 0.5, bounce: o.bounce ?? 0.2, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10, onGround: o.onGround, stay: o.stay || 0 });
  }
  update(dt) {
    const arr = this.p;
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.g * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vz *= dr; if (p.g <= 0) p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.y < p.size * 0.5 && p.g > 0) {
        p.y = p.size * 0.5;
        if (p.onGround && p.vy < -1) { p.onGround(p); p.onGround = null; }
        p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5;
      }
      arr[w++] = p;
    }
    arr.length = w;
    const n = Math.min(arr.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = arr[i];
      const k = p.life / p.max;
      const s = Math.max(0.001, p.size * (p.grow ? 1 + (1 - k) * p.grow : Math.min(1, k * 3)));
      _q.setFromAxisAngle(_p.set(0.3, 1, 0.2).normalize(), p.rot);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setHex(p.color));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.gore = true;
    this.solid = new Particles(scene, 2500, new THREE.MeshLambertMaterial({ flatShading: true }));
    this.solid.mesh.castShadow = false;
    this.glow = new Particles(scene, 1500, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.smoke = new Particles(scene, 600, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55, depthWrite: false }));

    // blood / scorch decals
    this.decalMax = 500;
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), this.decalMax);
    this.decals.count = 0; this.decals.frustumCulled = false; this.decals.receiveShadow = true;
    this.decals.setColorAt(0, new THREE.Color());
    scene.add(this.decals);
    this.decalIdx = 0;

    // tracers
    this.tracerMax = 300;
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), this.tracerMax);
    this.tracers.count = 0; this.tracers.frustumCulled = false;
    this.tracers.setColorAt(0, new THREE.Color());
    scene.add(this.tracers);
    this.tracerList = [];

    // pooled lights for flashes
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc060, 0, 14, 2); scene.add(l); this.lights.push({ l, t: 0, max: 1, i: 0 }); }
    this.lightIdx = 0;

    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);

    this.textLayer = document.getElementById('fx-layer');
    this.texts = [];
  }

  flashLight(pos, color, intensity, dist, dur) {
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.position.copy(pos); L.l.color.setHex(color); L.l.distance = dist; L.i = intensity; L.t = dur; L.max = dur; L.l.intensity = intensity;
  }

  decal(x, z, size, color, rot = Math.random() * 6) {
    const i = this.decalIdx++ % this.decalMax;
    _q.setFromAxisAngle(UP, rot);
    _m.compose(_p.set(x, 0.035 + (i % 50) * 0.0004, z), _q, _s.set(size, 1, size * (0.6 + Math.random() * 0.8)));
    this.decals.setMatrixAt(i, _m);
    this.decals.setColorAt(i, _c.setHex(color));
    this.decals.count = Math.min(this.decalMax, Math.max(this.decals.count, i + 1));
    this.decals.instanceMatrix.needsUpdate = true;
    this.decals.instanceColor.needsUpdate = true;
  }

  clearDecals() { this.decals.count = 0; this.decalIdx = 0; }

  blood(pos, dir, amount = 8, color = 0x9a0f0f) {
    if (!this.gore) { this.dust(pos, amount / 2); return; }
    for (let i = 0; i < amount; i++) {
      const sp = 2 + Math.random() * 5;
      this.solid.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: (dir ? dir.x * sp : 0) + (Math.random() - 0.5) * 4, vy: Math.random() * 5 + 1, vz: (dir ? dir.z * sp : 0) + (Math.random() - 0.5) * 4,
        life: 0.8 + Math.random() * 0.8, size: 0.06 + Math.random() * 0.1, color: Math.random() < 0.3 ? 0x5a0808 : color, g: 20, bounce: 0.05,
        onGround: Math.random() < 0.25 ? (p) => this.decal(p.x, p.z, 0.3 + Math.random() * 0.5, 0x5a0a0a) : null,
      });
    }
  }

  gib(pos, dir, color) {
    if (!this.gore) return;
    for (let i = 0; i < 6; i++) {
      this.solid.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * 4 + (Math.random() - 0.5) * 7, vy: 3 + Math.random() * 6, vz: dir.z * 4 + (Math.random() - 0.5) * 7, life: 3 + Math.random() * 2, size: 0.12 + Math.random() * 0.14, color: i % 2 ? color : 0x7a1010, g: 20, bounce: 0.3,
        onGround: (p) => this.decal(p.x, p.z, 0.6, 0x5a0a0a) });
    }
    this.blood(pos, dir, 20);
  }

  dust(pos, n = 6, color = 0x9a8a70) {
    for (let i = 0; i < n; i++) this.smoke.spawn({ x: pos.x + (Math.random() - 0.5) * 0.4, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, life: 0.6 + Math.random() * 0.5, size: 0.2 + Math.random() * 0.2, grow: 2, color, g: -0.5, drag: 2 });
  }

  sparks(pos, n = 5, color = 0xffd060) {
    for (let i = 0; i < n; i++) this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 8, life: 0.2 + Math.random() * 0.3, size: 0.05, color, g: 15 });
  }

  splinters(pos, color, n = 6) {
    for (let i = 0; i < n; i++) this.solid.spawn({ x: pos.x + (Math.random() - 0.5), y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 5, life: 1.5, size: 0.08 + Math.random() * 0.12, color, g: 18, bounce: 0.3 });
  }

  muzzle(pos, dir, color = 0xffc060, big = false) {
    const n = big ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const s = 2 + Math.random() * 6;
      this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * s + (Math.random() - 0.5), vy: dir.y * s + (Math.random() - 0.5), vz: dir.z * s + (Math.random() - 0.5), life: 0.05 + Math.random() * 0.04, size: big ? 0.22 : 0.13, color, g: 0 });
    }
    this.flashLight(pos, 0xffb050, big ? 25 : 12, 10, 0.06);
  }

  tracer(from, to, color = 0xffe9a0, width = 0.035) {
    this.tracerList.push({ from: from.clone(), to: to.clone(), t: 0.07, max: 0.07, color, width });
    if (this.tracerList.length > this.tracerMax) this.tracerList.shift();
  }

  explosion(pos, radius = 5) {
    this.flashLight(pos.clone().setY(2), 0xff9030, 120, radius * 5, 0.35);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * radius * 2.4;
      this.glow.spawn({ x: pos.x, y: pos.y + 0.5, z: pos.z, vx: Math.cos(a) * s, vy: Math.random() * radius * 1.6, vz: Math.sin(a) * s, life: 0.3 + Math.random() * 0.4, size: 0.3 + Math.random() * 0.4, color: [0xffe060, 0xff8020, 0xff4010][i % 3], g: 2, drag: 3 });
    }
    for (let i = 0; i < 18; i++) {
      this.smoke.spawn({ x: pos.x + (Math.random() - 0.5) * radius * 0.6, y: pos.y + 0.5 + Math.random(), z: pos.z + (Math.random() - 0.5) * radius * 0.6, vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 1.2 + Math.random() * 1.0, size: 0.45 + Math.random() * 0.45, grow: 2.2, color: [0x2a2a2a, 0x3a3a3a, 0x4a4040][i % 3], g: -0.8, drag: 1.5 });
    }
    for (let i = 0; i < 14; i++) this.solid.spawn({ x: pos.x, y: pos.y + 0.3, z: pos.z, vx: (Math.random() - 0.5) * 16, vy: 4 + Math.random() * 10, vz: (Math.random() - 0.5) * 16, life: 2, size: 0.08 + Math.random() * 0.15, color: 0x2a2420, g: 20, bounce: 0.3 });
    this.decal(pos.x, pos.z, radius * 0.9, 0x151210);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.set(pos.x, 0.2, pos.z); this.scene.add(ring);
    this.rings.push({ m: ring, t: 0, max: 0.45, r: radius * 1.3 });
  }

  text(pos, str, cls = '') {
    if (!this.textLayer) return;
    if (this.texts.length > 40) { const o = this.texts.shift(); o.el.remove(); }
    const el = document.createElement('div');
    el.className = 'ftext ' + cls; el.textContent = str;
    this.textLayer.appendChild(el);
    this.texts.push({ el, pos: pos.clone(), t: 0, max: cls.includes('big') ? 1.4 : 0.9, vx: (Math.random() - 0.5) * 0.8 });
  }

  update(dt) {
    this.solid.update(dt); this.glow.update(dt); this.smoke.update(dt);
    // tracers
    let w = 0;
    for (const t of this.tracerList) {
      t.t -= dt; if (t.t <= 0) continue;
      this.tracerList[w++] = t;
    }
    this.tracerList.length = w;
    for (let i = 0; i < w; i++) {
      const t = this.tracerList[i];
      const len = t.from.distanceTo(t.to);
      _p.subVectors(t.to, t.from).normalize();
      _q.setFromUnitVectors(FWD, _p);
      const k = t.t / t.max;
      _m.compose(t.from, _q, _s.set(t.width * k + 0.01, t.width * k + 0.01, len));
      this.tracers.setMatrixAt(i, _m);
      this.tracers.setColorAt(i, _c.setHex(t.color));
    }
    this.tracers.count = w;
    this.tracers.instanceMatrix.needsUpdate = true;
    if (this.tracers.instanceColor) this.tracers.instanceColor.needsUpdate = true;
    for (const L of this.lights) { if (L.t > 0) { L.t -= dt; L.l.intensity = Math.max(0, L.i * (L.t / L.max)); } else L.l.intensity = 0; }
    this.rings = this.rings.filter((r) => {
      r.t += dt; const k = r.t / r.max;
      r.m.scale.setScalar(0.5 + k * r.r); r.m.material.opacity = 0.8 * (1 - k);
      if (k >= 1) { this.scene.remove(r.m); r.m.material.dispose(); return false; }
      return true;
    });
    const w2 = window.innerWidth, h2 = window.innerHeight;
    this.texts = this.texts.filter((t) => {
      t.t += dt;
      if (t.t >= t.max) { t.el.remove(); return false; }
      t.pos.y += dt * 1.5; t.pos.x += t.vx * dt;
      _p.copy(t.pos).project(this.camera);
      if (_p.z > 1) { t.el.style.display = 'none'; return true; }
      t.el.style.display = '';
      t.el.style.transform = `translate(${(_p.x * 0.5 + 0.5) * w2}px, ${(-_p.y * 0.5 + 0.5) * h2}px) translate(-50%,-50%) scale(${1 + Math.max(0, 0.25 - t.t) * 2})`;
      t.el.style.opacity = String(Math.min(1, (t.max - t.t) * 4));
      return true;
    });
  }

  clearTexts() { for (const t of this.texts) t.el.remove(); this.texts = []; }
}
