// Brand Cinema relay server
// - serves ./public (with HTTP Range support for MP4 seeking)
// - WebSocket /ws : relays avatar position / seats / emotes between visitors
// Run: node server/relay.mjs   (PORT env, default 8080)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '..', 'public');
const PORT = +process.env.PORT || 8080;
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || path.join(PUBLIC, 'media'));   // 업로드 영상 저장 위치
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));   // 상영목록 저장 위치
const MAX_UPLOAD = (+process.env.MAX_UPLOAD_MB || 5120) * 1024 * 1024; // 기본 5GB
fs.mkdirSync(MEDIA_DIR, { recursive: true }); fs.mkdirSync(DATA_DIR, { recursive: true });
// first run on an empty media disk: copy the bundled demo video so the theatre plays something
try { const demo = path.join(PUBLIC, 'media', 'feature.mp4'), dst = path.join(MEDIA_DIR, 'feature.mp4'); if (demo !== dst && fs.existsSync(demo) && !fs.existsSync(dst)) fs.copyFileSync(demo, dst); } catch {}

// ---------- admin password ----------
const PW_FILE = path.join(DATA_DIR, 'admin-password.txt');
let ADMIN_PW = process.env.ADMIN_PASSWORD;
if (!ADMIN_PW) {
  if (fs.existsSync(PW_FILE)) ADMIN_PW = fs.readFileSync(PW_FILE, 'utf8').trim();
  else { ADMIN_PW = crypto.randomBytes(5).toString('hex'); fs.writeFileSync(PW_FILE, ADMIN_PW + '\n'); }
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const isAdmin = (req) => crypto.timingSafeEqual(sha(req.headers['x-admin-key'] || ''), sha(ADMIN_PW));

// ---------- simple stats (for reporting) ----------
const ST_FILE = path.join(DATA_DIR, 'stats.json');
let STATS = (() => { try { return JSON.parse(fs.readFileSync(ST_FILE, 'utf8')); } catch { return null; } })() || { since: new Date().toISOString(), visits: 0, peak: 0, events: {}, daily: {}, watchSec: 0 };
let statsDirty = false;
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // KST
function stat(k, n = 1) {
  STATS.events[k] = (STATS.events[k] || 0) + n;
  const d = (STATS.daily[today()] ||= {}); d[k] = (d[k] || 0) + n; statsDirty = true;
}
setInterval(() => { if (statsDirty) { statsDirty = false; fs.writeFile(ST_FILE, JSON.stringify(STATS), () => {}); } }, 20000);

// ---------- playlist store ----------
const PL_FILE = path.join(DATA_DIR, 'playlist.json');
function loadPlaylist() {
  try { return JSON.parse(fs.readFileSync(PL_FILE, 'utf8')); } catch { return null; }
}
let PL = loadPlaylist(); // null = use public/config.js defaults
function savePlaylist(p) { PL = p; fs.writeFileSync(PL_FILE, JSON.stringify(p, null, 2)); }
const validSrc = (s) => typeof s === 'string' && (/^media\/[\w.\-]+\.(mp4|webm|m4v)$/i.test(s) || /^https:\/\/[^\s"'<>]+$/i.test(s));
function readBody(req, limit = 64 * 1024) {
  return new Promise((ok, no) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > limit) { no(new Error('too big')); req.destroy(); } }); req.on('end', () => ok(b)); req.on('error', no); });
}
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };

