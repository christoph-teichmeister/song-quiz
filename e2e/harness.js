// Browser test harness: the real TV and phone pages run in headless Chrome, Firebase and YouTube are replaced by small fakes.
// The fake database lives here in Node, so all pages of one context share it (no Java, no emulator, no network).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.png': 'image/png', '.webmanifest': 'application/json' };

export function serve() {
  const srv = http.createServer(async (req, res) => {
    let p = new URL(req.url, 'http://x').pathname;
    if (p === '/') p = '/index.html'; else if (!extname(p)) p += '.html'; // cleanUrls, like Firebase Hosting
    try { const f = normalize(join(PUBLIC, p)); if (!f.startsWith(PUBLIC)) throw 0; res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
    catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}

// ---- fake Realtime Database (in Node) ----
class Store {
  constructor() { this.root = {}; this.ls = []; this.n = 0; }
  get(path) { let n = this.root; for (const k of path.split('/').filter(Boolean)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : n; }
  set(path, v) {
    const ks = path.split('/').filter(Boolean);
    if (!ks.length) this.root = v ?? {};
    else {
      let n = this.root;
      for (const k of ks.slice(0, -1)) { if (n[k] == null || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
      if (v == null) { delete n[ks.at(-1)]; } else n[ks.at(-1)] = v;
      this.prune(ks);
    }
    this.notify();
  }
  prune(ks) { for (let i = ks.length - 1; i > 0; i--) { const parent = this.get(ks.slice(0, i).join('/')); if (parent && typeof parent === 'object' && Object.keys(parent).length === 0) this.set0(ks.slice(0, i)); else break; } }
  set0(ks) { let n = this.root; for (const k of ks.slice(0, -1)) n = n[k]; delete n[ks.at(-1)]; }
  key() { return 'k' + String(++this.n).padStart(8, '0'); }
  notify() {
    for (const l of this.ls) {
      const v = this.get(l.path);
      if (l.kind === 'value') { const j = JSON.stringify(v); if (j !== l.last) { l.last = j; l.send(l.id, v, l.path.split('/').pop()); } }
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) if (!l.seen.has(k)) { l.seen.add(k); l.send(l.id, v[k], k); }
    }
  }
}

export async function newWorld(browser, base) {
  const store = new Store();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const chains = new WeakMap();
  const sendTo = (page) => (id, val, key) => { const c = (chains.get(page) || Promise.resolve()).then(() => page.evaluate(([i, v, k]) => window.__fire(i, v, k), [id, val ?? null, key]).catch(() => {})); chains.set(page, c); };
  await ctx.exposeBinding('__dbop', (src, o) => {
    if (o.op === 'set') { store.set(o.path, o.v); return null; }
    if (o.op === 'push') { const k = store.key(); store.set(o.path + '/' + k, o.v); return k; }
    if (o.op === 'get') return store.get(o.path);
    if (o.op === 'listen') { const l = { ...o, last: undefined, seen: new Set(), send: sendTo(src.page) }; store.ls.push(l); store.notify(); return null; }
  });
  const FAKE_DB = `
const L = new Map(); let n = 0;
window.__fire = (id, val, key) => { const l = L.get(id); if (l) l.cb({ val: () => val, key, ref: { path: l.kind === 'child' ? l.path + '/' + key : l.path } }); };
export const getDatabase = () => ({});
export const ref = (db, path = '') => ({ path: String(path) });
export const set = (r, v) => window.__dbop({ op: 'set', path: r.path, v: v === undefined ? null : v });
export const remove = (r) => window.__dbop({ op: 'set', path: r.path, v: null });
export const push = async (r, v) => { const k = await window.__dbop({ op: 'push', path: r.path, v }); return { path: r.path + '/' + k, key: k }; };
export const get = async (r) => { const v = await window.__dbop({ op: 'get', path: r.path }); return { val: () => v, exists: () => v != null }; };
const listen = (r, cb, kind) => { const id = 'l' + (++n) + '-' + Math.random(); L.set(id, { cb, path: r.path, kind }); window.__dbop({ op: 'listen', id, path: r.path, kind: kind === 'value' ? 'value' : 'child' }); return () => L.delete(id); };
const CON = new Set(); let online = true; // '.info/connected' lives in the page, tests flip it with window.__online(bool)
window.__online = (b) => { online = b; CON.forEach((cb) => cb({ val: () => online })); };
export const onValue = (r, cb) => { if (r.path === '.info/connected') { CON.add(cb); cb({ val: () => online }); return () => CON.delete(cb); } return listen(r, cb, 'value'); };
export const onChildAdded = (r, cb) => listen(r, cb, 'child');
`;
  const FAKE_AUTH = `export const getAuth = () => ({ currentUser: null }); export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(null), 0); return () => {}; };
export class GoogleAuthProvider {} const no = async () => { throw Object.assign(new Error('offline'), { code: 'auth/offline' }); };
export const signInWithPopup = no, signInWithEmailAndPassword = no, createUserWithEmailAndPassword = no, sendPasswordResetEmail = no, signOut = no, deleteUser = no;`;
  const FAKE_YT = `window.YT = { Player: class { constructor(el, o) { this.o = o; this.log = []; window.__yt = this; setTimeout(() => o.events.onReady(), 0); }
  loadVideoById(id) { this.log.push('load ' + id); } playVideo() { this.log.push('play'); } pauseVideo() { this.log.push('pause'); } stopVideo() { this.log.push('stop'); } setVolume() {} getVideoData() { return { video_id: 'x', title: 'Test song' }; } } };
window.onYouTubeIframeAPIReady?.();`;
  const js = (body) => ({ status: 200, contentType: 'text/javascript', body });
  await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => {
    const u = r.request().url();
    r.fulfill(js(u.includes('firebase-app') ? 'export const initializeApp = () => ({});' : u.includes('firebase-database') ? FAKE_DB : FAKE_AUTH));
  });
  await ctx.route('https://www.youtube.com/**', (r) => r.fulfill(js(FAKE_YT)));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

  const errors = [];
  const open = async (path) => {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${path}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/SQ yt error|Failed to load resource/.test(m.text())) errors.push(`${path}: ${m.text()}`); });
    await page.goto(base + path);
    return page;
  };
  return { store, ctx, open, errors, close: () => ctx.close() };
}

export const launch = () => chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

// ---- helpers shared by the scenarios ----
export const text = (page) => page.evaluate(() => document.body.innerText);
export async function until(fn, what, ms = 8000) { // poll until fn() returns truthy
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout waiting for: ' + what); await new Promise((r) => setTimeout(r, 60)); }
}
export const has = (page, re) => text(page).then((x) => re.test(x));
export const waitText = (page, re, ms) => until(() => has(page, re), String(re), ms);
