// World layout: orphanage sits at +Z, zombies come from -Z down the street.
export const WORLD = {
  minX: -26, maxX: 26, minZ: -70, maxZ: 15,
  doorZ: 13.2, spawnZ: -88,
  buildMinZ: -55, buildMaxZ: 10,
};

export const DIFFICULTIES = {
  easy: {
    id: 'easy', name: 'SURVIVOR', color: '#6cd85a',
    desc: 'Fewer, slower zombies. More cash. Great for learning.',
    zHp: 0.75, zCount: 0.75, zSpeed: 0.9, zDmg: 0.7, money: 1.3, startMoney: 400, night: false,
  },
  normal: {
    id: 'normal', name: 'VETERAN', color: '#ffc93c',
    desc: 'The real apocalypse. Every bullet counts.',
    zHp: 1, zCount: 1, zSpeed: 1, zDmg: 1, money: 1, startMoney: 300, night: false,
  },
  hard: {
    id: 'hard', name: 'NIGHTMARE', color: '#ff3b3b',
    desc: 'Endless night. They are faster, hungrier, and there are so many more.',
    zHp: 1.45, zCount: 1.5, zSpeed: 1.15, zDmg: 1.35, money: 0.85, startMoney: 150, night: true,
  },
};

// kind: gun | melee | throw. slot: 1 sidearm, 2 primary, 3 melee (sorting + one/two-handed poses)
// anim (melee): stab | hswing | chop | slam | slash | saber | saw. action (guns): pump | bolt | lever
export const WEAPONS = {
  pistol:   { kind: 'gun', cat: 'PISTOLS', name: 'Pistol', price: 0, day: 1, dmg: 5.5, rate: 4, auto: false, mag: 12, reload: 1.1, spread: 0.012, pellets: 1, pierce: 0, range: 70, shake: 0.08, sound: 'pistol', slot: 1, model: 'pistol', desc: 'Old reliable. Unlimited ammo, limited patience.' },
  revolver: { kind: 'gun', cat: 'PISTOLS', name: 'Revolver', price: 300, day: 1, dmg: 13, rate: 2, auto: false, mag: 6, reload: 1.9, spread: 0.006, pellets: 1, pierce: 1, range: 80, shake: 0.2, sound: 'revolver', slot: 1, model: 'revolver', desc: 'Six shots. Punches through one zombie.' },
  uzi:      { kind: 'gun', cat: 'PISTOLS', name: 'Uzi', price: 650, day: 2, dmg: 3.8, rate: 14, auto: true, mag: 32, reload: 1.5, spread: 0.045, pellets: 1, pierce: 0, range: 50, shake: 0.06, sound: 'ar', slot: 1, model: 'uzi', desc: 'One-handed bullet hose. Accuracy optional.' },
  deagle:   { kind: 'gun', cat: 'PISTOLS', name: 'Desert Eagle', price: 900, day: 3, dmg: 24, rate: 2.2, auto: false, mag: 7, reload: 1.6, spread: 0.008, pellets: 1, pierce: 1, range: 85, shake: 0.3, sound: 'revolver', slot: 1, model: 'deagle', knock: 3, desc: 'Hand cannon. Heads pop like grapes.' },
  dbarrel:  { kind: 'gun', cat: 'SHOTGUNS', name: 'Double Barrel', price: 400, day: 1, dmg: 5, rate: 3.5, auto: false, mag: 2, reload: 1.7, spread: 0.11, pellets: 10, pierce: 0, range: 22, shake: 0.45, sound: 'shotgun', slot: 2, model: 'dbarrel', knock: 5, desc: 'Two shells, two very bad days for someone.' },
  shotgun:  { kind: 'gun', cat: 'SHOTGUNS', name: 'Pump Shotgun', price: 600, day: 2, dmg: 4.5, rate: 1.3, auto: false, mag: 6, reload: 2.3, spread: 0.085, pellets: 8, pierce: 0, range: 28, shake: 0.35, sound: 'shotgun', slot: 2, model: 'shotgun', knock: 3, action: 'pump', desc: 'Close range crowd shredder.' },
  autoshot: { kind: 'gun', cat: 'SHOTGUNS', name: 'Auto Shotgun', price: 2600, day: 7, dmg: 4.2, rate: 4, auto: true, mag: 12, reload: 2.8, spread: 0.09, pellets: 7, pierce: 0, range: 26, shake: 0.3, sound: 'shotgun', slot: 2, model: 'autoshot', knock: 2.5, desc: 'Drum-fed. Hold the trigger, clear the porch.' },
  smg:      { kind: 'gun', cat: 'RIFLES', name: 'SMG', price: 950, day: 3, dmg: 4.6, rate: 12, auto: true, mag: 30, reload: 1.7, spread: 0.026, pellets: 1, pierce: 0, range: 60, shake: 0.07, sound: 'ar', slot: 2, model: 'smg', desc: 'Light, fast, reliable. Great for runners.' },
  ar:       { kind: 'gun', cat: 'RIFLES', name: 'Assault Rifle', price: 1400, day: 4, dmg: 6, rate: 9, auto: true, mag: 30, reload: 2.0, spread: 0.022, pellets: 1, pierce: 0, range: 90, shake: 0.1, sound: 'ar', slot: 2, model: 'ar', desc: 'Full auto. The workhorse of the apocalypse.' },
  ak:       { kind: 'gun', cat: 'RIFLES', name: 'AK-47', price: 1800, day: 5, dmg: 8.5, rate: 7.5, auto: true, mag: 30, reload: 2.3, spread: 0.03, pellets: 1, pierce: 1, range: 90, shake: 0.16, sound: 'rifle', slot: 2, model: 'ak', desc: 'Kicks like a mule, hits like one too.' },
  burst:    { kind: 'gun', cat: 'RIFLES', name: 'Burst Rifle', price: 2100, day: 6, dmg: 9.5, rate: 2.6, burst: 3, auto: true, mag: 36, reload: 2.1, spread: 0.01, pellets: 1, pierce: 1, range: 100, shake: 0.1, sound: 'ar', slot: 2, model: 'burst', desc: 'Three-round bursts. Tight groups, clean headshots.' },
  hunting:  { kind: 'gun', cat: 'SNIPERS', name: 'Lever Rifle', price: 550, day: 2, dmg: 16, rate: 1.8, auto: false, mag: 8, reload: 2.4, spread: 0.004, pellets: 1, pierce: 1, range: 100, shake: 0.22, sound: 'rifle', slot: 2, model: 'lever', action: 'lever', desc: 'Cowboy classic. Eight rounds, pierces one.' },
  rifle:    { kind: 'gun', cat: 'SNIPERS', name: 'Bolt Rifle', price: 800, day: 3, dmg: 20, rate: 1.5, auto: false, mag: 5, reload: 2.0, spread: 0.003, pellets: 1, pierce: 2, range: 110, shake: 0.25, sound: 'rifle', slot: 2, model: 'rifle', action: 'bolt', desc: 'Bolt action. Pierces two targets.' },
  dmr:      { kind: 'gun', cat: 'SNIPERS', name: 'Marksman Rifle', price: 1900, day: 5, dmg: 28, rate: 3, auto: false, mag: 10, reload: 2.2, spread: 0.004, pellets: 1, pierce: 2, range: 130, shake: 0.22, sound: 'rifle', slot: 2, model: 'dmr', zoom: 26, desc: 'Semi-auto with a light scope. Right-click to aim.' },
  sniper:   { kind: 'gun', cat: 'SNIPERS', name: 'Sniper Rifle', price: 2200, day: 6, dmg: 70, rate: 0.75, auto: false, mag: 5, reload: 2.6, spread: 0.0, pellets: 1, pierce: 6, range: 160, shake: 0.45, sound: 'sniper', slot: 2, model: 'sniper', zoom: 18, action: 'bolt', desc: 'Right-click to zoom. Goes through a whole line of them.' },
  antimat:  { kind: 'gun', cat: 'SNIPERS', name: '.50 Cal Rifle', price: 4800, day: 10, dmg: 190, rate: 0.5, auto: false, mag: 4, reload: 3.4, spread: 0.0, pellets: 1, pierce: 14, range: 200, shake: 0.7, sound: 'sniper', slot: 2, model: 'antimat', zoom: 14, knock: 7, moveMul: 0.85, desc: 'Anti-materiel. Brutes, bosses, helmets: all the same to it.' },
  lmg:      { kind: 'gun', cat: 'HEAVY', name: 'Light MG', price: 2600, day: 6, dmg: 5.5, rate: 13, auto: true, mag: 75, reload: 3.5, spread: 0.032, pellets: 1, pierce: 0, range: 85, shake: 0.09, sound: 'mg', slot: 2, model: 'lmg', moveMul: 0.9, desc: 'A box of bullets with a gun attached.' },
  mg:       { kind: 'gun', cat: 'HEAVY', name: 'Machine Gun', price: 3200, day: 8, dmg: 7, rate: 12, auto: true, mag: 100, reload: 4.2, spread: 0.035, pellets: 1, pierce: 1, range: 90, shake: 0.12, sound: 'mg', slot: 2, model: 'mg', moveMul: 0.85, desc: '100 round belt. Hold the line.' },
  launcher: { kind: 'gun', cat: 'HEAVY', name: 'Grenade Launcher', price: 3600, day: 8, dmg: 95, rate: 1.1, auto: false, mag: 6, reload: 3.0, spread: 0.004, pellets: 1, pierce: 0, range: 80, shake: 0.35, sound: 'shotgun', slot: 2, model: 'launcher', explosive: 4.5, desc: 'Lobs grenades that burst on impact. Mind the splash.' },
  minigun:  { kind: 'gun', cat: 'HEAVY', name: 'Minigun', price: 5000, day: 11, dmg: 7, rate: 24, auto: true, mag: 300, reload: 5.5, spread: 0.05, pellets: 1, pierce: 1, range: 90, shake: 0.1, sound: 'minigun', slot: 2, model: 'minigun', spin: 0.55, moveMul: 0.7, desc: 'Spins up. Then everything dies.' },

  knife:    { kind: 'melee', name: 'Knife', price: 0, day: 1, dmg: 9, rate: 2.6, range: 2.1, arc: 1.2, knock: 1.5, slot: 3, model: 'knife', anim: 'stab', hitDelay: 0.07, desc: 'Better than nothing. Quick stabs.' },
  crowbar:  { kind: 'melee', name: 'Crowbar', price: 150, day: 1, dmg: 12, rate: 2.2, range: 2.3, arc: 1.5, knock: 3.5, slot: 3, model: 'crowbar', anim: 'hswing', hitDelay: 0.1, desc: 'Fast backhand swings. A classic.' },
  bat:      { kind: 'melee', name: 'Baseball Bat', price: 200, day: 1, dmg: 16, rate: 1.7, range: 2.5, arc: 1.8, knock: 6, slot: 3, model: 'bat', anim: 'hswing', hitDelay: 0.13, desc: 'Home run. Wide swing sends them flying.' },
  machete:  { kind: 'melee', name: 'Machete', price: 350, day: 2, dmg: 20, rate: 2.3, range: 2.3, arc: 1.5, knock: 1.5, dismember: true, slot: 3, model: 'machete', anim: 'slash', hitDelay: 0.08, desc: 'Diagonal hacks, left then right.' },
  axe:      { kind: 'melee', name: 'Fire Axe', price: 450, day: 2, dmg: 30, rate: 1.3, range: 2.4, arc: 1.2, knock: 3, dismember: true, slot: 3, model: 'axe', anim: 'chop', hitDelay: 0.16, desc: 'Overhead chops. Chop chop.' },
  hammer:   { kind: 'melee', name: 'Sledgehammer', price: 750, day: 4, dmg: 48, rate: 0.85, range: 2.7, arc: 2.0, knock: 11, slot: 3, model: 'hammer', anim: 'slam', hitDelay: 0.3, desc: 'Slow wind-up. Devastating ground slam.' },
  katana:   { kind: 'melee', name: 'Japanese Sword', price: 1100, day: 5, dmg: 34, rate: 2.4, range: 2.8, arc: 1.7, knock: 2, dismember: true, slot: 3, model: 'katana', anim: 'slash', hitDelay: 0.07, desc: 'Fast, elegant, messy.' },
  chainsaw: { kind: 'melee', name: 'Chainsaw', price: 1800, day: 7, dmg: 90, rate: 0, continuous: true, range: 2.3, arc: 1.1, knock: 0.6, dismember: true, slot: 3, model: 'chainsaw', anim: 'saw', desc: 'Hold to rip and tear.' },
  saber:    { kind: 'melee', name: 'Lightsaber', price: 3600, day: 10, dmg: 70, rate: 3, range: 3.2, arc: 2.2, knock: 3, dismember: true, slot: 3, model: 'saber', anim: 'saber', hitDelay: 0.08, desc: 'An elegant weapon for an uncivilized apocalypse.' },
};