async function api(req, res, url) {
  const p = url.pathname;
  if (p === '/api/playlist' && req.method === 'GET') return json(res, 200, PL || { playlist: null });
  if (!isAdmin(req)) return json(res, 401, { error: '비밀번호가 올바르지 않습니다' });
  if (p === '/api/login') return json(res, 200, { ok: true });
  if (p === '/api/stats') return json(res, 200, { ...STATS, online: totalOnline() });
  if (p === '/api/media' && req.method === 'GET') {
    const files = fs.readdirSync(MEDIA_DIR).filter((f) => /\.(mp4|webm|m4v)$/i.test(f)).map((f) => { const st = fs.statSync(path.join(MEDIA_DIR, f)); return { src: 'media/' + f, size: st.size, mtime: st.mtimeMs }; });
    return json(res, 200, { files: files.sort((a, b) => b.mtime - a.mtime) });
  }
  if (p === '/api/upload' && req.method === 'PUT') {
    const orig = String(url.searchParams.get('name') || 'video.mp4');
    const ext = (path.extname(orig).toLowerCase().match(/^\.(mp4|webm|m4v)$/) || [])[0];
    if (!ext) return json(res, 400, { error: 'MP4 / WEBM 파일만 올릴 수 있습니다' });
    const base = path.basename(orig, path.extname(orig)).normalize('NFKD').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'video';
    const name = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${crypto.randomBytes(3).toString('hex')}_${base}${ext}`;
    const tmp = path.join(MEDIA_DIR, '.' + name + '.part');
    let size = 0, aborted = false;
    const out = fs.createWriteStream(tmp);
    req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD && !aborted) { aborted = true; req.unpipe(out); out.destroy(); fs.rm(tmp, () => {}); json(res, 413, { error: '파일이 너무 큽니다' }); req.destroy(); } });
    req.pipe(out);
    out.on('finish', () => { if (aborted) return; fs.renameSync(tmp, path.join(MEDIA_DIR, name)); json(res, 200, { src: 'media/' + name, size }); });
    out.on('error', () => { fs.rm(tmp, () => {}); if (!aborted) json(res, 500, { error: '저장 실패' }); });
    req.on('aborted', () => { aborted = true; out.destroy(); fs.rm(tmp, () => {}); });
    return;
  }
  if (p === '/api/playlist' && req.method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: '잘못된 요청' }); }
    const list = Array.isArray(body.playlist) ? body.playlist : [];
    const playlist = list.filter((it) => it && validSrc(it.src)).slice(0, 30).map((it) => ({ src: it.src, title: String(it.title || '').replace(/[<>]/g, '').slice(0, 60) || '브랜드 영상' }));
    const intermission = Math.max(5, Math.min(600, +body.intermission || 20));
    // new epoch = 지금부터 인터미션 → 첫 영상 순서로 다시 시작 (모든 관객 동시)
    savePlaylist({ playlist, intermission, epoch: Date.now(), updated: new Date().toISOString() });
    for (const room of rooms.values()) broadcast(room, { t: 'playlist' });
    return json(res, 200, PL);
  }
  if (p === '/api/media' && req.method === 'DELETE') {
    const src = url.searchParams.get('src') || '';
    if (!/^media\/[\w.\-]+\.(mp4|webm|m4v)$/i.test(src)) return json(res, 400, { error: '잘못된 파일' });
    if (PL && PL.playlist.some((it) => it.src === src)) return json(res, 409, { error: '상영목록에 있는 영상은 먼저 목록에서 빼 주세요' });
    fs.rm(path.join(MEDIA_DIR, path.basename(src)), () => json(res, 200, { ok: true }));
    return;
  }
  json(res, 404, { error: 'not found' });
}
const ROOM_MAX = +process.env.ROOM_MAX || 80;     // people per theatre instance
const TICK_MS = 100;                               // state broadcast (10 Hz)
const SAYS = 12;                                   // number of preset phrases (client config)
const FX = 8;                                      // number of reaction kinds

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
};

// ---------- static ----------
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return api(req, res, url).catch(() => json(res, 500, { error: 'server error' }));
    if (url.pathname === '/admin') { res.writeHead(302, { location: '/admin.html' }); return res.end(); }
    if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, online: totalOnline(), rooms: rooms.size })); }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const isMedia = p.startsWith('/media/');
    const rootDir = isMedia ? MEDIA_DIR : PUBLIC;
    const file = path.resolve(rootDir, '.' + (isMedia ? p.slice(6) : p));
    if (!file.startsWith(rootDir) || path.basename(file).startsWith('.')) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const cache = /\/(vendor|media)\//.test(p) ? 'public, max-age=86400' : 'no-cache';
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        let start = m && m[1] ? +m[1] : 0;
        let end = m && m[2] ? +m[2] : st.size - 1;
        if (!m[1] && m[2]) { start = st.size - +m[2]; end = st.size - 1; }
        if (start >= st.size || end >= st.size || start > end) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
        res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'cache-control': cache });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': cache });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  } catch (e) { res.writeHead(500); res.end(); }
});

// ---------- rooms ----------
const rooms = new Map(); // name -> {peers: Map<id, peer>, seats: Map<seatId, id>}
let nextId = 1;
const totalOnline = () => { let n = 0; for (const r of rooms.values()) n += r.peers.size; return n; };

function pickRoom() {
  for (const [name, r] of rooms) if (r.peers.size < ROOM_MAX) return name;
  const name = 'hall-' + (rooms.size + 1);
  rooms.set(name, { peers: new Map(), seats: new Map(), dirty: new Set() });
  return name;
}
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, lim = 200) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj, exceptId) {
  const s = JSON.stringify(obj);
  for (const p of room.peers.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
}
const pub = (p) => ({ id: p.id, name: p.name, color: p.color, look: p.look, s: p.s, seat: p.seat });

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });

wss.on('connection', (ws) => {
  let peer = null, room = null;
  const bucket = { t: Date.now(), n: 0 };
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    // simple rate limit: 40 msgs / second
    const now = Date.now();
    if (now - bucket.t > 1000) { bucket.t = now; bucket.n = 0; }
    if (++bucket.n > 40) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'ping') return send(ws, { t: 'pong', c: m.c, s: Date.now() });

    if (m.t === 'hello' && !peer) {
      const rname = pickRoom(); room = rooms.get(rname);
      peer = {
        id: nextId++, ws, name: clean(m.name, 12) || '관객', color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#c9a45c',
        look: Math.abs(m.look | 0) % 8, s: [0, 0, 0, 0, 0, 0], seat: -1, lastSay: 0, lastFx: 0, lastBoom: 0,
      };
      room.peers.set(peer.id, peer);
      STATS.visits++; stat('visit'); const on = totalOnline(); if (on > STATS.peak) { STATS.peak = on; statsDirty = true; }
      send(ws, { t: 'welcome', id: peer.id, room: rname, now: Date.now(), peers: [...room.peers.values()].filter(p => p !== peer).map(pub), online: totalOnline() });
      broadcast(room, { t: 'join', p: pub(peer) }, peer.id);
      return;
    }
    if (!peer) return;

    switch (m.t) {
      case 's': { // state: [x,y,z,heading,anim,item]
        const a = Array.isArray(m.s) ? m.s : [];
        peer.s = [num(a[0]), num(a[1]), num(a[2]), num(a[3], 10), Math.abs(a[4] | 0) % 16, Math.abs(a[5] | 0) % 4];
        room.dirty.add(peer.id);
        break;
      }
      case 'seat': { // claim or release
        const want = m.id === null || m.id === undefined || m.id < 0 ? -1 : m.id | 0;
        if (want >= 0) {
          const holder = room.seats.get(want);
          if (holder && holder !== peer.id) return send(ws, { t: 'seatNo', id: want });
        }
        if (peer.seat >= 0) room.seats.delete(peer.seat);
        peer.seat = want;
        if (want >= 0) room.seats.set(want, peer.id);
        broadcast(room, { t: 'seat', by: peer.id, id: want });
        break;
      }
      case 'say': {
        if (now - peer.lastSay < 1200) return; peer.lastSay = now;
        const k = m.k | 0; if (k < 0 || k >= SAYS) return;
        broadcast(room, { t: 'say', by: peer.id, k });
        break;
      }
      case 'fx': {
        if (now - peer.lastFx < 350) return; peer.lastFx = now;
        const k = m.k | 0; if (k < 0 || k >= FX) return;
        broadcast(room, { t: 'fx', by: peer.id, k }, peer.id);
        break;
      }
      case 'ev': { // analytics events from the page (once-per-visit keys are deduped on the client)
        const k = String(m.k || ''); if (!/^[a-z0-9_]{1,24}$/.test(k)) return;
        if ((peer.evN = (peer.evN || 0) + 1) > 300) return;
        stat(k);
        break;
      }
      case 'boom': { // confetti cannon — everyone sees it
        if (now - peer.lastBoom < 8000) return; peer.lastBoom = now;
        broadcast(room, { t: 'boom', by: peer.id });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!peer || !room) return;
    room.peers.delete(peer.id);
    if (peer.seat >= 0 && room.seats.get(peer.seat) === peer.id) room.seats.delete(peer.seat);
    room.dirty.delete(peer.id);
    broadcast(room, { t: 'leave', id: peer.id });
  });
});

// state fan-out + online count
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.dirty.size) continue;
    const d = [];
    for (const id of room.dirty) { const p = room.peers.get(id); if (p) d.push([id, ...p.s]); }
    room.dirty.clear();
    broadcast(room, { t: 'st', d });
  }
}, TICK_MS);
setInterval(() => {
  const n = totalOnline();
  for (const room of rooms.values()) broadcast(room, { t: 'count', n });
  for (const [name, r] of rooms) if (!r.peers.size && rooms.size > 1) rooms.delete(name);
}, 3000);
// drop dead sockets
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 15000);

server.listen(PORT, () => {
  console.log(`\n  BRAND CINEMA 실행 중`);
  console.log(`  ▶ 관람 주소      http://localhost:${PORT}`);
  console.log(`  ▶ 관리자(영상)   http://localhost:${PORT}/admin`);
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  if (lan.length) console.log(`  ▶ 같은 사내망/와이파이 동료  http://${lan[0]}:${PORT}`);
  console.log(`  ▶ 관리자 비밀번호 ${process.env.ADMIN_PASSWORD ? '(ADMIN_PASSWORD 환경변수 값)' : ADMIN_PW + '   (server/data/admin-password.txt 에서 바꿀 수 있어요)'}`);
  console.log(`  이 창을 닫으면 극장이 꺼집니다.\n`);
});
