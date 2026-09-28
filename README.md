# They Are Coming 3D

A 3D, browser-only take on OnHit's *They Are Coming*: defend the orphanage against zombie hordes, day after day. Buy guns, melee weapons, armour, barricades, traps and guard towers between days, then hold the line in first or third person when night falls.

**[Play it in your browser](https://themarktba.github.io/they_are_coming_3D/)**

Single-player needs no backend and no asset downloads: models are generated voxels, and all sound and music is synthesized with WebAudio. Progress is saved in `localStorage`.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produces dist/index.html, a single self-contained file
```

`dist/index.html` can be opened straight from disk (`file://`), or dropped onto any static host.

## Online co-op

Up to 4 players defend the orphanage together. The host's browser runs the zombies, waves and money; a small Node server (`server/index.js`) hands out 4-letter room codes and relays messages. Money is shared, each player has their own weapons, loadout and health. A player who dies spectates and gets back up at dawn; the run ends when everyone is down or the orphanage falls. Co-op doesn't pause, and allies and saving are single-player only.

```bash
npm run build      # the server also serves dist/index.html
npm run server     # http://localhost:8787 (WebSocket on /ws)
```

Open `http://localhost:8787/play` (the front page `/` is intentionally a blank placeholder), choose **ONLINE CO-OP**, host a game and share the code. Friends on the same network use `http://<your-ip>:8787/play`. Set `ALLOWED_ORIGINS` (comma-separated) to restrict which pages may open co-op connections. During `npm run dev` the game connects to `ws://localhost:8787/ws` by default; the server address can be changed on the co-op screen.

### Production server

The live co-op server runs at **https://159-203-121-69.sslip.io** (game at `/play`; `/` is a blank placeholder page) on the shared DigitalOcean droplet, which is managed from a separate infra repo (Caddy for HTTPS with automatic Let's Encrypt certificates, this server as a systemd service on `127.0.0.1:8787`). The GitHub Pages build defaults to `wss://159-203-121-69.sslip.io/ws`.

To ship a server update: bump `version` in `package.json`, push a tag `vX.Y.Z` (the *Server release* workflow publishes `tac3d-X.Y.Z.tar.gz`, built by `scripts/package.sh`), then pin and deploy it from the infra repo.

### Deploying to DigitalOcean with Docker

The `Dockerfile` builds the game and runs the server on port 8080, so one container is the whole deploy.

- **App Platform (easiest):** create an app from this repo, pick the Dockerfile, set the HTTP port to 8080. You get an `https://` URL with WebSockets (`wss://…/ws`) included, and the game picks the right address automatically when opened from that URL.
- **Droplet:** `docker build -t tac3d . && docker run -d -p 80:8080 --restart unless-stopped tac3d`. Put Caddy or nginx with TLS in front if you want `https`/`wss`; the GitHub Pages build (https) can only reach a `wss://` server.

## How it plays

- **Build phase:** shop from the tabs on the right. Click a structure, then click the map to place it. `R` rotates, `Shift` keeps placing, right-click cancels. Click a placed structure to sell it.
- **Loadout:** you carry 4 weapons into a fight. Click an owned weapon in the shop to equip or stash it, and upgrade weapons up to MK4 (damage, magazine, reload, fire rate).
- **Health:** no natural regeneration. Heal in the shop between days, eat bananas (`E`), use medkits (`T`), hire a Medic, or pick up snacks some zombies drop.
- **Defenses:** you walk through your own builds, but your bullets don't go through walls. Climb a Wooden Platform or Steel Scaffold (walk into it) to shoot over your barricades.
- **Allies:** hire up to 3 (Rookie, Shotgunner, Soldier, Medic, Marksman, Heavy). They follow you and fight; dead allies stay dead.
- **Day:** *THEY ARE COMING.* Survive every wave while dusk turns to night. Kill money is paid out at the end of the day, with bonuses for surviving and keeping the orphanage intact.
- **Run over** if you die or the orphanage falls (roguelike). Your best day is recorded per difficulty. The run is also saved at the start of each day, so closing the tab only costs you the current day.
- **Difficulty:** Survivor (easy), Veteran (normal), Nightmare (hard: endless night, faster, more zombies).
- **Playground:** everything unlocked, spawn zombies on demand (`Z` horde, `X` one zombie, `B` boss, `K` kill all, `H` god mode, `Tab` back to build mode).

Default keys (all rebindable in Settings → Keybinds):

| Key | Action |
| --- | --- |
| WASD / Mouse | Move / aim |
| LMB / RMB | Shoot or swing / scope zoom |
| R | Reload |
| F | Kick |
| G | Grenade |
| E / T | Eat banana / use medkit |
| 1-4, wheel, Q | Switch weapon |
| Shift / Space | Sprint (you can shoot while sprinting) / jump |
| C | Crouch; while sprinting: slide |
| V | First / third person |
| Esc or P / M | Pause / mute |

Zombies: Walker, Runner, Helmet (shoot the helmet off first), Reviver (gets back up unless you finish the head), Crawler, Bloater (explodes), Spitter (lobs acid from range), Leaper (jumps at you and over walls), Screamer (enrages the horde), Riot (shield blocks frontal fire), Brute. Bosses rotate every 5th day: The Abomination (ground slam, summons), The Butcher (telegraphed charge through barricades), The Broodmother (acid volleys, spawns brood); from day 25 two bosses arrive.

## Code map

| File | What lives there |
| --- | --- |
| `src/config.js` | All tuning: difficulties, weapons, armour, structures, zombie stats |
| `src/game.js` | State machine (menu → build → wave → day clear / game over), wave director, economy, hitscan, explosions, save |
| `src/world.js` | Renderer, pixel-art post pass, orphanage and street, day/night lighting |
| `src/player.js` | FPS/TPS controller, weapons, melee, kick, grenades, viewmodel |
| `src/zombies.js` | Zombie AI, barricade breaking, ragdoll deaths, dismemberment, boss |
| `src/structures.js` | Placement, barricades, platforms, traps, claymores, sentry guns and guard towers |
| `src/partners.js` | Hired allies: formation following, targeting, medic healing |
| `src/net.js`, `server/index.js` | Online co-op: snapshots, effect mirroring, teammate avatars; relay server |
| `src/effects.js` | Instanced particles, blood decals, tracers, explosions, floating text |
| `src/models.js` | Voxel model builders, plus geometry baking to keep draw calls low |
| `src/ui.js`, `src/style.css`, `index.html` | HUD, menus, shop |
| `src/audio.js` | Synthesized SFX and step-sequenced music |

Appending `?nolock` to the URL lets the wave run without pointer lock, which is used for automated testing.
