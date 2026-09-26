import * as THREE from 'three';
import { box, mat, textTexture, buildCharacter, bake } from './models.js';
import { WORLD } from './config.js';

const PIXEL_MODES = { hd: 0, pixel: 420, retro: 270 };

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
    this.scene.add(this.camera);
    this.pixelMode = 'pixel';
    this.colliders = []; // {minX,maxX,minZ,maxZ}
    this.lamps = [];
    this.windows = [];
    this.hurt = 0; this.flash = 0;

    this.setupPost();
    this.setupLights();
    this.buildSky();
    this.buildGround();
    this.buildOrphanage();
    this.buildSurroundings();
    this.buildGrid();
    this.bakeLoose();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setupPost() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, uRes: { value: new THREE.Vector2() }, uHurt: { value: 0 }, uFlash: { value: 0 }, uPosterize: { value: 1 }, uVignette: { value: 0.35 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uHurt, uFlash, uPosterize, uVignette;
        varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          vec2 p = vUv - 0.5;
          float v = smoothstep(0.85, 0.2, length(p * vec2(1.0, 0.8)));
          c.rgb *= mix(1.0 - uVignette, 1.0, v);
          float edge = smoothstep(0.25, 0.75, length(p));
          c.rgb = mix(c.rgb, vec3(0.6, 0.0, 0.0), uHurt * edge * 0.85);
          c.rgb += vec3(1.0, 0.9, 0.7) * uFlash;
          gl_FragColor = c;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          if (uPosterize > 0.5) { gl_FragColor.rgb = floor(gl_FragColor.rgb * 24.0 + 0.5) / 24.0; }
        }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
  }

  setPixelMode(m) { this.pixelMode = m; this.resize(); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const target = PIXEL_MODES[this.pixelMode];
    let rw = w, rh = h;
    if (target && h > target) { const s = h / target; rw = Math.round(w / s); rh = Math.round(h / s); }
    else if (!target) { const dpr = Math.min(window.devicePixelRatio || 1, 2); rw = Math.round(w * dpr); rh = Math.round(h * dpr); }
    this.rt.setSize(rw, rh);
    this.postMat.uniforms.uRes.value.set(rw, rh);
    this.postMat.uniforms.uPosterize.value = target ? 1 : 0;
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a6a5a, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera; s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 1; s.far = 160;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.fill = new THREE.DirectionalLight(0xffffff, 0.55);
    this.fill.position.set(0.3, 0.6, 1);
    this.camera.add(this.fill); this.camera.add(this.fill.target);
    this.fill.target.position.set(0, 0, -5);
    this.flashlight = new THREE.SpotLight(0xfff2cc, 0, 40, 0.42, 0.5, 1.2);
    this.flashlight.castShadow = false;
    this.scene.add(this.flashlight); this.scene.add(this.flashlight.target);
    this.scene.fog = new THREE.Fog(0xbfdcf5, 50, 200);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(300, 24, 12);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, night: { value: 0 }, moonDir: { value: new THREE.Vector3(0.3, 0.45, -0.85).normalize() }, moonColor: { value: new THREE.Color(0xf0f0ff) } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 top, bottom, moonColor, moonDir; uniform float night; varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float h = clamp(vDir.y * 1.4 + 0.1, 0.0, 1.0);
          vec3 c = mix(bottom, top, h);
          vec3 q = floor(vDir * 180.0);
          float s = step(0.9965, hash(q)) * night * smoothstep(0.05, 0.4, vDir.y);
          c += vec3(s);
          float m = dot(normalize(vDir), moonDir);
          c += moonColor * smoothstep(0.9985, 0.999, m) * night * 1.5;
          c += moonColor * pow(max(m, 0.0), 400.0) * night * 0.35;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  groundTexture(base, variance, size = 64, specks = 0) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    const col = new THREE.Color(base);
    const img = x.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const f = 1 + (Math.random() - 0.5) * variance;
      img.data[i * 4] = Math.min(255, col.r * 255 * f); img.data[i * 4 + 1] = Math.min(255, col.g * 255 * f); img.data[i * 4 + 2] = Math.min(255, col.b * 255 * f); img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < specks; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; x.fillRect(Math.random() * size, Math.random() * size, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  plane(w, d, tex, repX, repZ, x, y, z, color = 0xffffff) {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(repX, repZ);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: t, color }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
    this.scene.add(m); return m;
  }

  buildGround() {
    const grass = this.groundTexture(0x5d8a3a, 0.35, 64, 40);
    const asphalt = this.groundTexture(0x6a6d73, 0.2, 64, 120);
    const dirt = this.groundTexture(0x8a7252, 0.28, 64, 60);
    const side = this.groundTexture(0x9a9a92, 0.15, 32, 10);
    this.plane(600, 600, grass, 120, 120, 0, 0, 0);
    this.plane(18, 157, asphalt, 4, 37, 0, 0.04, -76.5);
    this.plane(52, 11.5, dirt, 12, 3, 0, 0.04, 7.75);
    for (const sx of [-1, 1]) {
      this.plane(2.4, 157, side, 1, 60, sx * 10.2, 0.06, -76.5);
      const curb = box(0.25, 0.15, 157, 0x8a8a84, sx * 9.05, 0.07, -76.5); this.scene.add(curb);
    }
    for (let z = -1; z > -150; z -= 6) this.scene.add(box(0.25, 0.04, 3, 0xe8d64a, 0, 0.05, z));
    // blood-stained drag marks and debris for mood
    for (let i = 0; i < 40; i++) {
      const b = box(0.4 + Math.random() * 1.4, 0.02, 0.4 + Math.random() * 1.2, [0x4a1010, 0x2a2a2a, 0x3a2a1a][i % 3], (Math.random() - 0.5) * 16, 0.06, -10 - Math.random() * 120);
      b.rotation.y = Math.random() * 3; b.castShadow = false; this.scene.add(b);
    }
  }

  bakeLoose() {
    const g = new THREE.Group();
    for (const c of [...this.scene.children]) if (c.isMesh && !c.material.map && !c.material.transparent && c.material.isMeshLambertMaterial && c.material.emissive.getHex() === 0) g.add(c);
    this.scene.add(bake(g));
  }

  buildGrid() {
    const w = WORLD.maxX - WORLD.minX, d = WORLD.buildMaxZ - WORLD.buildMinZ;
    const pts = [];
    for (let x = 0; x <= w; x += 2) pts.push(WORLD.minX + x, 0, WORLD.buildMinZ, WORLD.minX + x, 0, WORLD.buildMaxZ);
    for (let z = 0; z <= d; z += 2) pts.push(WORLD.minX, 0, WORLD.buildMinZ + z, WORLD.maxX, 0, WORLD.buildMinZ + z);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
    this.grid.position.y = 0.06; this.grid.visible = false;
    this.scene.add(this.grid);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.01, d)), new THREE.LineBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.6 }));
    this.grid.add(edge);
    edge.position.set((WORLD.minX + WORLD.maxX) / 2, 0.01, (WORLD.buildMinZ + WORLD.buildMaxZ) / 2);
  }

  buildOrphanage() {
    const g = new THREE.Group(); g.position.set(0, 0, 14); this.scene.add(g);
    const brick = 0x9a4a36, brick2 = 0x8a3e2c, trim = 0xe8dcc0;
    g.add(box(32, 9, 11, brick, 0, 4.5, 5.5));
    for (let i = 0; i < 16; i++) g.add(box(32.05, 0.08, 11.05, brick2, 0, 0.6 + i * 0.55, 5.5));
    g.add(box(32.6, 0.4, 11.6, trim, 0, 9.1, 5.5));
    g.add(box(32.4, 0.5, 11.4, 0x6a6a6a, 0, 0.25, 5.5));
    // roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(33, 0.4, 7.2), mat(0x3a2a2a));
    const r1 = roof.clone(); r1.position.set(0, 10.8, 2.7); r1.rotation.x = -0.55; g.add(r1);
    const r2 = roof.clone(); r2.position.set(0, 10.8, 8.3); r2.rotation.x = 0.55; g.add(r2);
    g.add(box(31.6, 3.2, 0.1, brick, 0, 10.4, 5.5));
    g.add(box(1.4, 3, 1.4, brick2, 9, 12, 7)); // chimney
    // bell tower / sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshLambertMaterial({ map: textTexture(['ST. MARY ORPHANAGE'], { w: 1024, h: 180, font: '44px "Press Start 2P"' }) }));
    sign.position.set(0, 7.6, -0.08); sign.rotation.y = Math.PI; g.add(sign);
    // door
    g.add(box(3.2, 4.2, 0.3, trim, 0, 2.1, -0.1));
    this.door = box(2.6, 3.8, 0.2, 0x5a3418, 0, 1.9, -0.25); this.door.userData.keep = true; g.add(this.door);
    g.add(box(0.15, 0.15, 0.1, 0xd4af37, 0.9, 1.9, -0.4));
    g.add(box(5, 0.3, 2, 0x8a8a84, 0, 0.15, -1));
    // windows
    const kids = [];
    for (const row of [0, 1]) for (let i = -3; i <= 3; i++) {
      if (row === 0 && Math.abs(i) < 1) continue;
      const x = i * 4.2, y = 2.6 + row * 4;
      g.add(box(2.2, 2.6, 0.2, trim, x, y, -0.05));
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 0.1), new THREE.MeshLambertMaterial({ color: 0x1a2a3a, emissive: 0xffc070, emissiveIntensity: 0 }));
      w.position.set(x, y, -0.12); g.add(w); this.windows.push(w);
      g.add(box(0.1, 2.2, 0.12, trim, x, y, -0.16)); g.add(box(1.8, 0.1, 0.12, trim, x, y, -0.16));
      if (Math.random() < 0.35) kids.push([x + (Math.random() - 0.5) * 0.8, y - 0.6]);
      // boarded windows on ground floor
      if (row === 0 && Math.random() < 0.5) { const p = box(2.3, 0.25, 0.08, 0x8a5a2c, x, y + 0.3, -0.25); p.rotation.z = 0.3; g.add(p); }
    }
    for (const [x, y] of kids) { g.add(box(0.35, 0.35, 0.05, 0x10141a, x, y + 0.35, -0.2)); g.add(box(0.5, 0.5, 0.05, 0x10141a, x, y - 0.1, -0.2)); }
    this.colliders.push({ minX: -16.3, maxX: 16.3, minZ: 13.8, maxZ: 26 });
    this.orphanage = bake(g);

    // yard lamps + the administrator's shop stall
    const stall = new THREE.Group(); stall.position.set(-12, 0, 11); this.scene.add(stall);
    stall.add(box(3.6, 1.1, 1.4, 0x6a4420, 0, 0.55, 0));
    stall.add(box(3.8, 0.1, 1.6, 0x8a5a2c, 0, 1.12, 0));
    for (const x of [-1.7, 1.7]) stall.add(box(0.12, 2.6, 0.12, 0x5a3a1c, x, 1.3, 0.5));
    for (let i = 0; i < 6; i++) stall.add(box(0.64, 0.12, 1.8, i % 2 ? 0xffffff : 0xc02020, -1.6 + i * 0.64, 2.65, 0.1));
    stall.add(box(0.6, 0.35, 0.3, 0x4a5a3a, -1, 1.35, 0)); stall.add(box(0.9, 0.12, 0.2, 0x2a2a2e, 0.6, 1.25, 0));
    const admin = buildCharacter({ skin: 0xc68c64, shirt: 0x8a8a8a, pants: 0x2d2d2d, hair: 0x3a3a3a });
    admin.root.position.set(0, 0, 0.9); admin.root.rotation.y = Math.PI; admin.root.userData.keep = true; stall.add(admin.root);
    bake(stall);
    this.admin = admin;
    this.colliders.push({ minX: -14, maxX: -10, minZ: 10.1, maxZ: 12.2 });

    // fence around the yard sides
    for (const sx of [-1, 1]) {
      for (let z = 12; z > WORLD.minZ - 2; z -= 2.5) {
        this.scene.add(box(0.14, 1.8, 0.14, 0x555555, sx * (WORLD.maxX + 0.6), 0.9, z));
      }
      const mesh = box(0.04, 1.6, WORLD.maxZ - WORLD.minZ + 2, 0x9a9a9a, sx * (WORLD.maxX + 0.6), 0.9, (WORLD.maxZ + WORLD.minZ) / 2 - 2, { transparent: true, opacity: 0.35 });
      mesh.castShadow = false; this.scene.add(mesh);
    }
  }

  tree(x, z, dead = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const h = 2 + Math.random() * 2;
    g.add(box(0.5, h, 0.5, 0x5a3a1c, 0, h / 2, 0));
    const leaf = dead ? 0x4a3a2a : [0x3f6a2a, 0x4a7a30, 0x355e24][Math.floor(Math.random() * 3)];
    if (dead) {
      for (let i = 0; i < 4; i++) { const b = box(0.18, 1.6, 0.18, leaf, 0, h + 0.3, 0); b.rotation.set((Math.random() - 0.5) * 1.6, Math.random() * 3, (Math.random() - 0.5) * 1.6); g.add(b); }
    } else {
      const s = 2 + Math.random() * 1.4;
      g.add(box(s, s * 0.8, s, leaf, 0, h + s * 0.3, 0));
      g.add(box(s * 0.6, s * 0.5, s * 0.6, leaf, 0.2, h + s * 0.85, 0.1));
    }
    this.scene.add(bake(g)); return g;
  }

  house(x, z, rotY, burned) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const w = 7 + Math.random() * 4, d = 7 + Math.random() * 3, h = 3.5 + Math.random() * 3;
    const col = burned ? 0x3a3432 : [0xb8a888, 0x8aa0b0, 0xc0b090, 0xa0886a, 0x98a888][Math.floor(Math.random() * 5)];
    g.add(box(w, h, d, col, 0, h / 2, 0));
    const roofCol = burned ? 0x1a1a1a : [0x6a2a1a, 0x3a3a4a, 0x5a3a2a][Math.floor(Math.random() * 3)];
    const r1 = box(w + 0.6, 0.3, d * 0.6, roofCol, 0, h + 1, -d * 0.24); r1.rotation.x = -0.5; g.add(r1);
    if (!burned || Math.random() < 0.5) { const r2 = box(w + 0.6, 0.3, d * 0.6, roofCol, 0, h + 1, d * 0.24); r2.rotation.x = 0.5; g.add(r2); }
    for (let i = 0; i < 3; i++) {
      const wx = -w / 2 + (i + 0.5) * (w / 3);
      g.add(box(1.1, 1.2, 0.1, Math.random() < 0.5 ? 0x0a0a0a : 0x2a3a4a, wx, h * 0.6, d / 2 + 0.03));
      if (Math.random() < 0.4) { const p = box(1.4, 0.2, 0.1, 0x8a5a2c, wx, h * 0.6, d / 2 + 0.08); p.rotation.z = 0.4; g.add(p); }
    }
    g.add(box(1.2, 2.2, 0.1, 0x3a2418, 0, 1.1, d / 2 + 0.03));
    if (burned) for (let i = 0; i < 5; i++) g.add(box(0.3 + Math.random(), 0.3 + Math.random(), 0.3 + Math.random(), 0x222222, (Math.random() - 0.5) * w, 0.3, d / 2 + 1 + Math.random() * 2));
    this.scene.add(bake(g));
  }

  car(x, z, rotY, burned) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const col = burned ? 0x2a2624 : [0xb03a2e, 0x2e6fb0, 0xd4c040, 0xd0d0d0, 0x3a7a4a][Math.floor(Math.random() * 5)];
    g.add(box(2, 0.8, 4.2, col, 0, 0.7, 0));
    g.add(box(1.8, 0.7, 2.2, col, 0, 1.45, -0.2));
    g.add(box(1.7, 0.55, 2.1, burned ? 0x111111 : 0x1a2a3a, 0, 1.45, -0.2));
    for (const sx of [-1, 1]) for (const sz of [-1.3, 1.3]) g.add(box(0.3, 0.6, 0.6, 0x111111, sx * 0.95, 0.3, sz));
    if (!burned) { g.add(box(0.3, 0.2, 0.05, 0xfff0c0, 0.6, 0.8, 2.11, { emissive: 0xfff0c0, ei: 0.3 })); g.add(box(0.3, 0.2, 0.05, 0xfff0c0, -0.6, 0.8, 2.11, { emissive: 0xfff0c0, ei: 0.3 })); }
    g.rotation.z = (Math.random() - 0.5) * 0.08;
    this.scene.add(bake(g)); return g;
  }

  lamp(x, z, face) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(box(0.2, 5, 0.2, 0x3a3a40, 0, 2.5, 0));
    g.add(box(1.4, 0.15, 0.2, 0x3a3a40, face * 0.6, 4.95, 0));
    const bulb = box(0.5, 0.2, 0.35, 0xfff0c0, face * 1.2, 4.82, 0, { emissive: 0xffd890, ei: 0 });
    bulb.material = bulb.material.clone(); g.add(bulb);
    this.scene.add(bake(g));
    this.lamps.push({ bulb, pos: new THREE.Vector3(x + face * 1.2, 4.7, z) });
  }

  buildSurroundings() {
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (const sx of [-1, 1]) {
      for (let z = 8; z > -150; z -= rnd(11, 15)) this.house(sx * rnd(36, 42), z, sx < 0 ? Math.PI / 2 : -Math.PI / 2, Math.random() < 0.35);
      for (let i = 0; i < 18; i++) this.tree(sx * rnd(28, 33), rnd(-150, 12), Math.random() < 0.3);
      for (let z = 0; z > -140; z -= 20) this.lamp(sx * 11.6, z, -sx);
    }
    // wrecked cars: some are in-play cover near the fence line, others block the far street
    const coverCars = [[-20, -18, 0.3], [19, -32, -0.4], [-17, -44, 1.4], [21, -8, 1.2]];
    for (const [x, z, r] of coverCars) {
      this.car(x, z, r, Math.random() < 0.5);
      const c = Math.cos(r), s = Math.sin(r);
      const hw = Math.abs(c) * 1 + Math.abs(s) * 2.1, hd = Math.abs(s) * 1 + Math.abs(c) * 2.1;
      this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, car: true });
    }
    for (let i = 0; i < 7; i++) this.car(rnd(-7, 7), -80 - i * 9 - rnd(0, 4), rnd(-1, 1) + (i % 2) * Math.PI / 2, Math.random() < 0.6);
    // yard lights (the only real point lights, near the orphanage)
    this.yardLights = [];
    for (const x of [-9, 9]) {
      const l = new THREE.PointLight(0xffc070, 0, 22, 1.6); l.position.set(x, 4.5, 11.5); this.scene.add(l); this.yardLights.push(l);
      this.scene.add(box(0.2, 4.6, 0.2, 0x3a3a40, x, 2.3, 12));
      this.scene.add(box(0.5, 0.3, 0.5, 0xfff0c0, x, 4.6, 12, { emissive: 0xffc070, ei: 0.5 }));
    }
  }

  // t: 0 = bright day, 0.5 = sunset, 1 = full night
  setTime(t, redMoon = false) {
    this.timeOfDay = t;
    const lerpC = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const k1 = Math.min(1, t * 2), k2 = Math.max(0, t * 2 - 1);
    const top = lerpC(lerpC(0x4f9be0, 0xff7a3c, k1).getHex(), redMoon ? 0x1a0508 : 0x070b1e, k2);
    const bot = lerpC(lerpC(0xcfe8ff, 0xffc58a, k1).getHex(), redMoon ? 0x3a0a0a : 0x1a2344, k2);
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.bottom.value.copy(bot);
    this.skyMat.uniforms.night.value = k2;
    this.skyMat.uniforms.moonColor.value.set(redMoon ? 0xff4030 : 0xf0f0ff);
    this.scene.fog.color.copy(bot);
    this.scene.fog.near = 50 - 25 * k2; this.scene.fog.far = 210 - 90 * k2;
    this.sun.color.copy(lerpC(lerpC(0xfff1d6, 0xff9a50, k1).getHex(), redMoon ? 0xff6050 : 0x8aa0ff, k2));
    this.sun.intensity = 3.8 - 1.0 * k1 - 1.9 * k2;
    const ang = 1.05 - 0.4 * k1;
    this.sun.userData.dir = new THREE.Vector3(-0.85, Math.sin(ang) * 1.4 + 0.4 * k2, 0.3).normalize();
    this.hemi.intensity = 2.1 - 0.4 * k1 - 1.1 * k2;
    this.fill.intensity = 0.9 - 0.3 * k2;
    this.hemi.color.copy(lerpC(0xcfe8ff, redMoon ? 0x6a3040 : 0x4a5a8a, k2));
    this.renderer.toneMappingExposure = 0.95 + 0.25 * k2;
    const lampOn = t > 0.55 ? 1 : 0;
    for (const l of this.lamps) l.bulb.material.emissiveIntensity = lampOn * (Math.random() < 0.12 ? 0.2 : 1.6);
    for (const w of this.windows) w.material.emissiveIntensity = t > 0.45 ? (Math.random() < 0.7 ? 0.9 : 0.15) : 0;
    for (const l of this.yardLights) l.intensity = lampOn * 30;
    this.flashlight.intensity = k2 * 60;
  }

  update(dt, focus, camDir) {
    const d = this.sun.userData.dir || new THREE.Vector3(-0.5, 0.8, -0.6);
    this.sun.position.copy(focus).addScaledVector(d, 70);
    this.sun.target.position.copy(focus);
    this.sky.position.copy(this.camera.position);
    this.hurt = Math.max(0, this.hurt - dt * 1.2);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.postMat.uniforms.uHurt.value = Math.min(1, this.hurt);
    this.postMat.uniforms.uFlash.value = this.flash;
    if (camDir) {
      this.flashlight.position.copy(this.camera.position).addScaledVector(camDir, 1.3).add(new THREE.Vector3(0.2, -0.25, 0).applyQuaternion(this.camera.quaternion));
      this.flashlight.target.position.copy(this.camera.position).addScaledVector(camDir, 10);
    }
  }

  render() {
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
