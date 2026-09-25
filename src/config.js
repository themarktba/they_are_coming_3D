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

// kind: gun | melee | throw
export const WEAPONS = {
  pistol:   { kind: 'gun', name: 'Pistol', price: 0, day: 1, dmg: 5.5, rate: 4, auto: false, mag: 12, reload: 1.1, spread: 0.012, pellets: 1, pierce: 0, range: 70, shake: 0.08, sound: 'pistol', slot: 1, model: 'pistol', desc: 'Old reliable. Unlimited ammo, limited patience.' },
  revolver: { kind: 'gun', name: 'Revolver', price: 300, day: 1, dmg: 13, rate: 2, auto: false, mag: 6, reload: 1.9, spread: 0.006, pellets: 1, pierce: 1, range: 80, shake: 0.2, sound: 'revolver', slot: 1, model: 'revolver', desc: 'Six shots. Punches through one zombie.' },
  shotgun:  { kind: 'gun', name: 'Shotgun', price: 600, day: 2, dmg: 4.5, rate: 1.3, auto: false, mag: 6, reload: 2.3, spread: 0.085, pellets: 8, pierce: 0, range: 28, shake: 0.35, sound: 'shotgun', slot: 2, model: 'shotgun', knock: 3, desc: 'Close range crowd shredder.' },
  rifle:    { kind: 'gun', name: 'Rifle', price: 800, day: 3, dmg: 20, rate: 1.5, auto: false, mag: 5, reload: 2.0, spread: 0.003, pellets: 1, pierce: 2, range: 110, shake: 0.25, sound: 'rifle', slot: 2, model: 'rifle', desc: 'Bolt action. Pierces two targets.' },
  ar:       { kind: 'gun', name: 'Assault Rifle', price: 1400, day: 4, dmg: 6, rate: 9, auto: true, mag: 30, reload: 2.0, spread: 0.022, pellets: 1, pierce: 0, range: 90, shake: 0.1, sound: 'ar', slot: 2, model: 'ar', desc: 'Full auto. The workhorse of the apocalypse.' },
  sniper:   { kind: 'gun', name: 'Sniper Rifle', price: 2200, day: 6, dmg: 70, rate: 0.75, auto: false, mag: 5, reload: 2.6, spread: 0.0, pellets: 1, pierce: 6, range: 160, shake: 0.45, sound: 'sniper', slot: 2, model: 'sniper', zoom: true, desc: 'Right-click to zoom. Goes through a whole line of them.' },
  mg:       { kind: 'gun', name: 'Machine Gun', price: 3200, day: 8, dmg: 7, rate: 12, auto: true, mag: 100, reload: 4.2, spread: 0.035, pellets: 1, pierce: 1, range: 90, shake: 0.12, sound: 'mg', slot: 2, model: 'mg', moveMul: 0.85, desc: '100 round belt. Hold the line.' },
  minigun:  { kind: 'gun', name: 'Minigun', price: 5000, day: 11, dmg: 7, rate: 24, auto: true, mag: 300, reload: 5.5, spread: 0.05, pellets: 1, pierce: 1, range: 90, shake: 0.1, sound: 'minigun', slot: 2, model: 'minigun', spin: 0.55, moveMul: 0.7, desc: 'Spins up. Then everything dies.' },

  knife:    { kind: 'melee', name: 'Knife', price: 0, day: 1, dmg: 9, rate: 2.6, range: 2.1, arc: 1.2, knock: 1.5, slot: 3, model: 'knife', desc: 'Better than nothing.' },
  bat:      { kind: 'melee', name: 'Baseball Bat', price: 200, day: 1, dmg: 16, rate: 1.7, range: 2.5, arc: 1.6, knock: 6, slot: 3, model: 'bat', desc: 'Home run. Sends them flying.' },
  axe:      { kind: 'melee', name: 'Fire Axe', price: 450, day: 2, dmg: 30, rate: 1.3, range: 2.4, arc: 1.4, knock: 3, dismember: true, slot: 3, model: 'axe', desc: 'Chop chop.' },
  hammer:   { kind: 'melee', name: 'Sledgehammer', price: 750, day: 4, dmg: 48, rate: 0.85, range: 2.7, arc: 2.0, knock: 11, slot: 3, model: 'hammer', desc: 'Slow. Devastating. Wide swing.' },
  katana:   { kind: 'melee', name: 'Japanese Sword', price: 1100, day: 5, dmg: 34, rate: 2.4, range: 2.8, arc: 1.7, knock: 2, dismember: true, slot: 3, model: 'katana', desc: 'Fast, elegant, messy.' },
  chainsaw: { kind: 'melee', name: 'Chainsaw', price: 1800, day: 7, dmg: 90, rate: 0, continuous: true, range: 2.3, arc: 1.1, knock: 0.6, dismember: true, slot: 3, model: 'chainsaw', desc: 'Hold to rip and tear.' },
  saber:    { kind: 'melee', name: 'Lightsaber', price: 3600, day: 10, dmg: 70, rate: 3, range: 3.2, arc: 2.2, knock: 3, dismember: true, slot: 3, model: 'saber', desc: 'An elegant weapon for an uncivilized apocalypse.' },
};

