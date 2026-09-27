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

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  const file = path.join(DIST, 'index.html');
  if (url !== '/' && url !== '/index.html') { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(500); res.end('Game not built. Run `npm run build` first.'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });

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

server.listen(PORT, HOST, () => console.log(`They Are Coming co-op server on http://${HOST}:${PORT} (ws: /ws)`));
