# They Are Coming 3D

A 3D, browser-only take on OnHit's *They Are Coming*: defend the orphanage against zombie hordes, day after day. Buy guns, melee weapons, armour, barricades, traps and guard towers between days, then hold the line in first or third person when night falls.

No backend, no asset downloads: models are generated voxels, and all sound and music is synthesized with WebAudio. Progress is saved in `localStorage`.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produces dist/index.html, a single self-contained file
```

`dist/index.html` can be opened straight from disk (`file://`), or dropped onto any static host.

## How it plays

- **Build phase:** shop from the tabs on the right. Click a structure, then click the map to place it. `R` rotates, `Shift` keeps placing, right-click cancels. Click a placed structure to sell it.
- **Day:** *THEY ARE COMING.* Survive every wave while dusk turns to night. Kill money is paid out at the end of the day, with bonuses for surviving and keeping the orphanage intact.
- **Run over** if you die or the orphanage falls (roguelike). Your best day is recorded per difficulty. The run is also saved at the start of each day, so closing the tab only costs you the current day.
- **Difficulty:** Survivor (easy), Veteran (normal), Nightmare (hard: endless night, faster, more zombies).
- **Playground:** everything unlocked, spawn zombies on demand (`Z` horde, `X` one zombie, `B` boss, `K` kill all, `H` god mode, `Tab` back to build mode).

| Key | Action |
| --- | --- |
| WASD / Mouse | Move / aim |
| LMB / RMB | Shoot or swing / sniper zoom |
| R | Reload |
| F | Kick |
| G | Grenade |
| 1-9, wheel, Q | Switch weapon |
| Shift / Space | Sprint / jump |
| V | First / third person |
| Esc or P / M | Pause / mute |

Zombies: Walker, Runner, Helmet (shoot the helmet off first), Reviver (gets back up unless you finish the head), Crawler, Bloater (explodes), Brute, and a boss on every 5th day.

## Code map

| File | What lives there |
| --- | --- |
| `src/config.js` | All tuning: difficulties, weapons, armour, structures, zombie stats |
| `src/game.js` | State machine (menu → build → wave → day clear / game over), wave director, economy, hitscan, explosions, save |
| `src/world.js` | Renderer, pixel-art post pass, orphanage and street, day/night lighting |
| `src/player.js` | FPS/TPS controller, weapons, melee, kick, grenades, viewmodel |
| `src/zombies.js` | Zombie AI, barricade breaking, ragdoll deaths, dismemberment, boss |
| `src/structures.js` | Placement, barricades, traps, claymores, sentry guns and guard towers |
| `src/effects.js` | Instanced particles, blood decals, tracers, explosions, floating text |
| `src/models.js` | Voxel model builders, plus geometry baking to keep draw calls low |
| `src/ui.js`, `src/style.css`, `index.html` | HUD, menus, shop |
| `src/audio.js` | Synthesized SFX and step-sequenced music |

Appending `?nolock` to the URL lets the wave run without pointer lock, which is used for automated testing.