export const GRENADE = { name: 'Grenades x3', price: 150, count: 3, dmg: 120, radius: 5.5, fuse: 1.6 };

export const ARMOR = [
  { id: 'none', name: 'T-Shirt', reduce: 0, price: 0 },
  { id: 'jacket', name: 'Leather Jacket', reduce: 0.15, price: 250, day: 1 },
  { id: 'vest', name: 'Kevlar Vest', reduce: 0.3, price: 800, day: 3 },
  { id: 'riot', name: 'Riot Armor', reduce: 0.45, price: 1800, day: 6 },
  { id: 'jugg', name: 'Juggernaut Suit', reduce: 0.6, price: 4000, day: 10 },
];

// type: wall | trap | tower. w/d = footprint (x/z) before rotation
export const STRUCTURES = {
  wood:     { type: 'wall', name: 'Wooden Barricade', price: 100, day: 1, hp: 180, w: 3.2, d: 0.7, h: 1.4, desc: 'Planks and nails. Buys you time.' },
  roadblock:{ type: 'wall', name: 'Roadblock', price: 180, day: 1, hp: 320, w: 4, d: 0.8, h: 1.1, desc: 'Striped road barrier. Sturdier than it looks.' },
  sandbag:  { type: 'wall', name: 'Sandbag Wall', price: 280, day: 2, hp: 520, w: 3.2, d: 1.1, h: 1.2, desc: 'Soaks up a lot of punishment.' },
  concrete: { type: 'wall', name: 'Concrete Barrier', price: 550, day: 4, hp: 1100, w: 3.6, d: 1.0, h: 1.3, desc: 'Jersey barrier. They will need a while.' },
  steel:    { type: 'wall', name: 'Steel Wall', price: 1100, day: 7, hp: 2400, w: 3.6, d: 0.6, h: 2.2, desc: 'Nothing gets through. For a while.' },
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
  brute:   { name: 'Brute', hp: 240, speed: 1.25, dmg: 32, rate: 0.7, $: 60, scale: 1.75, heavy: true, skin: [0x6b7f4a, 0x5f7342], shirt: [0x3a3a3a, 0x4a2a2a] },
  boss:    { name: 'THE ABOMINATION', hp: 1800, speed: 1.1, dmg: 42, rate: 0.6, $: 900, scale: 3.4, heavy: true, boss: true, skin: [0x8f4a5a], shirt: [0x3a1a1a] },
};

export function zombieUnlocked(type, day) {
  return day >= ({ walker: 1, crawler: 2, runner: 3, helmet: 3, riser: 4, bloater: 5, brute: 6 })[type];
}

export const ORPHANAGE_HP = 2000;
export const PLAYER_HP = 100;
