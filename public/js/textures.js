import * as THREE from 'three';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const toTex = (c, { repeat, srgb = true, aniso = 4 } = {}) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  return t;
};
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** deep velvet with damask diamond pattern */
export function velvet(base = '#5a0f1c', { pattern = true, repeat = [1, 1], gold = 'rgba(214,170,90,0.10)' } = {}) {
  const [c, g] = mk(512, 512); const r = rng(7);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2); }
  if (pattern) {
    g.strokeStyle = gold; g.lineWidth = 2;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const cx = x * 256 + 128, cy = y * 256 + 128;
      g.beginPath(); g.moveTo(cx, cy - 100); g.quadraticCurveTo(cx + 70, cy - 30, cx, cy + 100); g.quadraticCurveTo(cx - 70, cy - 30, cx, cy - 100); g.stroke();
      g.beginPath(); g.arc(cx, cy, 18, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(cx - 128, cy); g.lineTo(cx, cy - 128); g.lineTo(cx + 128, cy); g.lineTo(cx, cy + 128); g.closePath(); g.stroke();
    }
  }
  return toTex(c, { repeat });
}

/** theatre carpet: wine with gold lozenges */
export function carpet(repeat = [8, 8]) {
  const [c, g] = mk(256, 256); const r = rng(3);
  g.fillStyle = '#3d0911'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  g.strokeStyle = 'rgba(205,160,80,0.35)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(128, 20); g.lineTo(236, 128); g.lineTo(128, 236); g.lineTo(20, 128); g.closePath(); g.stroke();
  g.fillStyle = 'rgba(205,160,80,0.45)';
  [[128, 128], [0, 0], [256, 0], [0, 256], [256, 256]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); });
  return toTex(c, { repeat });
}

export function wood(repeat = [4, 4]) {
  const [c, g] = mk(512, 512); const r = rng(11);
  for (let i = 0; i < 16; i++) {
    const y = i * 32; const l = 18 + r() * 8;
    g.fillStyle = `hsl(18,35%,${l}%)`; g.fillRect(0, y, 512, 32);
    for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(0,0,0,${r() * 0.15})`; g.beginPath(); const yy = y + r() * 32; g.moveTo(0, yy); g.bezierCurveTo(170, yy + r() * 6 - 3, 340, yy + r() * 6 - 3, 512, yy); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, y, 512, 1.5); g.fillRect((r() * 512) | 0, y, 2, 32);
  }
  return toTex(c, { repeat });
}

/** painted dome: burgundy with gold sunburst, rings and stars (equirect-ish for a hemisphere) */
export function dome() {
  const [c, g] = mk(2048, 1024); const r = rng(21);
  const grd = g.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0, '#2b0f1a'); grd.addColorStop(.45, '#3a0f1b'); grd.addColorStop(1, '#1a060b');
  g.fillStyle = grd; g.fillRect(0, 0, 2048, 1024);
  // rays (u direction)
  for (let i = 0; i < 48; i++) {
    const x = i / 48 * 2048;
    g.fillStyle = i % 2 ? 'rgba(220,170,90,.09)' : 'rgba(220,170,90,.18)';
    g.beginPath(); g.moveTo(x - 4, 0); g.lineTo(x + 4, 0); g.lineTo(x + 18, 700); g.lineTo(x - 18, 700); g.fill();
  }
  // rings (v direction)
  const ring = (y, w, a) => { g.fillStyle = `rgba(225,180,100,${a})`; g.fillRect(0, y, 2048, w); };
  ring(110, 6, .7); ring(130, 2, .5); ring(420, 4, .55); ring(700, 10, .75); ring(722, 3, .5); ring(980, 14, .6);
  // medallions on ring
  for (let i = 0; i < 24; i++) { const x = (i + .5) / 24 * 2048; g.strokeStyle = 'rgba(230,190,110,.55)'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, 560, 34, 60, 0, 0, 7); g.stroke(); g.beginPath(); g.ellipse(x, 560, 12, 22, 0, 0, 7); g.stroke(); }
  // stars
  for (let i = 0; i < 900; i++) { const y = r() * 680; g.fillStyle = `rgba(255,230,180,${0.2 + r() * 0.8})`; g.beginPath(); g.arc(r() * 2048, y, r() * 1.8 + 0.3, 0, 7); g.fill(); }
  return toTex(c, { aniso: 8 });
}

export function radial(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const [c, g] = mk(size, size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return toTex(c, { srgb: false });
}

export function stripes(a = '#d8263a', b = '#fff4e6', n = 10) {
  const [c, g] = mk(256, 64);
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 256 / n, 0, 256 / n + 1, 64); }
  return toTex(c);
}

/** glowing sign / marquee text */
export function sign(lines, { w = 1024, h = 256, bg = 'rgba(0,0,0,0)', color = '#ffe2a0', glow = '#ffb84d', border = true, font = '"Cormorant Garamond","Noto Serif KR",serif' } = {}) {
  const [c, g] = mk(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28); g.lineWidth = 1.5; g.strokeRect(26, 26, w - 52, h - 52); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const total = lines.reduce((s, l) => s + l.size * 1.25, 0); let y = h / 2 - total / 2;
  for (const l of lines) {
    y += l.size * 0.625;
    g.font = `${l.weight || 700} ${l.size}px ${l.font || font}`;
    if (l.spacing) g.letterSpacing = l.spacing + 'px';
    g.shadowColor = glow; g.shadowBlur = l.size * 0.35; g.fillStyle = l.color || color;
    g.fillText(l.text, w / 2, y); g.shadowBlur = 0; g.fillText(l.text, w / 2, y);
    if (l.spacing) g.letterSpacing = '0px';
    y += l.size * 0.625;
  }
  return toTex(c);
}

/** name tag */
export function nameTag(name, color) {
  const [c, g] = mk(512, 112);
  g.font = '600 46px "Noto Sans KR","Noto Sans CJK KR",sans-serif';
  const tw = Math.min(440, g.measureText(name).width);
  const w = tw + 84, x = (512 - w) / 2;
  g.fillStyle = 'rgba(14,6,8,.72)'; roundRect(g, x, 18, w, 76, 38); g.fill();
  g.strokeStyle = 'rgba(227,194,126,.55)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = color; g.beginPath(); g.arc(x + 38, 56, 11, 0, 7); g.fill();
  g.fillStyle = '#f7ecd6'; g.textBaseline = 'middle'; g.fillText(name, x + 60, 58, 440);
  return toTex(c);
}

export function bubble(text) {
  const [c, g] = mk(640, 160);
  g.font = '600 50px "Noto Sans KR","Noto Sans CJK KR",sans-serif';
  const tw = Math.min(560, g.measureText(text).width); const w = tw + 70, x = (640 - w) / 2;
  g.fillStyle = 'rgba(255,250,240,.96)'; roundRect(g, x, 12, w, 104, 30); g.fill();
  g.beginPath(); g.moveTo(320 - 16, 114); g.lineTo(320, 144); g.lineTo(320 + 16, 114); g.fill();
  g.fillStyle = '#2a1608'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 320, 66, 560);
  return toTex(c);
}

export function emoji(ch) {
  const [c, g] = mk(128, 128);
  g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 72);
  return toTex(c);
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** a canvas you can redraw (intermission board) */
export function liveCanvas(w, h) { const [c, g] = mk(w, h); const t = toTex(c); return { c, g, t }; }
