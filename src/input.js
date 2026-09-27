import { DEFAULT_BINDS } from './config.js';

// alternate keys that always work in addition to the user's binds
const ALT = { forward: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

export class Input {
  constructor(canvas) {
    this.binds = { ...DEFAULT_BINDS };
    this.vdown = new Set(); // actions held by touch buttons
    this.vpressed = new Set(); // actions tapped by touch buttons this frame
    this.capture = null; // keybind capture callback
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0, nx: 0, ny: 0 };
    this.locked = false;
    this.touchMode = false;
    this.touch = { mx: 0, my: 0 };
    this.pan = { dx: 0, dy: 0, zoom: 0 };
    this.tapped = false;
    this.sensitivity = 1;
    this.wantLock = false;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT')) return;
      if (this.capture) { e.preventDefault(); const cb = this.capture; this.capture = null; cb(e.code); return; }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
      if (this.wantLock && !this.locked) this.lock();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1;
      if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    canvas.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('touchstart', () => {
      if (!this.touchMode) { this.touchMode = true; document.body.classList.add('touch'); this.onTouchMode?.(); }
    }, { passive: true });
    window.addEventListener('touchend', () => { this.tapped = true; }, { passive: true });
    this.bindCanvasTouch(canvas);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.left = false; this.mouse.right = false; }
      this.onLockChange?.(this.locked);
    });
  }

  // build-mode gestures on the canvas: one finger pans, two fingers pinch-zoom
  bindCanvasTouch(canvas) {
    let last = null, lastDist = 0;
    const pts = (e) => [...e.touches].map((t) => ({ x: t.clientX, y: t.clientY }));
    canvas.addEventListener('touchstart', (e) => { const p = pts(e); last = p; if (p.length === 2) lastDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      const p = pts(e);
      if (p.length === 1 && last && last.length === 1) { this.pan.dx += p[0].x - last[0].x; this.pan.dy += p[0].y - last[0].y; }
      if (p.length === 2) { const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); if (lastDist) this.pan.zoom += (lastDist - d) * 0.05; lastDist = d; }
      last = p;
    }, { passive: true });
  }

  // wave-mode virtual controls
  bindTouchUI(root, { onPause }) {
    const stickZone = root.querySelector('#t-stick-zone'), stick = root.querySelector('#t-stick'), knob = root.querySelector('#t-knob');
    const R = 60;
    let stickId = null, sx = 0, sy = 0;
    stickZone.addEventListener('pointerdown', (e) => {
      stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
      stickZone.setPointerCapture(e.pointerId);
      stick.style.display = 'block'; stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; knob.style.transform = 'translate(-50%,-50%)';
    });
    stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      let dx = e.clientX - sx, dy = e.clientY - sy;
      const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
      this.touch.mx = dx / R; this.touch.my = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      if (Math.hypot(this.touch.mx, this.touch.my) > 0.92 && this.touch.my < -0.5) this.vdown.add('sprint'); else this.vdown.delete('sprint');
    });
    const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; this.touch.mx = this.touch.my = 0; stick.style.display = 'none'; this.vdown.delete('sprint'); };
    stickZone.addEventListener('pointerup', endStick); stickZone.addEventListener('pointercancel', endStick);

    // look: the look zone and the fire button both steer the camera while held
    const looks = new Map();
    const lookStart = (e) => { looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); e.currentTarget.setPointerCapture(e.pointerId); };
    const lookMove = (e) => {
      const l = looks.get(e.pointerId); if (!l) return;
      this.mouse.dx += (e.clientX - l.x) * 1.4; this.mouse.dy += (e.clientY - l.y) * 1.4;
      l.x = e.clientX; l.y = e.clientY;
    };
    const lookEnd = (e) => looks.delete(e.pointerId);
    for (const el of [root.querySelector('#t-look-zone'), root.querySelector('#t-fire')]) {
      el.addEventListener('pointerdown', lookStart); el.addEventListener('pointermove', lookMove);
      el.addEventListener('pointerup', lookEnd); el.addEventListener('pointercancel', lookEnd);
    }
    const fire = root.querySelector('#t-fire');
    fire.addEventListener('pointerdown', () => { this.mouse.left = true; this.mouse.leftPressed = true; });
    const fireEnd = () => { this.mouse.left = false; };
    fire.addEventListener('pointerup', fireEnd); fire.addEventListener('pointercancel', fireEnd);
    root.querySelectorAll('[data-action]').forEach((b) => {
      const a = b.dataset.action, toggle = b.hasAttribute('data-toggle');
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (toggle) { const on = !this.vdown.has(a); if (on) this.vdown.add(a); else this.vdown.delete(a); b.classList.toggle('down', on); }
        else { this.vpressed.add(a); this.vdown.add(a); b.classList.add('down'); }
      });
      const up = () => { if (toggle) return; this.vdown.delete(a); b.classList.remove('down'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });
    const zoom = root.querySelector('#t-zoom');
    zoom.addEventListener('pointerdown', () => { this.mouse.right = true; zoom.classList.add('down'); });
    const zoomEnd = () => { this.mouse.right = false; zoom.classList.remove('down'); };
    zoom.addEventListener('pointerup', zoomEnd); zoom.addEventListener('pointercancel', zoomEnd);
    root.querySelector('#t-pause').addEventListener('pointerdown', () => onPause());
  }

  resetTouch() {
    this.touch.mx = this.touch.my = 0; this.mouse.left = this.mouse.right = false;
    this.vdown.clear();
    document.querySelectorAll('#touch-ui [data-toggle]').forEach((b) => b.classList.remove('down'));
  }

  get canLook() { return this.locked || this.touchMode; }

  lock() { if (this.touchMode) return; try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* denied */ } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  // rebindable actions
  act(a) { return this.keys.has(this.binds[a]) || this.vdown.has(a) || (ALT[a] && this.keys.has(ALT[a])); }
  actHit(a) { return this.pressed.has(this.binds[a]) || this.vpressed.has(a) || (ALT[a] && this.pressed.has(ALT[a])); }

  endFrame() {
    this.pressed.clear();
    this.vpressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.leftPressed = false; this.mouse.rightPressed = false;
    this.pan.dx = this.pan.dy = this.pan.zoom = 0;
    this.tapped = false;
  }
}