// How many weapons you carry into a fight. Everything else stays in the locker.
export const LOADOUT_SIZE = 4;

// Weapon upgrades: each level costs more and improves the gun (or blade).
export const UPGRADE = {
  max: 3,
  cost: (w, lvl) => Math.round(Math.max(250, w.price) * [0.45, 0.75, 1.1][lvl] / 10) * 10,
  gun: { dmg: 0.2, mag: 0.25, reload: -0.12, rate: 0.06, spread: -0.12 },
  melee: { dmg: 0.25, rate: 0.08, range: 0.05 },
};

export function weaponStats(id, lvl = 0) {
  const b = WEAPONS[id];
  if (!lvl) return b;
  const w = { ...b }, u = b.kind === 'gun' ? UPGRADE.gun : UPGRADE.melee;
  for (const [k, v] of Object.entries(u)) if (typeof w[k] === 'number') w[k] = w[k] * (1 + v * lvl);
  if (w.mag) w.mag = Math.round(w.mag);
  return w;
}

export const HEALS = {
  banana: { name: 'Banana', price: 40, heal: 20, desc: 'Potassium! Restores 20 health.' },
  medkit: { name: 'Medkit', price: 170, heal: 60, desc: 'Field dressing. Restores 60 health.' },
};
// Healing is never free: buy it here, carry consumables, or hire a medic.
export const HEAL_COST_PER_HP = 1.5;

