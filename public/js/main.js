import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, heightAt, walkable, SPAWN, SCREEN, C, STAGE_Y } from './world.js';
import { Avatar, ANIM, ITEM } from './avatar.js';
import { Net } from './net.js';
import * as TX from './textures.js';

const CFG = window.THEATER_CONFIG;
const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const lowEnd = isTouch && ((navigator.deviceMemory || 4) <= 3 || (navigator.hardwareConcurrency || 4) <= 4);
const params = new URLSearchParams(location.search);
if (isTouch) document.body.classList.add('touch');
const ldBar = $('ldBar'); const setLoad = (p) => (ldBar.style.width = p + '%');

// ───────── renderer ─────────
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, isTouch ? (lowEnd ? 1 : 1.5) : 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 200);
// keep a minimum horizontal field of view on portrait phones
const baseFov = (mul = 1) => { const a = innerWidth / innerHeight; const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(64 * mul) / 2) / a)); return THREE.MathUtils.clamp(v, 58 * mul, 92 * mul); };
const applyFov = () => { camera.fov = baseFov(focus ? 0.6 : 1); camera.updateProjectionMatrix(); };
camera.position.set(Math.sin(0.4) * 12.75, 10.5, -11 + Math.cos(0.4) * 8.5); camera.lookAt(0, 6.5, -18);
setLoad(15);

let composer = null, bloom = null;
function setupComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const res = new THREE.Vector2(innerWidth, innerHeight).multiplyScalar(isTouch ? 0.5 : 1);
  bloom = new UnrealBloomPass(res, 0.8, 0.6, 0.85); composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
if (params.get('bloom') !== '0') setupComposer();

const W = buildWorld(scene, renderer, { lowEnd });
setTimeout(applyFov);
setLoad(55);

// ───────── brand texts ─────────
document.title = CFG.brand.title;
$('ldMark').textContent = CFG.brand.title; $('enTitle').textContent = CFG.brand.logo ? (CFG.brand.marquee || CFG.brand.title) : CFG.brand.title; $('enSub').textContent = CFG.brand.subtitle;
$('hBrand').textContent = CFG.brand.logo ? '' : CFG.brand.title; $('hSub').textContent = CFG.brand.subtitle;
if (isTouch) $('enFoot').textContent = '소리가 함께 재생됩니다 · 왼쪽 스틱 이동 / 화면 드래그 시점';

// ───────── logo ─────────
const logoImg = new Image(); logoImg.crossOrigin = 'anonymous'; let logoReady = false;
if (CFG.brand.logo) { logoImg.onload = () => { logoReady = true; drawIdle(); }; logoImg.src = CFG.brand.logo; }
document.querySelectorAll('[data-logo]').forEach((el) => { if (CFG.brand.logo) { el.src = CFG.brand.logo; el.hidden = false; } });
const idle = TX.liveCanvas(1600, 900);
function drawIdle() {
  const { g, c, t } = idle; const grd = g.createRadialGradient(800, 420, 50, 800, 450, 900);
  grd.addColorStop(0, '#3a1018'); grd.addColorStop(1, '#0c0406'); g.fillStyle = grd; g.fillRect(0, 0, 1600, 900);
  g.strokeStyle = 'rgba(227,194,126,.45)'; g.lineWidth = 3; g.strokeRect(40, 40, 1520, 820);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (logoReady) { const w = 900, h = w * logoImg.height / logoImg.width; g.shadowColor = '#ffcf80'; g.shadowBlur = 30; g.drawImage(logoImg, 800 - w / 2, 400 - h / 2, w, h); g.shadowBlur = 0; }
  g.fillStyle = '#e3c27e'; g.font = '500 40px "Cormorant Garamond","Noto Serif KR",serif'; g.letterSpacing = '22px'; g.fillText(CFG.brand.marquee || 'CINEMA', 811, 600); g.letterSpacing = '0px';
  t.needsUpdate = true;
}
drawIdle();

// ───────── audio (SFX) ─────────
let actx = null, soundOn = true;
function sfxPop(strength = 1) {
  if (!actx || !soundOn) return;
  const t = actx.currentTime, len = 0.35;
  const buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(400, t + len);
  const g = actx.createGain(); g.gain.value = 0.5 * strength; src.connect(f).connect(g).connect(actx.destination); src.start();
}
function sfxTick(freq = 880) {
  if (!actx || !soundOn) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.08);
  g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); o.connect(g).connect(actx.destination); o.start(); o.stop(t + 0.16);
}

// ───────── video + schedule ─────────
const video = document.createElement('video');
video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
video.preload = 'auto'; video.muted = true;
// sandboxed pages (e.g. the Claude test link) have an opaque origin: play their own files through blob: URLs
const SANDBOXED = (() => { try { return self.origin === 'null' || location.origin === 'null'; } catch { return true; } })();
if (SANDBOXED && CFG.server === 'auto') CFG.server = 'off'; // the test link has no relay server
const isAbsXO = (u) => /^https?:\/\//i.test(u) && !u.startsWith(location.origin);
const blobCache = new Map();
async function resolveSrc(u) {
  if (!SANDBOXED || /^(blob|data):/.test(u) || isAbsXO(u)) return u;
  if (blobCache.has(u)) return blobCache.get(u);
  const b = await fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); });
  const url = URL.createObjectURL(b); blobCache.set(u, url); return url;
}
function prepVideoEl(v, u) { if (isAbsXO(u)) v.crossOrigin = 'anonymous'; else v.removeAttribute('crossorigin'); }
let videoTainted = false;
video.addEventListener('error', () => { const c = video.error ? video.error.code : '?'; toast(`⚠ 영상을 재생하지 못했어요 (코드 ${c}) · H.264 MP4 인지 확인해 주세요`); });
const vTex = new THREE.VideoTexture(video); vTex.colorSpace = THREE.SRGBColorSpace;
let durations = [], plVersion = 0, currentIdx = -1;
let epoch = Date.parse(CFG.epoch) || 0;
function setPlaylist(pl, inter, ep) {
  CFG.playlist = Array.isArray(pl) ? pl : []; CFG.intermission = inter ?? CFG.intermission; if (ep) epoch = ep;
  durations = CFG.playlist.map(() => 0); currentIdx = -1; const ver = ++plVersion;
  CFG.playlist.forEach((p, i) => {
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; prepVideoEl(v, p.src);
    resolveSrc(p.src).then((u) => { p._u = u; v.src = u; }).catch(() => { if (ver === plVersion) durations[i] = -1; toast('⚠ 영상 파일을 불러오지 못했어요: ' + (p.title || p.src)); });
    v.addEventListener('loadedmetadata', () => { if (ver === plVersion) durations[i] = v.duration || -1; v.removeAttribute('src'); v.load(); }, { once: true });
    v.addEventListener('error', () => { if (ver === plVersion) durations[i] = -1; }, { once: true }); // unplayable → skipped
  });
}
async function loadPlaylist() {
  try {
    const j = await fetch('api/playlist', { cache: 'no-store' }).then((r) => r.json());
    if (j && Array.isArray(j.playlist)) return setPlaylist(j.playlist, j.intermission, j.epoch);
  } catch {}
  setPlaylist(CFG.playlist, CFG.intermission, null);
}
loadPlaylist();
function phase(nowMs) {
  const I = CFG.intermission || 0;
  const items = durations.map((d, i) => [d, i]).filter(([d]) => d !== -1);
  if (!CFG.playlist.length || (durations.length && !items.length)) return { mode: 'empty' };
  if (durations.length !== CFG.playlist.length || items.some(([d]) => !d)) return { mode: 'wait' };
  const cycle = items.reduce((s, [d]) => s + d + I, 0);
  let x = (((nowMs - epoch) / 1000) % cycle + cycle) % cycle;
  for (const [d, i] of items) {
    if (x < I) return { mode: 'inter', idx: i, left: I - x, total: I };
    x -= I;
    if (x < d) return { mode: 'play', idx: i, t: x, dur: d };
    x -= d;
  }
  return { mode: 'inter', idx: items[0][1], left: 0.1, total: I };
}
function loadIdx(i) {
  if (currentIdx === i) return; currentIdx = i; videoTainted = false;
  const p = CFG.playlist[i]; const u = p._u || p.src; prepVideoEl(video, p.src);
  if (video.src !== u) { video.src = u; video.load(); }
}
let lastMode = '';
let audioUnlocked = false;
function syncVideo(ph) {
  if (ph.mode === 'wait' || ph.mode === 'empty') { if (!video.paused) video.pause(); return; }
  loadIdx(ph.idx);
  if (ph.mode === 'play') {
    if (video.readyState >= 1) {
      const drift = video.currentTime - ph.t;
      if (Math.abs(drift) > 0.8) { try { video.currentTime = ph.t; } catch {} }
      else video.playbackRate = THREE.MathUtils.clamp(1 - drift * 0.15, 0.92, 1.08);
    }
    if (video.paused) video.play().catch(() => { if (!video.muted) { video.muted = true; video.play().catch(() => {}); toast('🔊 화면을 한 번 눌러 소리를 켜 주세요'); } });
  } else {
    if (!video.paused) video.pause();
    if (video.readyState >= 1 && video.currentTime > 0.05) { try { video.currentTime = 0; } catch {} }
  }
}

