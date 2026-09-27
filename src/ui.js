import { DIFFICULTIES, WEAPONS, STRUCTURES, ARMOR, GRENADE, ORPHANAGE_HP, HEALS, PARTNERS, MAX_PARTNERS, UPGRADE, LOADOUT_SIZE, DEFAULT_BINDS, BIND_LABELS, keyLabel, weaponStats } from './config.js';
import { sfx, initAudio, setMuted } from './audio.js';
import { defaultServer, TEAM_COLORS } from './net.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'online', 'diff', 'help', 'settings', 'keys', 'build', 'wave', 'dayclear', 'gameover', 'pause'];
const OVERLAYS = ['help', 'settings', 'keys'];

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
    this.bindOnline();
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
    const tabs = [['guns', 'GUNS'], ['melee', 'MELEE'], ['defense', 'BUILD'], ['allies', 'ALLIES'], ['gear', 'GEAR']];
    for (const [id, label] of tabs) {
      const b = document.createElement('button'); b.textContent = label; b.dataset.tab = id;
      b.addEventListener('click', () => { sfx('click'); this.tab = id; this.refreshShop(); });
      $('shop-tabs').appendChild(b);
    }
    const shop = $('shop');
    shop.addEventListener('mouseenter', () => { this.overShop = true; });
    shop.addEventListener('mouseleave', () => { this.overShop = false; });
    for (const id of ['btn-start', 'btn-repair', 'btn-orph', 'btn-heal', 'sel-panel', 'btn-build-menu', 'btn-rotate', 'btn-cancel-place']) {
      $(id).addEventListener('mouseenter', () => { this.overShop = true; });
      $(id).addEventListener('mouseleave', () => { this.overShop = false; });
    }
    click('btn-start', () => g.startDay());
    click('btn-repair', () => g.buy('repair'));
    click('btn-orph', () => g.buy('orphanage'));
    click('btn-heal', () => g.buy('heal'));
    click('btn-keys', () => this.overlay('keys'));
    click('btn-keys-reset', () => { g.save.settings.binds = { ...DEFAULT_BINDS }; g.persist(); g.applySettings(); this.renderKeys(); });
    click('btn-sell', () => g.sellSelected());
    click('btn-rotate', () => { if (g.structures.ghost) { g.structures.ghost.rot = (g.structures.ghost.rot + 1) % 2; } });
    click('btn-cancel-place', () => g.cancelPlacing());
    g.input.bindTouchUI($('touch-ui'), { onPause: () => g.pause(true) });
    click('btn-build-menu', () => { if (confirm('Quit to main menu? Your run is saved at the start of this day.')) g.enterMenu(); });

    click('btn-next', () => g.enterBuild());
    click('btn-retry', () => g.newRun(g.diff.id));
    click('btn-go-menu', () => g.enterMenu());
    click('btn-resume', () => g.pause(false));
    click('btn-p-settings', () => this.overlay('settings'));
    click('btn-p-help', () => this.overlay('help'));
    click('btn-quit', () => {
      if (g.mode === 'campaign' && !confirm('Abandon the fight? Quitting mid-day forfeits this run.')) return;
      g.paused = false; g.enterMenu();
    });

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
      if (e.code !== 'Escape' || g.input.capture || this.justCaptured) return;
      if (this.stack.length) this.back();
      else if ($('scr-diff').classList.contains('show')) this.show('menu');
    });
  }

  bindOnline() {
    const g = this.game, st = g.save.settings;
    const click = (id, fn) => $(id).addEventListener('click', () => { initAudio(); sfx('click'); fn(); });
    const status = (msg, bad) => { $('net-status').textContent = msg; $('net-status').classList.toggle('bad', !!bad); };
    const saveFields = () => { st.netName = $('net-name').value.trim() || 'Survivor'; st.netServer = $('net-server').value.trim() || defaultServer(); g.persist(); };
    click('btn-online', () => {
      $('net-name').value = st.netName || 'Survivor';
      $('net-server').value = st.netServer || defaultServer();
      status('Host a game and share the code, or join a friend.');
      this.show('online');
    });
    this.lobbyDiff = 'normal';
    for (const d of Object.values(DIFFICULTIES)) {
      const b = document.createElement('button'); b.textContent = d.name; b.dataset.v = d.id;
      b.addEventListener('click', () => { sfx('click'); this.lobbyDiff = d.id; this.updateLobby(); });
      $('lobby-diff').appendChild(b);
    }
    const connect = async (fn) => {
      saveFields(); status('Connecting…');
      try { await fn(); status(''); } catch (e) { status(`${e.message || e}. Is the server running? (npm run server)`, true); }
    };
    click('btn-net-host', () => connect(() => g.netHost(st.netServer, st.netName)));
    click('btn-net-join', () => {
      const code = $('net-code').value.trim().toUpperCase();
      if (code.length !== 4) { status('Enter the 4-letter room code.', true); return; }
      connect(() => g.netJoin(st.netServer, code, st.netName));
    });
    $('net-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-net-join').click(); });
    click('btn-net-start', () => { if (g.net && g.net.isHost) g.startNet(this.lobbyDiff); });
    click('btn-net-back', () => { g.leaveNet(); this.show('menu'); });
  }

  updateLobby() {
    const n = this.game.net;
    $('net-connect').style.display = n ? 'none' : '';
    $('net-lobby').style.display = n ? '' : 'none';
    if (!n) return;
    $('lobby-code').textContent = n.code;
    $('lobby-players').innerHTML = [...n.names.entries()].sort((a, b) => a[0] - b[0])
      .map(([id, name]) => `<div style="--c:#${TEAM_COLORS[id % 4].toString(16).padStart(6, '0')}">${name.toUpperCase()}${id === 0 ? ' · HOST' : ''}${id === n.id ? ' (YOU)' : ''}</div>`).join('');
    $('lobby-host-opts').style.display = n.isHost ? '' : 'none';
    $('lobby-wait').style.display = n.isHost ? 'none' : '';
    $('lobby-diff').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === this.lobbyDiff));
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
    this.syncOverlay();
    if (name === 'menu') {
      const g = this.game;
      if (g.save.run && g.save.run.inWave) { g.save.run = null; g.persist(); }
      const r = g.save.run;
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
    if (name === 'keys') this.renderKeys();
    if (name === 'help') this.renderHelpKeys();
    this.syncOverlay();
  }

  // hide HUD/inventory behind settings & help so the panel is readable
  syncOverlay() {
    document.body.classList.toggle('overlay', OVERLAYS.some((s) => $('scr-' + s).classList.contains('show')));
  }

  renderKeys() {
    const g = this.game, binds = g.save.settings.binds, list = $('keys-list');
    const counts = {};
    for (const c of Object.values(binds)) counts[c] = (counts[c] || 0) + 1;
    list.innerHTML = '';
    for (const a of Object.keys(DEFAULT_BINDS)) {
      const l = document.createElement('div'); l.textContent = BIND_LABELS[a];
      const b = document.createElement('button'); b.textContent = keyLabel(binds[a]);
      if (counts[binds[a]] > 1) { b.classList.add('dup'); b.title = 'Also bound to another action'; }
      b.addEventListener('click', () => {
        sfx('click');
        list.querySelectorAll('button').forEach((x) => x.classList.remove('wait'));
        b.classList.add('wait'); b.textContent = 'PRESS A KEY';
        g.input.capture = (code) => {
          this.justCaptured = true; setTimeout(() => { this.justCaptured = false; }, 50);
          if (code !== 'Escape') { binds[a] = code; g.persist(); g.applySettings(); }
          this.renderKeys();
        };
      });
      list.appendChild(l); list.appendChild(b);
    }
  }

  renderHelpKeys() {
    const b = this.game.save.settings.binds, k = (a) => keyLabel(b[a]);
    const rows = [
      [`${k('forward')}${k('left')}${k('back')}${k('right')}`, 'Move'], ['MOUSE', 'Aim'], ['LMB', 'Shoot / swing'], ['RMB', 'Zoom (scoped guns)'],
      [k('reload'), 'Reload'], [k('kick'), 'Kick (shove them back)'], [k('grenade'), 'Throw grenade'],
      [`${k('banana')} / ${k('medkit')}`, 'Eat banana / use medkit'],
      [`${k('slot1')}-${k('slot4')} / WHEEL / ${k('swap')}`, 'Switch weapon'],
      [k('sprint'), 'Sprint (you can shoot while sprinting)'], [k('jump'), 'Jump'], [k('crouch'), 'Crouch · while sprinting: slide'],
      [k('view'), 'First / third person'], [`ESC / ${k('pause')}`, 'Pause'], [k('mute'), 'Mute'],
    ];
    $('help-keys').innerHTML = rows.map(([a, b2]) => `<tr><td>${a}</td><td>${b2}</td></tr>`).join('');
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
    this.game.input.capture = null;
    this.syncOverlay();
  }

  showPause(p) {
    $('scr-pause').classList.toggle('show', p);
    if (!p) { this.stack = []; for (const o of OVERLAYS) $('scr-' + o).classList.remove('show'); this.game.input.capture = null; this.syncOverlay(); }
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
    $('btn-rotate').style.display = on ? '' : 'none';
    $('btn-cancel-place').style.display = on ? '' : 'none';
    const touch = this.game.input.touchMode;
    if (touch) {
      $('build-hint').innerHTML = on ? '<b>TAP</b> the map to place · <b>ROTATE</b> / <b>CANCEL</b> below' : 'Buy defenses and tap to place them. <b>Drag</b> pans, <b>pinch</b> zooms. Tap a structure to sell it.';
      return;
    }
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

  item(name, price, desc, stat, state, onClick, { label, actions = [] } = {}) {
    const el = document.createElement('div');
    el.className = 'item ' + state;
    const priceText = label ?? (state.includes('locked') ? price : state.includes('equipped') ? 'EQUIPPED' : state.includes('owned') ? 'OWNED' : this.priceText(price));
    el.innerHTML = `<div class="n">${name}</div><div class="p">${priceText}</div><div class="d">${desc}</div>${stat ? `<div class="s">${stat}</div>` : ''}`;
    if (!state.includes('locked')) el.addEventListener('click', () => { initAudio(); onClick(); });
    if (actions.length) {
      const row = document.createElement('div'); row.className = 'acts';
      for (const a of actions) {
        const b = document.createElement('button');
        b.textContent = a.label; if (a.cls) b.className = a.cls; b.disabled = !!a.disabled;
        b.addEventListener('click', (e) => { e.stopPropagation(); initAudio(); a.onClick(); });
        row.appendChild(b);
      }
      el.appendChild(row);
    }
    $('shop-items').appendChild(el);
  }

  priceText(price) { return this.game.mode === 'playground' ? 'FREE' : `$${price}`; }

  note(html) { const el = document.createElement('div'); el.className = 'shop-note'; el.innerHTML = html; $('shop-items').appendChild(el); }
  cat(text) { const el = document.createElement('div'); el.className = 'shop-cat'; el.textContent = text; $('shop-items').appendChild(el); }

  refreshShop() {
    const g = this.game, p = g.player;
    const day = g.mode === 'playground' ? 99 : g.day;
    document.querySelectorAll('#shop-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    $('shop-items').innerHTML = '';
    const poor = (price) => (!g.canAfford(price) ? ' poor' : '');
    if (this.tab === 'guns' || this.tab === 'melee') {
      const kind = this.tab === 'guns' ? 'gun' : 'melee';
      this.note(`LOADOUT <b>${p.loadout.length}/${LOADOUT_SIZE}</b>: ${p.loadout.map((id) => WEAPONS[id].name.toUpperCase()).join(' · ')}<br>Click an owned weapon to equip or stash it.`);
      let lastCat = null;
      const f = (x) => Math.round(x * 10) / 10;
      for (const [id, base] of Object.entries(WEAPONS)) {
        if (base.kind !== kind) continue;
        if (base.cat && base.cat !== lastCat) { this.cat(base.cat); lastCat = base.cat; }
        const lvl = p.upgrades[id] || 0, w = weaponStats(id, lvl);
        const owned = p.owned.includes(id), carried = p.loadout.includes(id);
        const locked = !owned && base.day > day;
        const state = locked ? 'locked' : owned ? (carried ? 'owned equipped' : 'owned stashed') : poor(base.price);
        const stat = kind === 'gun'
          ? `DMG ${f(w.dmg)}${w.pellets > 1 ? 'x' + w.pellets : ''} · RATE ${f(w.rate)}/s${w.burst ? ' (BURST)' : ''} · MAG ${w.mag}${w.pierce ? ' · PIERCE ' + w.pierce : ''}${w.explosive ? ' · EXPLOSIVE' : ''}`
          : `DMG ${f(w.dmg)}${w.continuous ? '/s' : ''} · RATE ${f(w.rate || 10)}/s · REACH ${f(w.range)}${w.dismember ? ' · DISMEMBERS' : ''}`;
        const actions = [];
        if (owned) {
          actions.push({ label: carried ? 'UNEQUIP' : 'EQUIP', cls: carried ? 'on' : '', onClick: () => g.buy('weapon', id) });
          if (lvl < UPGRADE.max) { const c = UPGRADE.cost(base, lvl); actions.push({ label: `UPGRADE MK${lvl + 2} ${this.priceText(c)}`, cls: g.canAfford(c) ? '' : 'poor', onClick: () => g.buy('upgrade', id) }); }
          else actions.push({ label: 'MAX UPGRADE', disabled: true, onClick: () => {} });
        }
        const name = base.name.toUpperCase() + (lvl ? ` <span class="mk">MK${lvl + 1}</span>` : '');
        this.item(name, locked ? `DAY ${base.day}` : base.price, base.desc, stat, state, () => g.buy('weapon', id), { label: owned ? (carried ? 'EQUIPPED' : 'IN LOCKER') : undefined, actions });
      }
    } else if (this.tab === 'allies' && g.net) {
      this.note('Allies are single-player only. In co-op, your friends are your allies!');
    } else if (this.tab === 'allies') {
      const hired = g.partners.alive;
      this.note(`ALLIES <b>${hired.length}/${MAX_PARTNERS}</b> · They follow you and fight. Dead allies are gone for good; survivors are patched up each morning. Click a hired ally to dismiss (25% refund).`);
      for (const [id, a] of Object.entries(PARTNERS)) {
        const isHired = hired.some((h) => h.id === id);
        const locked = !isHired && a.day > day;
        const stat = `HP ${a.hp} · DMG ${a.dmg}${a.pellets > 1 ? 'x' + a.pellets : ''} · RATE ${a.rate}/s · RANGE ${a.range}${a.heal ? ' · HEALS' : ''}`;
        this.item(a.name.toUpperCase(), locked ? `DAY ${a.day}` : a.price, a.desc, stat, locked ? 'locked' : isHired ? 'owned equipped' : poor(a.price), () => g.buy('partner', id), { label: isHired ? 'HIRED' : undefined });
      }
    } else if (this.tab === 'defense') {
      for (const [id, s] of Object.entries(STRUCTURES)) {
        const locked = s.day > day;
        const stat = s.type === 'wall' ? `HP ${s.hp} · BLOCKS SHOTS` : s.type === 'platform' ? `HP ${s.hp} · HEIGHT ${s.h}m` : s.type === 'tower' ? `HP ${s.hp} · DMG ${s.dmg} · RANGE ${s.range}` : id === 'claymore' ? `DMG ${s.dmg} · RADIUS ${s.radius}` : `SLOW ${Math.round(s.slow * 100)}% · ${s.dps} DPS`;
        this.item(s.name.toUpperCase(), locked ? `DAY ${s.day}` : s.price, s.desc, stat, locked ? 'locked' : poor(s.price), () => { g.buy('structure', id); });
      }
    } else {
      ARMOR.forEach((a, i) => {
        if (i === 0) return;
        const owned = p.armor >= i;
        const locked = !owned && a.day > day;
        this.item(a.name.toUpperCase(), locked ? `DAY ${a.day}` : a.price, `Reduces damage taken by ${Math.round(a.reduce * 100)}%.`, '', locked ? 'locked' : owned ? (p.armor === i ? 'owned equipped' : 'owned') : poor(a.price), () => g.buy('armor', i));
      });
      const hc = g.healCost();
      this.item('FULL HEAL', hc, `No natural regeneration. Health ${Math.ceil(p.hp)} / ${p.maxHp}.`, '', hc ? poor(hc) : 'owned', () => g.buy('heal'), { label: hc ? undefined : 'HEALTHY' });
      const kb = g.save.settings.binds;
      for (const [id, h] of Object.entries(HEALS)) this.item(h.name.toUpperCase(), h.price, `${h.desc} Press ${keyLabel(kb[id])} to use. You have ${p.heals[id]}.`, '', poor(h.price), () => g.buy('consumable', id));
      this.item(GRENADE.name.toUpperCase(), GRENADE.price, `Press ${keyLabel(kb.grenade)} to throw. You have ${p.grenades}.`, `DMG ${GRENADE.dmg} · RADIUS ${GRENADE.radius}`, poor(GRENADE.price), () => g.buy('grenade'));
      this.item('TOUGHNESS', 400, `+25 max health. Currently ${p.maxHp}.`, '', p.maxHp >= 200 ? 'owned' : poor(400), () => g.buy('hp'));
    }
    const rc = g.structures.repairCost(), oc = g.orphanageRepairCost();
    $('btn-repair').textContent = rc ? `REPAIR DEFENSES $${rc}` : 'DEFENSES OK';
    $('btn-repair').disabled = !rc;
    $('btn-orph').textContent = oc ? `REPAIR ORPHANAGE $${oc}` : 'ORPHANAGE OK';
    $('btn-orph').disabled = !oc;
    const hc = g.healCost();
    $('btn-heal').textContent = hc ? `HEAL ${this.priceText(hc)}` : 'HEALTH FULL';
    $('btn-heal').disabled = !hc;
    $('btn-start').textContent = g.mode === 'playground' ? 'PLAY ▶' : g.isClient ? 'WAITING FOR HOST' : `START DAY ${g.day} ▶`;
    $('btn-start').disabled = g.isClient;
    $('b-day').textContent = g.mode === 'playground' ? 'PLAYGROUND' : `DAY ${g.day}`;
    $('b-diff').textContent = g.mode === 'playground' ? 'Everything unlocked · No consequences' : g.net ? `${g.diff.name} · CO-OP ROOM ${g.net.code}` : `${g.diff.name} · Best: ${g.save.best[g.diff.id] || 0}`;
  }

  updateWeapons() {
    const p = this.game.player, b = this.game.save.settings.binds;
    const inv = $('h-inv');
    if (!inv) return;
    inv.innerHTML = p.loadout.map((id, i) => `<div class="${id === p.current ? 'on' : ''}"><b>${keyLabel(b['slot' + (i + 1)])}</b>${WEAPONS[id].name.toUpperCase()}</div>`).join('');
    const lvl = p.upgrades[p.current] || 0;
    $('h-wname').textContent = p.weapon.name.toUpperCase() + (lvl ? ` MK${lvl + 1}` : '');
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
    const b = this.game.save.settings.binds;
    $('h-gren').textContent = `GRENADE x${p.grenades} [${keyLabel(b.grenade)}]`;
    $('h-kick').textContent = `KICK [${keyLabel(b.kick)}]`;
    $('h-heal').textContent = `BANANA x${p.heals.banana} [${keyLabel(b.banana)}]  MEDKIT x${p.heals.medkit} [${keyLabel(b.medkit)}]`;
  }

  showDayClear(d) {
    this.show('dayclear');
    $('dc-title').textContent = `DAY ${d.day} SURVIVED`;
    $('dc-rows').innerHTML = [
      ['Zombies killed', d.kills], ['Headshots', d.headshots], ['Kill money', `$${d.earned}`],
      ['Day bonus', `$${d.bonus}`], [`Orphanage intact (${Math.round(d.integrity * 100)}%)`, `$${d.intactBonus}`],
    ].map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
    $('dc-total').textContent = `+$${d.total}`;
    const guest = this.game.isClient;
    $('btn-next').disabled = guest;
    $('btn-next').textContent = guest ? 'WAITING FOR HOST' : 'CONTINUE ▶';
  }

  showGameOver(d) {
    this.show('gameover');
    $('go-reason').textContent = d.reason;
    $('go-rows').innerHTML = [
      ['Days survived', d.survived], ['Zombies killed', d.kills], ['Headshots', d.headshots],
      ['Best (' + this.game.diff.name + ')', d.best + (d.newBest ? '  NEW RECORD!' : '')],
    ].map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
    $('btn-retry').style.display = this.game.isClient ? 'none' : '';
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
      $('b-hp').style.width = `${(p.hp / p.maxHp) * 100}%`;
      $('b-hp-t').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      if (g.selected) this.selectStructure(g.selected);
    }
    if (g.state === 'wave') {
      $('h-day').textContent = g.mode === 'playground' ? 'PLAYGROUND' : `DAY ${g.day}`;
      $('h-wave').textContent = g.mode === 'playground' ? (g.godMode ? 'GOD MODE' : '') : (g.wave ? `WAVE ${g.wave}/${g.wavesTotal}` : 'GET READY');
      const left = g.isClient ? g.netLeft || 0 : g.zombies.aliveCount + (g.spawnQueue ? g.spawnQueue.length : 0);
      this.teamT = (this.teamT || 0) - dt;
      if (this.teamT <= 0) {
        this.teamT = 0.25;
        $('h-team').innerHTML = g.net ? g.net.team().map((m) => `<div class="${m.alive ? '' : 'dead'}" style="color:#${TEAM_COLORS[m.id % 4].toString(16).padStart(6, '0')}">${m.name.toUpperCase()}${m.me ? ' (YOU)' : ''} <i><b style="width:${Math.max(0, (m.hp / m.maxHp) * 100)}%"></b></i></div>`).join('') : '';
      }
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
        $('h-boss-name').textContent = g.boss.def.name;
        $('h-boss-fill').style.width = `${Math.max(0, g.boss.hp / g.boss.maxHp) * 100}%`;
      } else $('h-boss').style.display = 'none';
      const zoom = p.zoom;
      $('scope').classList.toggle('on', zoom && g.world.camera.fov < 30);
      $('crosshair').style.display = zoom ? 'none' : '';
      const spread = p.weapon.kind === 'gun' ? p.weapon.spread * 300 * (p.sprinting ? 1.8 : 1) * (1 - 0.4 * p.crouchK) + p.recoil * 10 : 0;
      $('crosshair').style.transform = `scale(${1 + spread * 0.08})`;
      $('lockmsg').classList.toggle('on', !g.input.locked && !g.paused && p.alive);
      if (p.reloadT > 0 && !this._wasReloading) this.updateAmmo();
      this._wasReloading = p.reloadT > 0;
    }
  }
}