export const GRENADE = { name: 'Grenades x3', price: 150, count: 3, dmg: 120, radius: 5.5, fuse: 1.6 };

export const ARMOR = [
  { id: 'none', name: 'T-Shirt', reduce: 0, price: 0 },
  { id: 'jacket', name: 'Leather Jacket', reduce: 0.15, price: 250, day: 1 },
  { id: 'vest', name: 'Kevlar Vest', reduce: 0.3, price: 800, day: 3 },
  { id: 'riot', name: 'Riot Armor', reduce: 0.45, price: 1800, day: 6 },
  { id: 'jugg', name: 'Juggernaut Suit', reduce: 0.6, price: 4000, day: 10 },
];

// type: wall | trap | tower | platform. w/d = footprint (x/z) before rotation
// You walk through your own builds; platforms are climbed by walking into them.
export const STRUCTURES = {
  wood:     { type: 'wall', name: 'Wooden Barricade', price: 100, day: 1, hp: 180, w: 3.2, d: 0.7, h: 1.4, desc: 'Planks and nails. Buys you time.' },
  roadblock:{ type: 'wall', name: 'Roadblock', price: 180, day: 1, hp: 320, w: 4, d: 0.8, h: 1.1, desc: 'Striped road barrier. Sturdier than it looks.' },
  sandbag:  { type: 'wall', name: 'Sandbag Wall', price: 280, day: 2, hp: 520, w: 3.2, d: 1.1, h: 1.2, desc: 'Soaks up a lot of punishment.' },
  concrete: { type: 'wall', name: 'Concrete Barrier', price: 550, day: 4, hp: 1100, w: 3.6, d: 1.0, h: 1.3, desc: 'Jersey barrier. They will need a while.' },
  steel:    { type: 'wall', name: 'Steel Wall', price: 1100, day: 7, hp: 2400, w: 3.6, d: 0.6, h: 2.2, desc: 'Nothing gets through. For a while.' },
  platform: { type: 'platform', name: 'Wooden Platform', price: 300, day: 1, hp: 300, w: 2.4, d: 2.4, h: 1.6, desc: 'Climb up and shoot over your barricades.' },
  scaffold: { type: 'platform', name: 'Steel Scaffold', price: 900, day: 4, hp: 900, w: 3.2, d: 2.4, h: 2.6, desc: 'Taller, tougher firing platform. Walk into it to climb.' },
  wire:     { type: 'trap', name: 'Barbed Wire', price: 160, day: 1, hp: 350, w: 3.6, d: 1.4, h: 0.6, slow: 0.45, dps: 4, desc: 'Slows and shreds anything that walks in.' },
  spikes:   { type: 'trap', name: 'Spike Barrier', price: 320, day: 2, hp: 600, w: 3.2, d: 1.6, h: 0.7, slow: 0.7, dps: 16, desc: 'Sharpened stakes. Zombies hate it.' },
  claymore: { type: 'trap', name: 'Claymore Mine x2', price: 500, day: 3, hp: 1, w: 0.6, d: 0.4, h: 0.4, count: 2, dmg: 180, radius: 6, desc: 'FRONT TOWARD ENEMY. Boom.' },
  sentry:   { type: 'tower', name: 'Sentry Gun', price: 1300, day: 4, hp: 400, w: 1.2, d: 1.2, h: 1.3, dmg: 4, rate: 7, range: 24, desc: 'Automatic turret. Spits lead at anything that moves.' },
  tower:    { type: 'tower', name: 'Guard Tower', price: 2200, day: 6, hp: 800, w: 2.4, d: 2.4, h: 5, dmg: 36, rate: 1, range: 45, pierce: 3, desc: 'A sniper on a tower. Your best friend.' },
};