// ───────── state ─────────
const S = { house: 1, beams: 1, curtain: 0, cheer: 0 };
const me = { av: null, pos: SPAWN.clone(), vy: 0, heading: Math.PI, grounded: true, seat: -1, anim: ANIM.idle, emoteUntil: 0, item: ITEM.none, name: '', color: CFG.colors[0], look: 0 };
const remotes = new Map(); // id -> {av, tp, th, anim, item, seat}
const seatOwner = new Map(); // seatId -> 'me' | peerId
let entered = false;
let camMode = 'overview'; // overview | follow | intro
let camYaw = 0, camPitch = 0.3, camDist = 5.2, seatYaw = 0, seatPitch = 0, focus = false;
const keys = new Set();
const joy = { x: 0, y: 0, active: false };
let clockT = 0;

// ───────── net ─────────
const net = new Net(CFG);
let testHinted = false;
net.on('status', (s) => {
  const live = $('live');
  $('bVid').classList.toggle('hide', s === 'online');
  if (s === 'offline' && !testHinted) { testHinted = true; setTimeout(() => toast('테스트 모드 · 오른쪽 위 🎞 버튼으로 내 PC 영상을 바로 상영해 보세요'), 5200); }
  if (s === 'online') { live.classList.remove('off'); }
  else { live.classList.add('off'); $('liveTxt').textContent = s === 'reconnecting' ? '재연결 중…' : '테스트 모드 · 혼자 관람'; }
});
net.on('reset', () => {
  for (const [id, r] of remotes) { scene.remove(r.av.root); }
  remotes.clear();
  for (const [sid, o] of seatOwner) if (o !== 'me') seatOwner.delete(sid);
});
net.on('welcome', (m) => {
  m.peers.forEach(addRemote); setCount(m.online);
  if (me.seat >= 0) net.send({ t: 'seat', id: me.seat });
});
net.on('join', (m) => { addRemote(m.p); feed(`<b style="color:${m.p.color}">${esc(m.p.name)}</b> 님이 입장했어요`); });
net.on('leave', (m) => { const r = remotes.get(m.id); if (!r) return; scene.remove(r.av.root); remotes.delete(m.id); for (const [sid, o] of seatOwner) if (o === m.id) seatOwner.delete(sid); });
net.on('st', (m) => {
  for (const [id, x, y, z, h, a, it] of m.d) {
    const r = remotes.get(id); if (!r) continue;
    if (a !== r.anim && (a === ANIM.clap || a === ANIM.cheer || a === ANIM.dance || a === ANIM.wave)) bump(0.06);
    r.tp.set(x, y, z); r.th = h; r.anim = a; if (r.item !== it) { r.item = it; r.av.setItem(it); }
  }
});
net.on('seat', (m) => {
  if (m.by === net.id) return;
  for (const [sid, o] of seatOwner) if (o === m.by) seatOwner.delete(sid);
  if (m.id >= 0) seatOwner.set(m.id, m.by);
  const r = remotes.get(m.by); if (r) r.seat = m.id;
});
net.on('seatNo', (m) => { if (me.seat === m.id) { standUp(false); toast('이미 다른 관객이 앉은 자리예요'); } });
net.on('say', (m) => {
  const txt = CFG.phrases[m.k] || ''; const r = m.by === net.id ? null : remotes.get(m.by);
  if (r) { r.av.say(txt); feed(`<b style="color:${r.av.color}">${esc(r.av.name)}</b> ${esc(txt)}`); }
});
net.on('fx', (m) => { const r = remotes.get(m.by); if (r) floatEmoji(r.av, m.k); bump(0.045); });
net.on('boom', (m) => { if (m.by !== net.id) bump(0.12); boom(false); const r = remotes.get(m.by); if (r) feed(`🎉 <b style="color:${r.av.color}">${esc(r.av.name)}</b> 님이 축포를 쐈어요!`); });
net.on('count', (m) => setCount(m.n));
net.on('playlist', () => { loadPlaylist(); toast('🎞 상영 목록이 새로 바뀌었어요'); });
function setCount(n) { if (net.online) $('liveTxt').textContent = `LIVE · ${n}명 관람 중`; }
function addRemote(p) {
  if (remotes.has(p.id)) return;
  const av = new Avatar({ name: p.name, color: p.color, look: p.look });
  const [x, y, z, h, a, it] = p.s && p.s.length ? p.s : [SPAWN.x, SPAWN.y, SPAWN.z, Math.PI, 0, 0];
  av.root.position.set(x, y, z); av.root.rotation.y = h; av.setItem(it); scene.add(av.root);
  remotes.set(p.id, { av, tp: new THREE.Vector3(x, y, z), th: h, anim: a, item: it, seat: p.seat });
  if (p.seat >= 0) seatOwner.set(p.seat, p.id);
}

// ───────── UI helpers ─────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function feed(html) {
  const el = document.createElement('div'); el.innerHTML = html; const f = $('feed'); f.appendChild(el);
  while (f.children.length > 5) f.firstChild.remove();
  setTimeout(() => (el.style.opacity = '0'), 9000); setTimeout(() => el.remove(), 10000);
}
let toastT;
function toast(s) { const t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }

