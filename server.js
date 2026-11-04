import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { createSession, join, act, tick, view } from './game.js';

const PORT = process.env.PORT || 3000;
const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address || 'localhost';
const BASE = process.env.PUBLIC_URL || `http://${lanIp}:${PORT}`;
function ssid() { // ponytail: nmcli only (Linux/NetworkManager); empty string elsewhere
  try { return execFileSync('nmcli', ['-t', '-f', 'active,ssid', 'dev', 'wifi'], { encoding: 'utf8', timeout: 2000 }).split('\n').find((l) => l.startsWith('yes:'))?.slice(4) || ''; } catch { return ''; }
}
const lists = Object.fromEntries(fs.readdirSync('songs').filter((f) => f.endsWith('.json'))
  .map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join('songs', f), 'utf8'))]));

let session = null; // one room, one session at a time (ponytail: multiple rooms if ever needed)
const clients = new Map(); // ws -> player id | 'tv'

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  if (url.pathname === '/wifi-qr') { // Wi-Fi join QR incl. password: only for the laptop itself (the TV page), never for phones
    // from the laptop itself: loopback or one of its own addresses (the TV page is often opened via the LAN IP)
    const own = new Set(Object.values(os.networkInterfaces()).flat().flatMap((i) => [i.address, `::ffff:${i.address}`]));
    if (!own.has(req.socket.remoteAddress)) return res.writeHead(403).end();
    const name = ssid(); let pw = '';
    try { pw = execFileSync('nmcli', ['-s', '-g', '802-11-wireless-security.psk', 'connection', 'show', name], { encoding: 'utf8', timeout: 2000 }).trim(); } catch {}
    const esc = (x) => x.replace(/([\\;,:"])/g, '\\$1');
    if (!name) return res.writeHead(404).end();
    res.setHeader('content-type', 'image/svg+xml'); res.setHeader('cache-control', 'no-store');
    return res.end(await QRCode.toString(`WIFI:T:${pw ? 'WPA' : 'nopass'};S:${esc(name)};${pw ? `P:${esc(pw)};` : ''};`, { type: 'svg', margin: 1 }));
  }
  if (url.pathname === '/qr') {
    res.setHeader('content-type', 'image/svg+xml');
    return res.end(await QRCode.toString(url.searchParams.get('u') || BASE, { type: 'svg', margin: 1 }));
  }
  if (url.pathname === '/info') return res.setHeader('content-type', 'application/json'), res.end(JSON.stringify({ base: BASE, ssid: ssid(), lists: Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length])) }));
  const file = { '/': 'tv.html', '/play': 'play.html' }[url.pathname] || url.pathname.slice(1);
  const full = path.join('public', file);
  if (!full.startsWith('public' + path.sep) || !fs.existsSync(full)) return res.writeHead(404).end();
  res.setHeader('content-type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(full)] || 'application/octet-stream');
  fs.createReadStream(full).pipe(res);
});

const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
function broadcast() {
  const now = Date.now();
  for (const [ws, id] of clients) send(ws, { state: session ? view(session, id, now) : null });
}

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const now = Date.now();
    if (m.tv) clients.set(ws, 'tv');
    else if (m.resume && session) { // reconnect with token
      const p = Object.values(session.players).find((p) => p.token === m.resume);
      if (p) { clients.set(ws, p.id); p.connected = true; send(ws, { token: p.token }); }
    } else if (m.create && !session) {
      session = createSession(m.create, now);
      const p = session.players[session.hostId];
      clients.set(ws, p.id); send(ws, { token: p.token });
    } else if (m.join && session && m.join.code === session.code && !clients.has(ws)) {
      const p = join(session, m.join.name, now);
      clients.set(ws, p.id); send(ws, { token: p.token });
    } else if (m.act && session && clients.get(ws)) {
      const a = m.act;
      if (a.type === 'start') a.songs = lists[a.list]; // never trust the client's song list
      const err = act(session, clients.get(ws), a, now);
      if (err) send(ws, { error: err });
    }
    broadcast();
  });
  ws.on('close', () => { clients.delete(ws); });
});

setInterval(() => {
  if (session && tick(session, Date.now()) === 'reset') {
    session = null;
    for (const [ws, id] of clients) if (id !== 'tv') clients.delete(ws);
  }
  broadcast();
}, 500);

server.listen(PORT, () => console.log(`TV: ${BASE}/  phones: ${BASE}/play`));