export const ZOMBIES = {
  walker:  { name: 'Walker', hp: 22, speed: 1.55, dmg: 9, rate: 1, $: 8, scale: 1, skin: [0x7da05a, 0x8bab62, 0x6f9450], shirt: [0x5b6e8c, 0x8c5b5b, 0x6e6e6e, 0x8c7a4f, 0x4f7a5b] },
  runner:  { name: 'Runner', hp: 15, speed: 4.1, dmg: 7, rate: 1.6, $: 10, scale: 0.95, skin: [0xa3b27a, 0x9aa870], shirt: [0xb03a2e, 0x2e6fb0, 0xd4d4d4] },
  helmet:  { name: 'Helmet Zombie', hp: 30, speed: 1.45, dmg: 10, rate: 1, $: 14, scale: 1, helmet: 45, skin: [0x7da05a, 0x6f9450], shirt: [0x3d5230, 0x4a5a3a] },
  riser:   { name: 'Reviver', hp: 24, speed: 1.6, dmg: 10, rate: 1, $: 14, scale: 1, revive: true, skin: [0x6c8f9e, 0x7a9aa8], shirt: [0x2a2a2a, 0x3b2a4a] },
  crawler: { name: 'Crawler', hp: 12, speed: 1.2, dmg: 6, rate: 1.4, $: 8, scale: 1, crawl: true, skin: [0x8c7a5a, 0x7d6c4f], shirt: [0x5a4a3a] },
  bloater: { name: 'Bloater', hp: 50, speed: 1.05, dmg: 12, rate: 0.8, $: 20, scale: 1.35, fat: true, explode: { dmg: 45, radius: 4.5 }, skin: [0xa8b84a, 0xb5c255], shirt: [0xd6d0b8] },
  spitter: { name: 'Spitter', hp: 26, speed: 1.4, dmg: 8, rate: 1, $: 18, scale: 1, spit: { range: 15, cd: 3.2, dmg: 11, radius: 1.8 }, skin: [0x9ac05a, 0x8ab84a], shirt: [0x4a6a2a, 0x6a6a3a] },
  leaper:  { name: 'Leaper', hp: 18, speed: 3.3, dmg: 8, rate: 1.5, $: 16, scale: 0.9, leap: true, skin: [0x8a9a8a, 0x7a8a7a], shirt: [0x2a2a2a, 0x5a2a2a] },
  screamer:{ name: 'Screamer', hp: 30, speed: 1.6, dmg: 6, rate: 1, $: 24, scale: 1, scream: true, skin: [0xc0c0a8, 0xb0b098], shirt: [0xe0e0e0, 0x8a3a6a] },
  riot:    { name: 'Riot Zombie', hp: 40, speed: 1.35, dmg: 12, rate: 1, $: 26, scale: 1.05, shield: true, helmet: 30, skin: [0x7da05a, 0x6f9450], shirt: [0x1a1a2a, 0x2a2a3a] },
  brute:   { name: 'Brute', hp: 240, speed: 1.25, dmg: 32, rate: 0.7, $: 60, scale: 1.75, heavy: true, skin: [0x6b7f4a, 0x5f7342], shirt: [0x3a3a3a, 0x4a2a2a] },
  boss:    { name: 'THE ABOMINATION', hp: 1800, speed: 1.1, dmg: 42, rate: 0.6, $: 900, scale: 3.4, heavy: true, boss: true, slam: true, summon: ['walker', 'runner'], skin: [0x8f4a5a], shirt: [0x3a1a1a] },
  butcher: { name: 'THE BUTCHER', hp: 1500, speed: 1.5, dmg: 50, rate: 0.8, $: 1100, scale: 2.7, heavy: true, boss: true, charge: true, skin: [0xb07a6a], shirt: [0xd8d0c0] },
  queen:   { name: 'THE BROODMOTHER', hp: 2300, speed: 0.95, dmg: 38, rate: 0.6, $: 1400, scale: 3.1, heavy: true, fat: true, boss: true, volley: true, summon: ['crawler', 'leaper', 'spitter'], skin: [0x8ab04a], shirt: [0x4a3a2a] },
};