// entry swatches
const sws = $('sws');
CFG.colors.forEach((c, i) => {
  const b = document.createElement('button'); b.className = 'sw' + (i === 0 ? ' on' : ''); b.style.background = c; b.style.color = c;
  b.onclick = () => { [...sws.children].forEach((x) => x.classList.remove('on')); b.classList.add('on'); me.color = c; sfxTick(600 + i * 60); };
  sws.appendChild(b);
});
$('nameIn').value = (() => { try { return localStorage.getItem('bc_name') || ''; } catch { return ''; } })();
$('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); e.stopPropagation(); });
$('enterBtn').onclick = enter;

// popovers
const pops = ['popPhr', 'popEmo', 'popRx', 'popItm'];
function closePops() { pops.forEach((p) => $(p).classList.add('hide')); document.querySelectorAll('#dock .db').forEach((b) => b.classList.remove('on')); }
document.querySelectorAll('#dock .db[data-pop]').forEach((b) => b.onclick = () => {
  const id = b.dataset.pop, open = $(id).classList.contains('hide'); closePops();
  if (open) { $(id).classList.remove('hide'); b.classList.add('on'); }
  sfxTick();
});
CFG.phrases.slice(0, 12).forEach((p, k) => { const b = document.createElement('button'); b.textContent = p; b.onclick = () => { saySomething(k); closePops(); }; $('popPhr').appendChild(b); });
const EMOTES = [['👋', '인사', 'wave'], ['👏', '박수', 'clap'], ['💃', '춤', 'dance'], ['🙌', '환호', 'cheer'], ['🦘', '점프', 'jump']];
EMOTES.forEach(([e, l, a]) => { const b = document.createElement('button'); b.className = 'big'; b.innerHTML = `${e}<small>${l}</small>`; b.onclick = () => { emote(a); closePops(); }; $('popEmo').appendChild(b); });
const RX = ['❤️', '👏', '🔥', '✨', '🎉', '😍', '👍', '🥹'];
RX.forEach((e, k) => { const b = document.createElement('button'); b.className = 'big'; b.textContent = e; b.onclick = () => react(k); $('popRx').appendChild(b); });
[['🍿', '팝콘', ITEM.popcorn], ['🪄', '응원봉', ITEM.stick], ['✋', '빈손', ITEM.none], ['😋', '사용 (F)', -1]].forEach(([e, l, it]) => {
  const b = document.createElement('button'); b.className = 'big'; b.innerHTML = `${e}<small>${l}</small>`;
  b.onclick = () => { if (it === -1) useItem(); else { setItem(it); } closePops(); }; $('popItm').appendChild(b);
});
$('bBoom').onclick = () => { boom(true); };
$('bSeat').onclick = () => { if (me.seat >= 0) standUp(); else autoSeat(); };
$('bSound').onclick = () => { soundOn = !soundOn; video.muted = !soundOn; $('bSound').textContent = soundOn ? '🔊' : '🔇'; if (soundOn) video.play().catch(() => {}); };
$('bView').onclick = () => toggleOverview();
// test mode: play a local MP4 straight from this PC (only this viewer sees it)
$('bVid').onclick = () => $('vidIn').click();
$('vidIn').onchange = () => {
  const f = $('vidIn').files[0]; if (!f) return;
  if (!/\.(mp4|m4v|webm|mov)$/i.test(f.name) && !/^video\//.test(f.type)) { toast('⚠ 영상 파일(MP4)을 선택해 주세요'); return; }
  const url = URL.createObjectURL(f);
  setPlaylist([{ src: url, title: f.name.replace(/\.\w+$/, '') }], 3, Date.now());
  // unlock playback with sound right now, inside the click/choose gesture
  currentIdx = 0; prepVideoEl(video, url); video.src = url; video.muted = !soundOn; video.load(); video.play().then(() => video.pause()).catch(() => {});
  toast(`🎞 "${f.name}" 3초 후 상영합니다`); $('vidIn').value = ''; track('test_upload', true);
};
$('bFull').onclick = () => { const d = document.documentElement; if (!document.fullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); else document.exitFullscreen(); };
$('bHelp').onclick = () => $('help').classList.toggle('hide');
canvas.addEventListener('pointerdown', () => { closePops(); if (entered && video.muted && soundOn) { video.muted = false; video.play().catch(() => {}); } });

// ───────── actions ─────────
function enter() {
  if (entered) return;
  const raw = $('nameIn').value.trim().replace(/[<>]/g, '').slice(0, 10);
  me.name = raw || '관객' + Math.floor(100 + Math.random() * 900);
  try { localStorage.setItem('bc_name', raw); } catch {}
  me.look = [...me.name].reduce((s, c) => s + c.charCodeAt(0), 0) % 8;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  // unlock video audio inside the user gesture
  video.muted = !soundOn; video.play().then(() => { audioUnlocked = true; }).catch(() => { video.muted = true; });
  me.av = new Avatar({ name: me.name, color: me.color, look: me.look, isLocal: true });
  me.pos.copy(SPAWN); me.heading = Math.PI; me.av.root.position.copy(me.pos); me.av.root.rotation.y = me.heading;
  scene.add(me.av.root);
  entered = true; camMode = 'intro'; introT = 0; camYaw = 0; camPitch = 0.32;
  $('entry').classList.add('out'); $('hud').classList.add('on');
  if (isTouch) { $('joy').classList.remove('hide'); $('mbtn').classList.remove('hide'); }
  net.connect({ name: me.name, color: me.color, look: me.look });
  $('introW').textContent = `${me.name} 님, 환영합니다`; $('intro').classList.add('on'); setTimeout(() => $('intro').classList.remove('on'), 3400);
  setTimeout(() => toast(CFG.brand.welcome), 4600); track('enter');
  sfxTick(520);
  if (document.activeElement) document.activeElement.blur();
  canvas.focus();
}
function saySomething(k) {
  const txt = CFG.phrases[k]; if (!txt || !me.av) return;
  me.av.say(txt); net.send({ t: 'say', k }); feed(`<b style="color:${me.color}">${esc(me.name)}</b> ${esc(txt)}`);
}
function emote(a) {
  if (!me.av) return;
  if (a === 'jump') { if (me.seat < 0 && me.grounded) { me.vy = 6.4; me.grounded = false; } return; }
  if (me.seat >= 0 && a === 'dance') a = 'cheer';
  if (a !== 'eat') bump(0.06); if (a === 'cheer' && me.item === ITEM.stick) mission('cheer');
  me.anim = ANIM[a]; me.emoteUntil = clockT + ({ wave: 2.4, clap: 3, dance: 5.5, cheer: 3.4, eat: 4 }[a] || 3);
}
function react(k) { if (!me.av) return; floatEmoji(me.av, k); bump(0.045); net.send({ t: 'fx', k }); }
function setItem(it) {
  me.item = it; me.av && me.av.setItem(it); if (it) mission('kiosk');
  if (it === ITEM.popcorn) toast('🍿 팝콘을 받았어요 · F 로 먹기'); else if (it === ITEM.stick) toast('🪄 응원봉을 받았어요 · F 로 흔들기');
  sfxTick(it ? 990 : 500);
}
function useItem() { if (me.item === ITEM.popcorn) emote('eat'); else if (me.item === ITEM.stick) { emote('cheer'); mission('cheer'); } else emote('clap'); }
let lastBoom = -99;
function boom(local) {
  if (local) {
    if (clockT - lastBoom < 8) { toast(`축포 재장전 중… ${Math.ceil(8 - (clockT - lastBoom))}초`); return; }
    lastBoom = clockT; net.send({ t: 'boom' }); $('bBoom').classList.add('cool'); setTimeout(() => $('bBoom').classList.remove('cool'), 8000);
    if (me.av) { me.anim = ANIM.cheer; me.emoteUntil = clockT + 2.5; }
    mission('cheer'); bump(0.12); track('boom', true);
  }
  W.confetti(false); sfxPop(1); setTimeout(() => sfxPop(0.7), 120); S.cheer = Math.max(S.cheer, 3);
}
function sitAt(seat) {
  me.seat = seat.id; seatOwner.set(seat.id, 'me'); me.pos.set(seat.x, seat.y, seat.z); me.heading = seat.heading; me.vy = 0; me.grounded = true;
  me.anim = ANIM.sit; me.emoteUntil = 0; seatYaw = 0; seatPitch = 0;
  net.send({ t: 'seat', id: seat.id }); sfxTick(700); mission('seat');
  $('bSeat').querySelector('span').textContent = '일어서기';
}
function standUp(send = true) {
  if (me.seat < 0) return;
  const s = W.seats[me.seat]; seatOwner.delete(me.seat); me.seat = -1; focus = false; applyFov();
  // step into the aisle side (towards the back of the row)
  const back = new THREE.Vector3(-Math.sin(s.heading), 0, -Math.cos(s.heading));
  me.pos.set(s.x + back.x * 0.05, s.y, s.z + back.z * 0.05); me.anim = ANIM.idle;
  camYaw = s.heading + Math.PI; if (send) net.send({ t: 'seat', id: -1 });
  me.av.root.visible = true; $('bSeat').querySelector('span').textContent = '빈자리';
}
function autoSeat() {
  let best = null, bs = 1e9;
  for (const s of W.seats) {
    if (seatOwner.has(s.id)) continue;
    const score = Math.abs(s.row - 5) * 1.2 + Math.abs(s.x) * 0.35 + Math.random() * 0.8;
    if (score < bs) { bs = score; best = s; }
  }
  if (best) { sitAt(best); toast(`💺 ${best.row + 1}열 좌석에 앉았어요 · E 로 일어서기`); }
}
function interact() {
  if (!me.av) return;
  if (me.seat >= 0) return standUp();
  const near = nearby();
  if (near.kind === 'seat') sitAt(near.seat);
  else if (near.kind === 'popcorn') setItem(ITEM.popcorn);
  else if (near.kind === 'stick') setItem(ITEM.stick);
}
function nearby() {
  if (!me.av || me.seat >= 0) return { kind: null };
  for (const k of W.kiosks) if (Math.hypot(k.x - me.pos.x, k.z - me.pos.z) < 2.8 && Math.abs(k.y - me.pos.y) < 1) return { kind: k.kind };
  let best = null, bd = 1.3;
  for (const s of W.seats) {
    const d = Math.hypot(s.x - me.pos.x, s.z - me.pos.z);
    if (d < bd && Math.abs(s.y - me.pos.y) < 0.6 && !seatOwner.has(s.id)) { bd = d; best = s; }
  }
  return best ? { kind: 'seat', seat: best } : { kind: null };
}
function toggleOverview() {
  if (camMode === 'overview' && entered) { camMode = 'follow'; $('bView').classList.remove('on'); }
  else { camMode = 'overview'; ovT = 0; $('bView').classList.add('on'); }
}

// floating emoji reactions
const emojiTex = RX.map((e) => TX.emoji(e));
const floats = [];
function floatEmoji(av, k) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex[k % emojiTex.length], transparent: true, depthWrite: false }));
  sp.scale.setScalar(0.5); const p = av.root.position; sp.position.set(p.x + (Math.random() - .5) * 0.3, p.y + 1.9, p.z);
  sp.renderOrder = 12; scene.add(sp); floats.push({ sp, t: 0, dx: (Math.random() - .5) * 0.5 });
}

