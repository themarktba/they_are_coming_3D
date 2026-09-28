// Co-op relay server. The host's browser runs the simulation; this server only
// hands out room codes and forwards messages between the host and its guests.
// It also serves the built game (dist/index.html) so one container is a full deploy.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;
// behind a reverse proxy (Caddy on the droplet) set HOST=127.0.0.1 so the port isn't public
const HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 100;
const MAX_MSGS_PER_SEC = 120; // host snapshots are 15/s, guest updates 20/s; anything far above is abuse
const DIST = process.env.STATIC_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = new Map(); // code -> { code, host, peers: Map<id, ws>, nextId }

// The front page is deliberately plain and says nothing about what runs here.
const HOME = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Welcome</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;color:#555;background:#fafafa}main{text-align:center}h1{font-weight:400;font-size:1.4rem;color:#333}</style>
</head><body><main><h1>Welcome</h1><p>There is nothing to see here.</p></main></body></html>`;
// the game page lives at an unadvertised path; set GAME_PATH to change it
const GAME_PATH = process.env.GAME_PATH || '/play';
// browsers send Origin on WebSocket upgrades; only the game's own pages may connect
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' };

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const reply = (code, type, body) => { res.writeHead(code, { 'content-type': type, ...SECURITY_HEADERS }); res.end(body); };
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, 'text/plain', 'Method not allowed');
  if (url === '/') return reply(200, 'text/html; charset=utf-8', HOME);
  if (url === '/health') return reply(200, 'application/json', '{"ok":true}');
  if (url === '/robots.txt') return reply(200, 'text/plain', 'User-agent: *\nDisallow: /\n');
  if (url !== GAME_PATH && url !== GAME_PATH + '/') return reply(404, 'text/plain', 'Not found');
  fs.readFile(path.join(DIST, 'index.html'), (err, data) => {
    if (err) return reply(500, 'text/plain', 'Not available');
    reply(200, 'text/html; charset=utf-8', data);
  });
});

const wss = new WebSocketServer({
  server, path: '/ws', maxPayload: 512 * 1024,
  verifyClient: ({ origin }) => !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || ''),
});

function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const cleanName = (n) => String(n || 'Survivor').replace(/[^\w \-.!?]/g, '').slice(0, 16) || 'Survivor';

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  let windowStart = Date.now(), count = 0;
  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; count = 0; }
    if (++count > MAX_MSGS_PER_SEC) { ws.close(1008, 'rate limit'); return; }
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.room;
    if (!room) {
      if (msg.t === 'create') {
        if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', msg: 'Server is full, try again later' });
        const code = newCode();
        const r = { code, host: ws, peers: new Map(), nextId: 1 };
        rooms.set(code, r);
        ws.room = r; ws.pid = 0; ws.name = cleanName(msg.name);
        send(ws, { t: 'created', code, id: 0 });
        console.log(`room ${code} created by ${ws.name}`);
      } else if (msg.t === 'join') {
        const r = rooms.get(String(msg.code || '').toUpperCase());
        if (!r) return send(ws, { t: 'error', msg: 'Room not found' });
        if (r.peers.size + 1 >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room is full' });
        ws.room = r; ws.pid = r.nextId++; ws.name = cleanName(msg.name);
        r.peers.set(ws.pid, ws);
        send(ws, { t: 'joined', code: r.code, id: ws.pid, host: r.host.name });
        send(r.host, { t: 'peer', id: ws.pid, name: ws.name, on: true });
      }
      return;
    }
    if (ws === room.host) {
      // host -> one guest or everyone
      if (msg.to === 'all') { const s = JSON.stringify(msg.m); for (const p of room.peers.values()) if (p.readyState === 1) p.send(s); }
      else send(room.peers.get(msg.to), msg.m);
    } else {
      // guest -> host, tagged with who sent it
      send(room.host, { from: ws.pid, m: msg.m });
    }
  });
  ws.on('close', () => {
    const r = ws.room;
    if (!r) return;
    if (ws === r.host) {
      for (const p of r.peers.values()) { send(p, { t: 'hostleft' }); p.room = null; }
      rooms.delete(r.code);
      console.log(`room ${r.code} closed`);
    } else {
      r.peers.delete(ws.pid);
      send(r.host, { t: 'peer', id: ws.pid, name: ws.name, on: false });
    }
  });
});

// drop dead connections
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
}, 15000);

server.listen(PORT, HOST, () => console.log(`co-op server on http://${HOST}:${PORT} (game: ${GAME_PATH}, ws: /ws)`));
