import { DIFFICULTIES, WEAPONS, STRUCTURES, ARMOR, GRENADE, ORPHANAGE_HP } from './config.js';
import { sfx, initAudio, setMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'diff', 'help', 'settings', 'build', 'wave', 'dayclear', 'gameover', 'pause'];

export class Hud {
  constructor(game) {
    this.game = game;
    this.tab = 'guns';
    this.stack = [];
    this.bannerT = 0;
    this.hitT = 0;
    this.combo = 0; this.comboT = 0;
    this.overShop = false;
    this.bind();
  }

  bind() {
    const g = this.game;
    const click = (id, fn) => $(id).addEventListener('click', () => { initAudio(); sfx('click'); fn(); });
    click('btn-new', () => this.show('diff'));
    click('btn-continue', () => g.continueRun());
    click('btn-playground', () => g.startPlayground());
    click('btn-help', () => this.overlay('help'));
    click('btn-settings', () => this.overlay('settings'));
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { sfx('click'); this.back(); }));

    const cards = $('diff-cards');
    for (const d of Object.values(DIFFICULTIES)) {
      const el = document.createElement('div');
      el.className = 'diff-card'; el.style.setProperty('--c', d.color);
      const skulls = { easy: 'X', normal: 'XX', hard: 'XXX' }[d.id];
      el.innerHTML = `<div class="dn">${d.name}</div><div class="skulls">${skulls}</div><div class="dd">${d.desc}</div><div class="db" data-best="${d.id}"></div>`;
      el.addEventListener('click', () => { initAudio(); sfx('buy'); g.newRun(d.id); });
      cards.appendChild(el);
    }

    // shop
    const tabs = [['guns', 'GUNS'], ['melee', 'MELEE'], ['defense', 'DEFENSE'], ['gear', 'GEAR']];
    for (const [id, label] of tabs) {
      const b = document.createElement('button'); b.textContent = label; b.dataset.tab = id;
      b.addEventListener('click', () => { sfx('click'); this.tab = id; this.refreshShop(); });
      $('shop-tabs').appendChild(b);
    }
    const shop = $('shop');
    shop.addEventListener('mouseenter', () => { this.overShop = true; });
    shop.addEventListener('mouseleave', () => { this.overShop = false; });
    for (const id of ['btn-start', 'btn-repair', 'btn-orph', 'sel-panel', 'btn-build-menu']) {
      $(id).addEventListener('mouseenter', () => { this.overShop = true; });
      $(id).addEventListener('mouseleave', () => { this.overShop = false; });
    }
    click('btn-start', () => g.startDay());
    click('btn-repair', () => g.buy('repair'));
    click('btn-orph', () => g.buy('orphanage'));
    click('btn-sell', () => g.sellSelected());
    click('btn-build-menu', () => { if (confirm('Quit to main menu? Your run is saved at the start of this day.')) g.enterMenu(); });

    click('btn-next', () => g.enterBuild());
    click('btn-retry', () => g.newRun(g.diff.id));
    click('btn-go-menu', () => g.enterMenu());
    click('btn-resume', () => g.pause(false));
    click('btn-p-settings', () => this.overlay('settings'));
    click('btn-p-help', () => this.overlay('help'));
    click('btn-quit', () => { g.paused = false; g.enterMenu(); });

    // settings
    document.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        sfx('click');
        const key = seg.dataset.set;
        let v = b.dataset.v;
        if (v === 'true') v = true; else if (v === 'false') v = false;
        g.save.settings[key] = v;
        g.persist();
        g.applySettings();
        if (key === 'muted') setMuted(v);
        this.syncSettings();
      }));
    });
    $('sens').addEventListener('input', (e) => { g.save.settings.sens = parseFloat(e.target.value); g.persist(); g.applySettings(); this.syncSettings(); });

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.stack.length) this.back();
      else if ($('scr-diff').classList.contains('show')) this.show('menu');
    });
  }

  syncSettings() {
    const st = this.game.save.settings;
    document.querySelectorAll('.seg').forEach((seg) => {
      const v = String(st[seg.dataset.set]);
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    });
    $('sens').value = st.sens;
    $('sens-val').textContent = st.sens.toFixed(2);
  }

  show(name) {
    this.current = name;
    if (['dayclear', 'gameover', 'menu', 'diff'].includes(name)) { $('banner').classList.remove('on'); this.bannerT = 0; }
    this.stack = [];
    for (const s of SCREENS) $('scr-' + s).classList.toggle('show', s === name);
    if (name === 'menu') {
      const r = this.game.save.run;
      $('btn-continue').style.display = r ? '' : 'none';
      if (r) $('btn-continue').textContent = `CONTINUE · DAY ${r.day} · ${DIFFICULTIES[r.diff].name}`;
    }
    if (name === 'diff') {
      document.querySelectorAll('[data-best]').forEach((el) => {
        const b = this.game.save.best[el.dataset.best];
        el.textContent = b ? `Best: ${b} day${b > 1 ? 's' : ''} survived` : 'Not attempted';
      });
    }
    if (name === 'wave') {
      $('pg-hint').style.display = this.game.mode === 'playground' ? '' : 'none';
      this.updateWeapons();
    }
    if (name === 'build') {
      $('sel-panel').style.display = 'none';
      this.placingHint(false);
    }
  }

  overlay(name) {
    const prev = SCREENS.find((s) => $('scr-' + s).classList.contains('show') && s !== name && !['build', 'wave'].includes(s));
    this.stack.push(prev || null);
    if (prev) $('scr-' + prev).classList.remove('show');
    $('scr-' + name).classList.add('show');
    if (name === 'settings') this.syncSettings();
  }

  back() {
    const open = SCREENS.filter((s) => $('scr-' + s).classList.contains('show') && !['build', 'wave'].includes(s));
    if (!this.stack.length) {
      if (open.includes('diff')) this.show('menu');
      return;
    }
    for (const s of open) $('scr-' + s).classList.remove('show');
    const prev = this.stack.pop();
    if (prev) $('scr-' + prev).classList.add('show');
  }

  showPause(p) {
    $('scr-pause').classList.toggle('show', p);
    if (!p) { this.stack = []; $('scr-settings').classList.remove('show'); $('scr-help').classList.remove('show'); }
  }

  banner(title, sub = '', dur = 2, color = '') {
    const b = $('banner');
    b.className = 'banner on ' + color;
    b.querySelector('.b-title').textContent = title;
    b.querySelector('.b-sub').textContent = sub;
    this.bannerT = dur;
  }

  toast(msg, cls = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + cls; t.textContent = msg;
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => t.remove(), 1800);
  }

  hitmarker(head) {
    const h = $('hitmarker');
    h.classList.toggle('head', head);
    h.style.opacity = '1';
    this.hitT = 0.12;
  }

  onKill(headshot) {
    this.combo++; this.comboT = 2.2;
    if (this.combo >= 3) {
      const names = ['', '', '', 'TRIPLE KILL', 'MULTI KILL', 'RAMPAGE', 'MASSACRE', 'UNSTOPPABLE', 'GODLIKE'];
      const c = $('h-combo');
      c.textContent = `${this.combo}x ${names[Math.min(8, this.combo)] || 'GODLIKE'}`;
      c.classList.add('on');
    }
    void headshot;
  }

  orphanageHit() { this.orphFlash = 0.3; }

  placingHint(on) {
    $('build-hint').innerHTML = on
      ? '<b>CLICK</b> place · <b>R</b> rotate · <b>SHIFT</b> keep placing · <b>RIGHT-CLICK</b> cancel'
      : 'Buy defenses and place them on the street. <b>WASD</b> pans the map, the <b>wheel</b> zooms. Click a structure to sell it.';
  }

  selectStructure(s) {
    const p = $('sel-panel');
    if (!s) { p.style.display = 'none'; return; }
    p.style.display = '';
    $('sel-name').textContent = s.def.name.toUpperCase();
    const refund = Math.floor(s.def.price * 0.5 * (s.hp / s.maxHp) / (s.def.count || 1));
    $('sel-hp').textContent = `HP ${Math.ceil(s.hp)} / ${s.maxHp}`;
    $('btn-sell').textContent = `SELL +$${refund}`;
  }

  item(name, price, desc, stat, state, onClick) {
    const el = document.createElement('div');
    el.className = 'item ' + state;
    const priceText = state.includes('locked') ? price : state.includes('equipped') ? 'EQUIPPED' : state.includes('owned') ? 'OWNED' : (this.game.mode === 'playground' ? 'FREE' : `$${price}`);
    el.innerHTML = `<div class="n">${name}</div><div class="p">${priceText}</div><div class="d">${desc}</div>${stat ? `<div class="s">${stat}</div>` : ''}`;
    if (!state.includes('locked')) el.addEventListener('click', () => { initAudio(); onClick(); });
    $('shop-items').appendChild(el);
  }

  refreshShop() {
    const g = this.game, p = g.player;
    const day = g.mode === 'playground' ? 99 : g.day;
    document.querySelectorAll('#shop-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    $('shop-items').innerHTML = '';
    const poor = (price) => (!g.canAfford(price) ? ' poor' : '');
    if (this.tab === 'guns' || this.tab === 'melee') {
      const kind = this.tab === 'guns' ? 'gun' : 'melee';
      for (const [id, w] of Object.entries(WEAPONS)) {
        if (w.kind !== kind) continue;
        const owned = p.owned.includes(id);
        const locked = !owned && w.day > day;
        const state = locked ? 'locked' : owned ? (p.current === id ? 'owned equipped' : 'owned') : poor(w.price);
        const stat = kind === 'gun'
          ? `DMG ${w.dmg}${w.pellets > 1 ? 'x' + w.pellets : ''} · RATE ${w.rate}/s · MAG ${w.mag}${w.pierce ? ' · PIERCE ' + w.pierce : ''}`
          : `DMG ${w.dmg}${w.continuous ? '/s' : ''} · REACH ${w.range}${w.dismember ? ' · DISMEMBERS' : ''}`;
        this.item(w.name.toUpperCase(), locked ? `DAY ${w.day}` : w.price, w.desc, stat, state, () => g.buy('weapon', id));
      }
    } else if (this.tab === 'defense') {
      for (const [id, s] of Object.entries(STRUCTURES)) {
        const locked = s.day > day;
        const stat = s.type === 'wall' ? `HP ${s.hp}` : s.type === 'tower' ? `HP ${s.hp} · DMG ${s.dmg} · RANGE ${s.range}` : id === 'claymore' ? `DMG ${s.dmg} · RADIUS ${s.radius}` : `SLOW ${Math.round(s.slow * 100)}% · ${s.dps} DPS`;
        this.item(s.name.toUpperCase(), locked ? `DAY ${s.day}` : s.price, s.desc, stat, locked ? 'locked' : poor(s.price), () => { g.buy('structure', id); });
      }
    } else {
      ARMOR.forEach((a, i) => {
        if (i === 0) return;
        const owned = p.armor >= i;
        const locked = !owned && a.day > day;
        this.item(a.name.toUpperCase(), locked ? `DAY ${a.day}` : a.price, `Reduces damage taken by ${Math.round(a.reduce * 100)}%.`, '', locked ? 'locked' : owned ? (p.armor === i ? 'owned equipped' : 'owned') : poor(a.price), () => g.buy('armor', i));
      });
      this.item(GRENADE.name.toUpperCase(), GRENADE.price, `Press G to throw. You have ${p.grenades}.`, `DMG ${GRENADE.dmg} · RADIUS ${GRENADE.radius}`, poor(GRENADE.price), () => g.buy('grenade'));
      this.item('TOUGHNESS', 400, `+25 max health. Currently ${p.maxHp}.`, '', p.maxHp >= 200 ? 'owned' : poor(400), () => g.buy('hp'));
    }
    const rc = g.structures.repairCost(), oc = g.orphanageRepairCost();
    $('btn-repair').textContent = rc ? `REPAIR DEFENSES $${rc}` : 'DEFENSES OK';
    $('btn-repair').disabled = !rc;
    $('btn-orph').textContent = oc ? `REPAIR ORPHANAGE $${oc}` : 'ORPHANAGE OK';
    $('btn-orph').disabled = !oc;
    $('btn-start').textContent = g.mode === 'playground' ? 'PLAY ▶' : `START DAY ${g.day} ▶`;
    $('b-day').textContent = g.mode === 'playground' ? 'PLAYGROUND' : `DAY ${g.day}`;
    $('b-diff').textContent = g.mode === 'playground' ? 'Everything unlocked · No consequences' : `${g.diff.name} · Best: ${g.save.best[g.diff.id] || 0}`;
  }

  updateWeapons() {
    const p = this.game.player;
    const inv = $('h-inv');
    if (!inv) return;
    const ci = p.owned.indexOf(p.current);
    const start = Math.max(0, Math.min(ci - 3, p.owned.length - 7));
    inv.innerHTML = p.owned.slice(start, start + 7).map((id, k) => { const i = start + k; return `<div class="${id === p.current ? 'on' : ''}">${i < 9 ? `<b>${i + 1}</b>` : ''}${WEAPONS[id].name.toUpperCase()}</div>`; }).join('');
    $('h-wname').textContent = p.weapon.name.toUpperCase();
    this.updateAmmo();
  }

  updateAmmo() {
    const p = this.game.player, w = p.weapon;
    const el = $('h-ammo'), mag = $('h-mag'), box = el.parentElement;
    if (w.kind === 'gun') {
      if (p.reloadT > 0) { box.className = 'ammo reloading'; el.textContent = 'RELOADING'; mag.textContent = ''; }
      else {
        const a = p.ammo[p.current];
        box.className = 'ammo' + (a <= Math.max(1, w.mag * 0.2) ? ' low' : '');
        el.textContent = a; mag.textContent = ` / ${w.mag}`;
      }
    } else { box.className = 'ammo'; el.textContent = w.continuous ? 'VROOM' : 'MELEE'; mag.textContent = ''; }
    $('h-gren').textContent = `GRENADE x${p.grenades} [G]`;
  }

  showDayClear(d) {
    this.show('dayclear');
    $('dc-title').textContent = `DAY ${d.day} SURVIVED`;
    $('dc-rows').innerHTML = [
      ['Zombies killed', d.kills], ['Headshots', d.headshots], ['Kill money', `$${d.earned}`],
      ['Day bonus', `$${d.bonus}`], [`Orphanage intact (${Math.round(d.integrity * 100)}%)`, `$${d.intactBonus}`],
    ].map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
    $('dc-total').textContent = `+$${d.total}`;
  }

  showGameOver(d) {
    this.show('gameover');
    $('go-reason').textContent = d.reason;
    $('go-rows').innerHTML = [
      ['Days survived', d.survived], ['Zombies killed', d.kills], ['Headshots', d.headshots],
      ['Best (' + this.game.diff.name + ')', d.best + (d.newBest ? '  NEW RECORD!' : '')],
    ].map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.remove('on'); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) $('hitmarker').style.opacity = '0'; }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; $('h-combo').classList.remove('on'); } }
    $('fps').textContent = g.save.settings.showFps ? `${g.fps || 0} FPS` : '';

    if (g.state === 'build') {
      $('b-money').textContent = g.mode === 'playground' ? '$∞' : `$${g.money}`;
      $('b-orph').style.width = `${(g.orphanageHp / ORPHANAGE_HP) * 100}%`;
      if (g.selected) this.selectStructure(g.selected);
    }
    if (g.state === 'wave') {
      $('h-day').textContent = g.mode === 'playground' ? 'PLAYGROUND' : `DAY ${g.day}`;
      $('h-wave').textContent = g.mode === 'playground' ? (g.godMode ? 'GOD MODE' : '') : (g.wave ? `WAVE ${g.wave}/${g.wavesTotal}` : 'GET READY');
      const left = g.zombies.aliveCount + (g.spawnQueue ? g.spawnQueue.length : 0);
      $('h-left').textContent = left ? `${left} ZOMBIES` : '';
      $('h-money').textContent = g.mode === 'playground' ? '$∞' : `$${g.money}`;
      $('h-earn').textContent = g.mode === 'playground' ? '' : `+$${g.dayEarn} today`;
      const of = $('h-orph');
      of.style.width = `${(g.orphanageHp / ORPHANAGE_HP) * 100}%`;
      this.orphFlash = Math.max(0, (this.orphFlash || 0) - dt);
      of.style.background = this.orphFlash > 0 ? '#ff4030' : '';
      $('h-hp').style.width = `${(p.hp / p.maxHp) * 100}%`;
      $('h-hp-t').textContent = `${Math.ceil(p.hp)}`;
      $('h-armor').style.width = `${p.armorReduce * 100 / 0.6}%`;
      $('h-armor-t').textContent = p.armorReduce ? `${ARMOR[p.armor].name.toUpperCase()} ${Math.round(p.armorReduce * 100)}%` : 'NO ARMOR';
      $('h-stam').style.width = `${p.stamina}%`;
      $('h-kick').className = p.kickT > 0 ? 'cd' : '';
      if (g.boss && g.boss.state !== 'dead') {
        $('h-boss').style.display = '';
        $('h-boss-fill').style.width = `${Math.max(0, g.boss.hp / g.boss.maxHp) * 100}%`;
      } else $('h-boss').style.display = 'none';
      const zoom = p.zoom;
      $('scope').classList.toggle('on', zoom && g.world.camera.fov < 30);
      $('crosshair').style.display = zoom ? 'none' : '';
      const spread = p.weapon.kind === 'gun' ? p.weapon.spread * 300 + p.recoil * 10 : 0;
      $('crosshair').style.transform = `scale(${1 + spread * 0.08})`;
      $('lockmsg').classList.toggle('on', !g.input.locked && !g.paused && p.alive);
      if (p.reloadT > 0 && !this._wasReloading) this.updateAmmo();
      this._wasReloading = p.reloadT > 0;
    }
  }
}