// ───────── input ─────────
addEventListener('keydown', (e) => {
  if (!entered || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (e.repeat) return;
  if (k === 'e') interact();
  else if (k === 'f') useItem();
  else if (k === ' ') { if (me.seat < 0 && me.grounded) { me.vy = 6.4; me.grounded = false; } }
  else if (k === 'c') toggleOverview();
  else if (k === 'v' && me.seat >= 0) { focus = !focus; applyFov(); me.av.root.visible = !focus; }
  else if (k === 'enter') { closePops(); $('popPhr').classList.remove('hide'); }
  else if (k === 'escape') { closePops(); $('help').classList.add('hide'); }
  else if ('12345'.includes(k)) emote(EMOTES[+k - 1][2]);
  else if (k === 'b') boom(true);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  const sens = isTouch ? 0.006 : 0.0045;
  if (me.seat >= 0) { seatYaw = THREE.MathUtils.clamp(seatYaw - dx * sens, -1.4, 1.4); seatPitch = THREE.MathUtils.clamp(seatPitch - dy * sens, -0.6, 0.7); }
  else { camYaw -= dx * sens; camPitch = THREE.MathUtils.clamp(camPitch + dy * sens, -0.15, 1.25); }
});
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('pointercancel', () => (drag = null));
canvas.addEventListener('wheel', (e) => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.004, 2.2, 10); }, { passive: true });
// joystick
{
  const el = $('joy'), knob = el.querySelector('i'); let pid = null;
  const set = (e) => {
    const r = el.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    joy.x = x; joy.y = y; knob.style.transform = `translate(${x * 34}px,${y * 34}px)`;
  };
  el.addEventListener('pointerdown', (e) => { pid = e.pointerId; el.setPointerCapture(pid); joy.active = true; set(e); e.stopPropagation(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
  const end = () => { pid = null; joy.active = false; joy.x = joy.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  $('mAct').onclick = interact; $('mUse').onclick = useItem; $('mJump').onclick = () => emote('jump');
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; applyFov(); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setSize(innerWidth, innerHeight); }
});

// ───────── simulation ─────────
const INTRO_P0 = new THREE.Vector3(0, 12.5, -12.5), INTRO_P1 = new THREE.Vector3(9, 13, -2);
const tmpV = new THREE.Vector3(), camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), lookAt = new THREE.Vector3();
let prevIdx = 0, filmWatch = 0, lastEndCard = -999; const endShown = new Set();
let introT = 0, ovT = 0, netT = 0, uiT = 0, sampleT = 0, syncT = 0, prevMode = '';
const angDamp = (a, b, k, dt) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * (1 - Math.exp(-k * dt)); };
const sampler = document.createElement('canvas'); sampler.width = 16; sampler.height = 9; const sctx = sampler.getContext('2d', { willReadFrequently: true });
const screenCol = new THREE.Color(1, 0.9, 0.8), tmpCol = new THREE.Color();