export const BOSS_ROTATION = ['boss', 'butcher', 'queen'];
export const bossForDay = (day) => BOSS_ROTATION[(Math.floor(day / 5) - 1) % BOSS_ROTATION.length];

export function zombieUnlocked(type, day) {
  return day >= ({ walker: 1, crawler: 2, runner: 3, helmet: 3, riser: 4, bloater: 5, spitter: 5, brute: 6, leaper: 6, screamer: 7, riot: 8 })[type];
}

// Hired allies fight at your side. Dead allies stay dead; the living are patched up every morning.
export const PARTNERS = {
  rookie:  { name: 'Rookie', price: 450, day: 1, hp: 80, color: 0x8a6a3a, model: 'pistol', dmg: 5, rate: 2.2, mag: 12, reload: 1.5, spread: 0.03, pellets: 1, pierce: 0, range: 40, sound: 'pistol', desc: 'Eager kid with a pistol. Better than nobody.' },
  shotty:  { name: 'Shotgunner', price: 1100, day: 2, hp: 150, color: 0x6a3a2a, model: 'shotgun', dmg: 4, rate: 1.1, mag: 6, reload: 2.4, spread: 0.1, pellets: 7, pierce: 0, range: 18, sound: 'shotgun', desc: 'Stays close, blasts whatever gets near you.' },
  soldier: { name: 'Soldier', price: 1500, day: 3, hp: 140, color: 0x4a5a3a, model: 'ar', dmg: 5.5, rate: 7, mag: 30, reload: 2.2, spread: 0.03, pellets: 1, pierce: 0, range: 60, sound: 'ar', desc: 'Trained, disciplined, full auto.' },
  medic:   { name: 'Medic', price: 1800, day: 4, hp: 110, color: 0xe8e8e8, model: 'pistol', dmg: 5, rate: 2, mag: 12, reload: 1.5, spread: 0.03, pellets: 1, pierce: 0, range: 40, sound: 'pistol', heal: 2.5, desc: 'Heals you and your allies when close (2.5 HP/s).' },
  marksman:{ name: 'Marksman', price: 2600, day: 5, hp: 90, color: 0x3a4a5a, model: 'sniper', dmg: 45, rate: 0.7, mag: 5, reload: 2.8, spread: 0.002, pellets: 1, pierce: 4, range: 90, sound: 'sniper', desc: 'Picks off the big ones from range. Loves headshots.' },
  heavy:   { name: 'Heavy', price: 4200, day: 8, hp: 280, color: 0x5a2a2a, model: 'mg', dmg: 7, rate: 10, mag: 100, reload: 4, spread: 0.04, pellets: 1, pierce: 1, range: 70, sound: 'mg', desc: 'Big guy, bigger gun, lots of health.' },
};
export const MAX_PARTNERS = 3;

// Rebindable actions. Arrow keys also move, and the mouse fires/aims.
export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC',
  reload: 'KeyR', kick: 'KeyF', grenade: 'KeyG', banana: 'KeyE', medkit: 'KeyT',
  swap: 'KeyQ', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
  view: 'KeyV', pause: 'KeyP', mute: 'KeyM',
};
export const BIND_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  jump: 'Jump', sprint: 'Sprint', crouch: 'Crouch (sprint + crouch = slide)',
  reload: 'Reload', kick: 'Kick', grenade: 'Throw grenade', banana: 'Eat banana', medkit: 'Use medkit',
  swap: 'Next weapon', slot1: 'Weapon slot 1', slot2: 'Weapon slot 2', slot3: 'Weapon slot 3', slot4: 'Weapon slot 4',
  view: '1st / 3rd person', pause: 'Pause', mute: 'Mute',
};
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  const map = { Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'TAB', CapsLock: 'CAPS', Backquote: '`', Enter: 'ENTER' };
  return map[code] || code.toUpperCase();
}

export const ORPHANAGE_HP = 2000;
export const PLAYER_HP = 100;