function updateMe(dt) {
  if (!me.av) return;
  let ix = 0, iz = 0;
  if (keys.has('w') || keys.has('arrowup')) iz += 1;
  if (keys.has('s') || keys.has('arrowdown')) iz -= 1;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  if (joy.active) { ix += joy.x; iz += -joy.y; }
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const moving = il > 0.12 && camMode !== 'overview';
  if (moving && me.seat >= 0) standUp();

  if (me.seat >= 0) {
    const s = W.seats[me.seat]; me.pos.set(s.x, s.y, s.z); me.heading = s.heading;
    if (me.emoteUntil < clockT) me.anim = ANIM.sit;
  } else {
    const run = keys.has('shift') || (joy.active && il > 0.92);
    const sp = run ? 7 : 4.2;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const mx = (fx * iz + rx * ix) * sp, mz = (fz * iz + rz * ix) * sp;
    if (moving) {
      const nx = me.pos.x + mx * dt, nz = me.pos.z + mz * dt;
      const tryMove = (x, z) => walkable(x, z) && heightAt(x, z) - me.pos.y < 0.56;
      if (tryMove(nx, nz)) { me.pos.x = nx; me.pos.z = nz; }
      else if (tryMove(nx, me.pos.z)) me.pos.x = nx;
      else if (tryMove(me.pos.x, nz)) me.pos.z = nz;
      me.heading = angDamp(me.heading, Math.atan2(mx, mz), 12, dt);
    }
    const g = heightAt(me.pos.x, me.pos.z);
    if (me.grounded && me.vy <= 0 && me.pos.y - g >= 0 && me.pos.y - g < 0.5) { me.pos.y = g; me.vy = 0; }
    else {
      me.vy -= 18 * dt; me.pos.y += me.vy * dt;
      if (me.pos.y <= g) { me.pos.y = g; me.vy = 0; me.grounded = true; } else me.grounded = false;
    }
    if (!me.grounded) me.anim = ANIM.jump;
    else if (moving) { me.anim = run ? ANIM.run : ANIM.walk; me.emoteUntil = 0; }
    else if (me.emoteUntil < clockT) me.anim = ANIM.idle;
  }
  me.av.anim = me.anim;
  const vy = me.av.root.position.y;
  me.av.root.position.copy(me.pos); me.av.root.rotation.y = me.heading;
  if (me.grounded && me.seat < 0 && Math.abs(vy - me.pos.y) < 0.6) me.av.root.position.y = THREE.MathUtils.damp(vy, me.pos.y, 22, dt);
  me.av.shadow.position.y = heightAt(me.pos.x, me.pos.z) - me.pos.y + 0.015;
  me.av.tag.visible = me.seat < 0;
  me.av.update(dt);
}

function updateRemotes(dt) {
  for (const r of remotes.values()) {
    const av = r.av;
    if (r.anim === ANIM.sit && r.seat >= 0 && W.seats[r.seat]) { const s = W.seats[r.seat]; av.root.position.set(s.x, s.y, s.z); av.root.rotation.y = s.heading; }
    else {
      const d = av.root.position.distanceTo(r.tp);
      if (d > 6) av.root.position.copy(r.tp); else av.root.position.lerp(r.tp, 1 - Math.exp(-10 * dt));
      av.root.rotation.y = angDamp(av.root.rotation.y, r.th, 10, dt);
    }
    av.anim = r.anim; av.shadow.position.y = heightAt(av.root.position.x, av.root.position.z) - av.root.position.y + 0.015;
    av.update(dt);
  }
}

function updateCamera(dt, t) {
  if (window.__fixCam) { const f = window.__fixCam; camera.position.set(f[0], f[1], f[2]); camera.lookAt(f[3], f[4], f[5]); return; }
  if (camMode === 'overview' || !me.av) {
    ovT += dt;
    const a = ovT * 0.07 + 0.4, r = 17;
    camPos.set(C.x + Math.sin(a) * r * 0.75, 10.5 + Math.sin(ovT * 0.13) * 2, C.z + 9 + Math.cos(a) * r * 0.5);
    lookAt.set(0, 6.5, -18);
    camera.position.lerp(camPos, 1 - Math.exp(-1.2 * dt)); camera.lookAt(lookAt);
    if (camMode === 'overview' && entered) { /* stay */ }
    return;
  }
  if (me.seat >= 0) {
    const s = W.seats[me.seat];
    const f = tmpV.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    camPos.set(s.x - f.x * 0.62, s.y + 1.9, s.z - f.z * 0.62);
    if (focus) camPos.set(s.x + f.x * 0.1, s.y + 1.2, s.z + f.z * 0.1);
    const dir = new THREE.Vector3(0, SCREEN.y - 0.6, SCREEN.z).sub(camPos).normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), seatYaw);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(); dir.applyAxisAngle(right, seatPitch);
    lookAt.copy(camPos).add(dir.multiplyScalar(10));
    camera.position.lerp(camPos, 1 - Math.exp(-6 * dt));
    camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, lookAt, camera.up)), 1 - Math.exp(-6 * dt));
    return;
  }
  camTarget.set(me.pos.x, me.pos.y + 1.35, me.pos.z);
  const cp = Math.cos(camPitch);
  camPos.set(camTarget.x + Math.sin(camYaw) * cp * camDist, camTarget.y + Math.sin(camPitch) * camDist, camTarget.z + Math.cos(camYaw) * cp * camDist);
  // keep the camera inside the hall
  const dx = camPos.x - C.x, dz = camPos.z - C.z, d = Math.hypot(dx, dz);
  if (d > 24.2) { camPos.x = C.x + dx / d * 24.2; camPos.z = C.z + dz / d * 24.2; }
  camPos.y = Math.min(17.5, Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 0.5));
  if (camMode === 'intro') {
    // cinematic sweep: from above the stage, past the chandelier, down behind the avatar
    introT += dt; const k = Math.min(1, introT / 4.2); const e = k * k * (3 - 2 * k);
    const p0 = INTRO_P0, p1 = INTRO_P1; const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c2 = e * e;
    camera.position.set(p0.x * a + p1.x * b + camPos.x * c2, p0.y * a + p1.y * b + camPos.y * c2, p0.z * a + p1.z * b + camPos.z * c2);
    lookAt.set(0, 7.5, -24).lerp(camTarget, Math.min(1, e * 1.15)); camera.lookAt(lookAt);
    if (k >= 1) camMode = 'follow';
    return;
  } else camera.position.lerp(camPos, 1 - Math.exp(-10 * dt));
  camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, camTarget, camera.up)), 1);
}

function drawBoard(ph) {
  const { g, c, t } = W.board; g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ffb050'; g.fillStyle = '#ffdca0';
  if (logoReady) { const w = 330, h = w * logoImg.height / logoImg.width; g.shadowBlur = 24; g.globalAlpha = 0.95; g.drawImage(logoImg, 512 - w / 2, 58 - h / 2, w, h); g.globalAlpha = 1; }
  if (ph.mode !== 'inter') {
    g.shadowBlur = 30; g.font = '600 64px "Cormorant Garamond","Noto Serif KR",serif'; g.letterSpacing = '14px'; g.fillText(CFG.brand.marquee || 'CINEMA', 512, 220); g.letterSpacing = '0px';
    g.shadowBlur = 14; g.font = '500 40px "Noto Sans KR","Noto Sans CJK KR",sans-serif'; g.fillStyle = '#fff0d8';
    g.fillText(ph.mode === 'empty' ? '곧 상영이 시작됩니다' : '상영을 준비하고 있어요…', 512, 330, 900);
    t.needsUpdate = true; return;
  }
  g.shadowBlur = 30; g.font = '600 46px "Cormorant Garamond","Noto Serif KR",serif'; g.letterSpacing = '16px';
  g.fillText('INTERMISSION', 512, 130); g.letterSpacing = '0px';
  const sec = Math.max(0, Math.ceil(ph.left)); const mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
  g.shadowBlur = 40; g.font = '700 150px "Cormorant Garamond","Noto Serif KR",serif'; g.fillText(`${mm}:${ss}`, 512, 250);
  g.shadowBlur = 16; g.font = '500 38px "Noto Sans KR","Noto Sans CJK KR",sans-serif'; g.fillStyle = '#fff0d8';
  g.fillText('다음 상영 · ' + (CFG.playlist[ph.idx]?.title || ''), 512, 375, 900);
  g.font = '400 28px "Noto Sans KR","Noto Sans CJK KR",sans-serif'; g.fillStyle = 'rgba(255,230,200,.75)'; g.fillText(CFG.brand.welcome, 512, 432, 900);
  t.needsUpdate = true;
}

function updateShow(dt) {
  const ph = phase(net.now());
  // curtains, house lights
  let house = 1, curtain = 0;
  if (ph.mode === 'play') { house = 0.08; curtain = 1; if (ph.dur - ph.t < 2.5) house = 0.5; }
  else if (ph.mode === 'inter') { house = 1; curtain = ph.left < 3 ? 1 : 0; if (ph.left < 4) house = THREE.MathUtils.lerp(0.15, 1, (ph.left - 1) / 3); }
  else { house = 1; curtain = 0; }
  S.house = THREE.MathUtils.damp(S.house, house, 1.4, dt); S.curtain = curtain; S.cheer = Math.max(0, S.cheer - dt);
  S.partyT = Math.max(0, (S.partyT ?? 0) - dt); if (S.party > 1) { S.partyT = S.party; S.party = 1; } if (S.partyT <= 0) S.party = Math.max(0, (S.party || 0) - dt);
  if (ph.mode === 'play' && entered) filmWatch += dt; if (prevMode === 'inter' && ph.mode === 'play') filmWatch = 0;
  if (me.seat >= 0 && ph.mode === 'play') { watchT += dt; if (watchT >= Math.min(30, ph.dur * 0.6)) mission('watch'); }
  applause = Math.max(0, applause - dt * 0.02); $('meterI').style.height = (applause * 100).toFixed(1) + '%';
  // transition: film ended → confetti + crowd cheer
  if (prevMode === 'play' && ph.mode === 'inter') { W.confetti(true); W.sparks(4); sfxPop(1); setTimeout(() => sfxPop(0.8), 200); S.cheer = 6; const ei = prevIdx; if (entered && filmWatch >= Math.min(20, (durations[ei] || 40) * 0.5) && clockT - lastEndCard > 180 && !endShown.has(ei)) { endShown.add(ei); lastEndCard = clockT; setTimeout(() => showEndCard(ei), 3200); } if (me.seat >= 0) track('complete', true); }
  if (prevMode === 'inter' && ph.mode === 'play') { toast('🎬 상영이 시작됩니다'); W.sparks(3.5); }
  if (ph.idx !== undefined) prevIdx = ph.idx;
  prevMode = ph.mode;
  syncT -= dt; if (syncT <= 0) { syncT = 0.5; syncVideo(ph); }
  // screen texture
  if (video.readyState >= 2 && !videoTainted && W.screenMat.map !== vTex) {
    try { sctx.drawImage(video, 0, 0, 16, 9); sctx.getImageData(0, 0, 1, 1); }
    catch { videoTainted = true; toast('⚠ 보안 정책 때문에 이 영상을 3D 스크린에 표시할 수 없어요'); }
  }
  const hasFrame = video.readyState >= 2 && ph.mode === 'play' && !videoTainted;
  const want = hasFrame ? vTex : idle.t;
  if (W.screenMat.map !== want && (hasFrame || ph.mode !== 'play')) { W.screenMat.map = want; W.screenMat.color.setScalar(hasFrame ? 1 : 0.85); W.screenMat.needsUpdate = true; }
  // screen spill light: average colour of the frame
  sampleT -= dt;
  if (hasFrame && sampleT <= 0) {
    sampleT = 0.2;
    try { sctx.drawImage(video, 0, 0, 16, 9); const d = sctx.getImageData(0, 0, 16, 9).data; let r = 0, g2 = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g2 += d[i + 1]; b += d[i + 2]; } const n = d.length / 4 * 255; tmpCol.setRGB(r / n, g2 / n, b / n, THREE.SRGBColorSpace); } catch { tmpCol.setRGB(0.8, 0.8, 0.8); }
  }
  screenCol.lerp(hasFrame ? tmpCol : tmpCol.setRGB(0, 0, 0), 1 - Math.exp(-4 * dt));
  W.lights.screenLight.color.copy(screenCol); W.lights.screenLight.intensity = hasFrame ? 500 * (1 - S.house * 0.6) : 0;
  // volume by distance to the screen
  const d = me.av ? Math.hypot(me.pos.x, me.pos.z - SCREEN.z) : 20;
  video.volume = THREE.MathUtils.clamp(1.15 - (d - 12) / 26, 0.3, 1);
  // UI
  uiT -= dt;
  if (uiT <= 0) {
    uiT = 0.25;
    if (ph.mode === 'play') { $('nowK').textContent = 'NOW SHOWING'; $('nowT').textContent = CFG.playlist[ph.idx].title; $('nowP').style.width = (ph.t / ph.dur * 100).toFixed(1) + '%'; }
    else if (ph.mode === 'inter') { $('nowK').textContent = 'INTERMISSION'; $('nowT').textContent = `${Math.ceil(ph.left)}초 후 상영 · ${CFG.playlist[ph.idx].title}`; $('nowP').style.width = ((1 - ph.left / ph.total) * 100).toFixed(1) + '%'; drawBoard(ph); }
    else { $('nowK').textContent = 'COMING SOON'; $('nowT').textContent = ph.mode === 'empty' ? '곧 상영이 시작됩니다' : '상영 준비 중'; $('nowP').style.width = '0%'; drawBoard(ph); }
    // interaction prompt
    const p = $('prompt'), near = nearby();
    if (!entered || camMode === 'overview') p.classList.add('hide');
    else if (me.seat >= 0) { p.classList.toggle('hide', isTouch); p.innerHTML = isTouch ? '' : '<kbd>E</kbd> 일어서기 <kbd>V</kbd> 스크린 집중 <kbd>F</kbd> 사용'; }
    else if (near.kind) {
      p.classList.remove('hide');
      const label = near.kind === 'seat' ? `빈 좌석 · ${near.seat.row + 1}열 착석` : near.kind === 'popcorn' ? '팝콘 받기 🍿' : '응원봉 받기 🪄';
      p.innerHTML = isTouch ? label : `<kbd>E</kbd> ${label}`;
    } else p.classList.add('hide');
    if (isTouch) { const a = $('mAct'); a.textContent = me.seat >= 0 ? '일어서기' : near.kind === 'seat' ? '착석' : near.kind ? '받기' : '착석'; a.style.opacity = me.seat >= 0 || near.kind ? 1 : 0.45; }
  }
}


// ═════════ EXPERIENCE LAYER: intro · 4 moments · certificate · photo · curtain call · end card · stats ═════════
const sentEv = new Set();
function track(k, repeat = false) { if (!repeat && sentEv.has(k)) return; sentEv.add(k); net.send({ t: 'ev', k }); }

// 4 MOMENTS — HAUTERRE core values as a stamp rally
const MOMENTS = [
  { id: 'seat', en: 'My Own Moment', ko: '나만의 자리에 앉기', ic: '💺' },
  { id: 'watch', en: 'Special Experience', ko: '앉아서 상영 30초 감상', ic: '🎬' },
  { id: 'kiosk', en: 'Relaxed Space', ko: '매점에서 팝콘·응원봉 받기', ic: '🍿' },
  { id: 'cheer', en: 'Attention-Grabbing', ko: '응원봉 흔들기 또는 축포', ic: '🪄' },
];
const done = new Set((() => { try { return JSON.parse(sessionStorage.getItem('bc_moments') || '[]'); } catch { return []; } })());
let watchT = 0, certShown = false;
function renderMoments() {
  $('misList').innerHTML = MOMENTS.map((m) => `<li class="${done.has(m.id) ? 'done' : ''}"><i>${done.has(m.id) ? '✓' : m.ic}</i><div><small>${m.en}</small>${m.ko}</div></li>`).join('');
  $('misN').textContent = `${done.size} / 4`;
}
renderMoments();
if (isTouch || innerWidth < 720) $('mission').classList.add('min');
$('misHd').onclick = () => $('mission').classList.toggle('min');
function mission(id) {
  if (done.has(id) || !entered) return;
  done.add(id); try { sessionStorage.setItem('bc_moments', JSON.stringify([...done])); } catch {}
  renderMoments(); const m = MOMENTS.find((x) => x.id === id);
  toast(`✨ ${m.en} 달성 · ${done.size}/4`); chime(); track('m_' + id);
  if (done.size === 4 && !certShown) { certShown = true; track('all4'); setTimeout(() => showCert(), 1600); }
}
function chime() {
  if (!actx || !soundOn) return; const t = actx.currentTime;
  [784, 1175, 1568].forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * 0.07); g.gain.exponentialRampToValueAtTime(0.07, t + i * 0.07 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.5); o.connect(g).connect(actx.destination); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.55); });
}

// modal
function openModal(html) { $('mc').innerHTML = html; $('modal').hidden = false; $('mc').querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal)); }
function closeModal() { $('modal').hidden = true; $('mc').innerHTML = ''; }
$('modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
function saveImage(dataUrl, name) {
  try { const a = document.createElement('a'); a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove(); } catch {}
}

// certificate (1080x1350, ready for Instagram)
function showCert() {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 1350); grd.addColorStop(0, '#2a0a12'); grd.addColorStop(0.55, '#14060a'); grd.addColorStop(1, '#0a0305');
  g.fillStyle = grd; g.fillRect(0, 0, 1080, 1350);
  const rg = g.createRadialGradient(540, 420, 20, 540, 420, 620); rg.addColorStop(0, 'rgba(255,200,120,.22)'); rg.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = rg; g.fillRect(0, 0, 1080, 1350);
  g.strokeStyle = '#d7b46a'; g.lineWidth = 3; g.strokeRect(46, 46, 988, 1258); g.lineWidth = 1; g.strokeRect(62, 62, 956, 1226);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (logoReady) { const w = 520, h = w * logoImg.height / logoImg.width; g.shadowColor = '#ffcf80'; g.shadowBlur = 28; g.drawImage(logoImg, 540 - w / 2, 230 - h / 2, w, h); g.shadowBlur = 0; }
  g.fillStyle = '#e3c27e'; g.font = '600 30px "Cormorant Garamond","Noto Serif KR",serif'; g.letterSpacing = '14px'; g.fillText('PRIVATE SCREENING', 545, 345);
  g.font = '500 24px "Cormorant Garamond","Noto Serif KR",serif'; g.letterSpacing = '10px'; g.fillText('CERTIFICATE OF ATTENDANCE', 545, 392); g.letterSpacing = '0px';
  g.fillStyle = '#fff4e0'; g.font = '700 96px "Noto Serif KR","Noto Serif CJK KR",serif'; g.fillText(me.name, 540, 540, 900);
  g.fillStyle = 'rgba(244,234,214,.75)'; g.font = '400 30px "Noto Sans KR","Noto Sans CJK KR",sans-serif'; g.fillText('님은 HAUTERRE 프라이빗 시네마의', 540, 640); g.fillText('네 가지 순간을 모두 경험하셨습니다', 540, 686);
  MOMENTS.forEach((m, i) => {
    const y = 800 + i * 74; g.fillStyle = '#d7b46a'; g.beginPath(); g.arc(300, y, 22, 0, 7); g.fill();
    g.fillStyle = '#2a1606'; g.font = '700 24px sans-serif'; g.fillText('✓', 300, y + 1);
    g.textAlign = 'left'; g.fillStyle = '#e3c27e'; g.font = '600 32px "Cormorant Garamond","Noto Serif KR",serif'; g.fillText(m.en, 345, y - 12);
    g.fillStyle = 'rgba(244,234,214,.7)'; g.font = '400 22px "Noto Sans KR","Noto Sans CJK KR",sans-serif'; g.fillText(m.ko, 345, y + 20); g.textAlign = 'center';
  });
  const d = new Date(); const ds = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  const serial = 'No. ' + (Math.abs([...me.name + ds].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)) % 90000 + 10000);
  g.fillStyle = 'rgba(227,194,126,.8)'; g.font = '500 24px "Cormorant Garamond","Noto Serif KR",serif'; g.letterSpacing = '6px';
  g.fillText(`${ds}  ·  ${serial}`, 545, 1150); g.fillText((CFG.brand.marqueeSub || '').replace('PRESENTS', '').trim() + '  ' + (CFG.brand.marquee || ''), 545, 1200); g.letterSpacing = '0px';
  const url = c.toDataURL('image/png');
  openModal(`<h3>4 MOMENTS 완성</h3><p>오티에르 프라이빗 관람 인증서가 발급되었어요.<br/>저장해서 SNS에 공유해 보세요.</p>
    <img class="shot" src="${url}" alt="관람 인증서" />
    <div class="acts"><button class="pri" id="mSave">인증서 저장하기</button><button id="mShare2">🔗 친구에게 극장 링크 보내기</button></div>
    <div class="tip">저장이 안 되면 이미지를 길게 누르거나 우클릭해서 저장하세요</div><button class="x" data-close>닫기</button>`);
  $('mSave').onclick = () => { saveImage(url, 'HAUTERRE_certificate.png'); track('cert_save', true); };
  $('mShare2').onclick = share;
  sfxPop(0.6); W.sparks(3); track('cert');
}

// photo mode
let snapReq = false;
function snap() { document.body.classList.add('snap'); closePops(); snapReq = true; sfxTick(1200); }
function finishSnap() {
  snapReq = false;
  const src = renderer.domElement; const w = src.width, h = src.height, band = Math.round(h * 0.11);
  const c = document.createElement('canvas'); c.width = w; c.height = h + band; const g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.fillStyle = '#0f0507'; g.fillRect(0, h, w, band);
  g.fillStyle = '#d7b46a'; g.fillRect(0, h, w, Math.max(2, band * 0.03));
  if (logoReady) { const lh = band * 0.34, lw = lh * logoImg.width / logoImg.height; g.drawImage(logoImg, band * 0.45, h + band / 2 - lh / 2, lw, lh); }
  g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(244,234,214,.85)'; g.font = `500 ${Math.round(band * 0.2)}px "Noto Sans KR",sans-serif`;
  const d = new Date(); g.fillText(`${me.name} · ${CFG.brand.marquee || ''} · ${d.getMonth() + 1}/${d.getDate()}`, w - band * 0.45, h + band / 2);
  const url = c.toDataURL('image/jpeg', 0.9);
  document.body.classList.remove('snap');
  openModal(`<h3>찰칵!</h3><img class="shot" src="${url}" alt="사진" /><div class="acts"><button class="pri" id="mSave">사진 저장하기</button></div><div class="tip">저장이 안 되면 이미지를 길게 누르거나 우클릭해서 저장하세요</div><button class="x" data-close>닫기</button>`);
  $('mSave').onclick = () => saveImage(url, 'HAUTERRE_cinema.jpg');
  track('photo', true);
}
$('bSnap').onclick = snap;

// share
async function share() {
  const url = CFG.shareUrl || location.href.replace(/[?#].*$/, '');
  try { await navigator.clipboard.writeText(url); toast('🔗 극장 링크를 복사했어요. 친구에게 붙여넣어 보내세요'); }
  catch { openModal(`<h3>링크 공유</h3><p>아래 주소를 복사해 보내 주세요</p><p style="user-select:all;color:var(--txt);word-break:break-all">${esc(url)}</p><button class="x" data-close>닫기</button>`); }
  track('share', true);
}
$('bShare').onclick = share;

// applause meter → CURTAIN CALL (every client sums the same broadcast events)
let applause = 0, ccLock = 0;
function bump(v) {
  if (clockT < ccLock) return;
  applause = Math.min(1, applause + v * (net.online ? 1 : 1.7));
  if (applause >= 1) curtainCall();
}
function curtainCall() {
  applause = 0; ccLock = clockT + 25; S.party = 7; S.cheer = 7;
  W.confetti(true); W.sparks(6); sfxPop(1); setTimeout(() => sfxPop(0.8), 250); setTimeout(() => sfxPop(0.9), 600);
  toast('👏 CURTAIN CALL! 모두의 박수로 커튼콜 쇼가 열렸어요'); $('meter').classList.add('hot'); setTimeout(() => $('meter').classList.remove('hot'), 7000);
  track('curtaincall', true);
}

// end-of-screening card (brand call-to-action)
function showEndCard(idx) {
  if (!$('modal').hidden || !entered) return;
  const cta = CFG.cta || {}; const title = CFG.playlist[idx]?.title || '';
  const btns = (cta.buttons || []).map((b, i) => `<a href="${esc(b.url)}" target="_blank" rel="noopener" data-cta="${i}" class="${i === 0 ? 'pri' : ''}">${esc(b.label)}</a>`).join('');
  openModal(`<img src="${esc(CFG.brand.logo || '')}" alt="" style="height:22px;margin:4px auto 10px;display:block" />
    <p style="margin:0;font-size:12px;letter-spacing:.2em;color:var(--gold)">THANK YOU FOR WATCHING</p>
    <h3>${esc(cta.title || '')}</h3><p>${esc(cta.desc || '')}<br/><span style="font-size:12px">방금 상영: ${esc(title)}</span></p>
    <div class="acts">${btns}<button id="mShare3">🔗 이 극장 링크 공유하기</button>${done.size === 4 ? '<button id="mCert">🏅 관람 인증서 다시 보기</button>' : `<button data-close>계속 둘러보기 · 4 MOMENTS ${done.size}/4</button>`}</div>
    <button class="x" data-close>닫기</button>`);
  $('mc').querySelectorAll('[data-cta]').forEach((a) => (a.onclick = () => track('cta_' + a.dataset.cta, true)));
  $('mShare3').onclick = share; const mc = $('mCert'); if (mc) mc.onclick = showCert;
  setTimeout(() => { if (!$('modal').hidden && $('mc').querySelector('#mShare3')) closeModal(); }, 15000);
  track('endcard', true);
}

// ───────── loop ─────────
const clock = new THREE.Clock();
const DTMAX = +(params.get('dtmax') || 0.05);
let fpsAcc = 0, fpsN = 0, fpsChecked = false;
setLoad(90);
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(DTMAX, clock.getDelta()); clockT += dt;
  updateShow(dt);
  updateMe(dt); updateRemotes(dt);
  W.update(clockT, dt, S);
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.sp.position.y += dt * 0.9; f.sp.position.x += f.dx * dt; f.sp.material.opacity = Math.min(1, 3 * (1.8 - f.t)); f.sp.scale.setScalar(0.5 + Math.min(0.2, f.t * 0.6));
    if (f.t > 1.8) { scene.remove(f.sp); f.sp.material.dispose(); floats.splice(i, 1); }
  }
  updateCamera(dt, clockT);
  // network state @ 5Hz
  netT -= dt; if (me.av && netT <= 0) { netT = 0.2; net.send({ t: 's', s: [+me.pos.x.toFixed(2), +me.pos.y.toFixed(2), +me.pos.z.toFixed(2), +me.heading.toFixed(2), me.anim, me.item] }); }
  if (composer) composer.render(); else renderer.render(scene, camera);
  if (snapReq) finishSnap();
  // adaptive quality: if the first seconds are slow, drop bloom and resolution
  if (!fpsChecked && clockT > 2) { fpsAcc += dt; fpsN++; if (fpsAcc > 4) { fpsChecked = true; const fps = fpsN / fpsAcc; if (fps < 28) { if (composer) composer = null; pixelRatio = Math.max(1, pixelRatio * 0.75); renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight); } } }
}
// warm-up compile, then reveal
renderer.compile(scene, camera);
setLoad(100);
setTimeout(() => { $('loading').style.opacity = '0'; setTimeout(() => $('loading').remove(), 900); }, 250);
frame();
if (params.get('auto') === '1') { $('nameIn').value = params.get('name') || 'Tester'; setTimeout(enter, 300); }
window.__bc = { renderer, me, W, S, remotes, net, sitAt, autoSeat, setItem, emote, boom, toggleOverview, video, camera, phase, get camMode() { return camMode; } };
