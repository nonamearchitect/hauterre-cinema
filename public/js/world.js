import * as THREE from 'three';
import * as TX from './textures.js';

// ───────── layout constants (metres) ─────────
export const C = new THREE.Vector3(0, 0, -20);  // centre of the horseshoe
export const R0 = 7.5, ROW = 1.1, NROWS = 11, TIER = 0.3, BASE = 0.15;
export const PROM_Y = 3.6, PROM_IN = R0 - ROW / 2 + NROWS * ROW, WALL_R = 25;
export const STAGE_Y = 1.3, STAGE_FRONT = -15, PROSC_Z = -17.5;
export const SCREEN = { w: 16, h: 9, y: 7.4, z: -24.9 };
export const BALC_Y = [7.6, 11.2, 14.8], BALC_R = 22.4;
export const SPAWN = new THREE.Vector3(0, PROM_Y, 1.2);
const tierY = (k) => BASE + k * TIER;

export function heightAt(x, z) {
  if (z < STAGE_FRONT) return Math.abs(x) < 12 ? STAGE_Y : PROM_Y;
  const d = Math.hypot(x - C.x, z - C.z);
  const in0 = R0 - ROW / 2;
  if (d < in0) return 0;
  if (d < PROM_IN) return tierY(Math.min(NROWS - 1, Math.floor((d - in0) / ROW)));
  return PROM_Y;
}
export function walkable(x, z) {
  const d = Math.hypot(x - C.x, z - C.z);
  if (d > WALL_R - 0.8) return false;
  if (z < STAGE_FRONT - 0.15) return Math.abs(x) < 11.6 && z > -16.7;
  return true;
}

// ───────── helpers ─────────
const std = (o) => new THREE.MeshStandardMaterial(o);
function sectorShape(rIn, rOut, zClip, seg = 96) {
  // annulus sector around C, clipped by the line z = zClip (keeps z >= zClip)
  const aO = Math.acos(Math.min(1, (zClip - C.z) / rOut));
  const aI = Math.acos(Math.min(1, (zClip - C.z) / rIn));
  const s = new THREE.Shape(); const P = (r, a) => [C.x + r * Math.sin(a), -(C.z + r * Math.cos(a))];
  for (let i = 0; i <= seg; i++) { const a = -aO + 2 * aO * i / seg; const [x, y] = P(rOut, a); i ? s.lineTo(x, y) : s.moveTo(x, y); }
  for (let i = 0; i <= seg; i++) { const a = aI - 2 * aI * i / seg; const [x, y] = P(rIn, a); s.lineTo(x, y); }
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 1); g.rotateX(-Math.PI / 2);
  // planar uvs in metres
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
  return { geo: g, aI, aO };
}
function arcBand(r, h, a, { seg = 96, side = THREE.DoubleSide } = {}) {
  return new THREE.CylinderGeometry(r, r, h, seg, 1, true, -a, 2 * a);
}

// ───────── build ─────────
export function buildWorld(scene, renderer, { lowEnd = false } = {}) {
  const W = { seats: [], kiosks: [], anim: [], show: { house: 1, beams: 1 } };
  const root = new THREE.Group(); scene.add(root);

  // materials
  const gold = std({ color: 0xd9ad5b, metalness: 1, roughness: 0.28 });
  const goldDark = std({ color: 0x9a7333, metalness: 1, roughness: 0.4 });
  const velvetMat = std({ map: TX.velvet('#4c0c17', { repeat: [10, 3] }), roughness: 0.95 });
  const velvetWall = std({ map: TX.velvet('#3a0911', { repeat: [24, 4] }), roughness: 0.95 });
  const carpetMat = std({ map: TX.carpet([1, 1]), roughness: 0.92 });
  const dark = std({ color: 0x120608, roughness: 0.9 });
  const black = new THREE.MeshBasicMaterial({ color: 0x020102 });

  // ── base floor
  const baseFloor = new THREE.Mesh(new THREE.CircleGeometry(WALL_R + 1, 96), carpetMat);
  baseFloor.rotation.x = -Math.PI / 2; root.add(baseFloor);
  { const uv = baseFloor.geometry.attributes.uv, p = baseFloor.geometry.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getY(i) / 4); }
  baseFloor.position.copy(C).setY(0);

  // ── raked tiers + LED step strips
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.35).multiplyScalar(2.2), toneMapped: false });
  W.ledMat = ledMat;
  const riserMat = std({ color: 0x24070c, roughness: 0.8 });
  for (let k = 0; k < NROWS; k++) {
    const rIn = R0 - ROW / 2 + k * ROW, rOut = rIn + ROW;
    const { geo, aI } = sectorShape(rIn, rOut, STAGE_FRONT);
    const m = new THREE.Mesh(geo, carpetMat); m.position.y = tierY(k); root.add(m);
    const h = tierY(k);
    const riser = new THREE.Mesh(arcBand(rIn, h, aI), riserMat); riser.position.set(C.x, h / 2, C.z); root.add(riser);
    const led = new THREE.Mesh(arcBand(rIn + 0.01, 0.025, aI), ledMat); led.position.set(C.x, h - 0.03, C.z); root.add(led);
  }
  // promenade (foyer ring under the balconies)
  {
    const { geo, aI } = sectorShape(PROM_IN, WALL_R + 0.2, STAGE_FRONT);
    const m = new THREE.Mesh(geo, std({ map: TX.wood([1, 1]), roughness: 0.55, metalness: 0.05 })); m.position.y = PROM_Y; root.add(m);
    const riser = new THREE.Mesh(arcBand(PROM_IN, PROM_Y, aI), riserMat); riser.position.set(C.x, PROM_Y / 2, C.z); root.add(riser);
    const led = new THREE.Mesh(arcBand(PROM_IN + 0.01, 0.03, aI), ledMat); led.position.set(C.x, PROM_Y - 0.03, C.z); root.add(led);
    // brass rail with aisle gaps
    const railH = 0.95;
    for (const [a0, a1] of [[-aI, -0.66], [-0.58, -0.07], [0.07, 0.58], [0.66, aI]]) {
      const len = a1 - a0;
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(PROM_IN + 0.1, PROM_IN + 0.1, 0.05, 64, 1, true, a0, len), gold);
      rail.position.set(C.x, PROM_Y + railH, C.z); root.add(rail);
      const n = Math.max(2, Math.round(len * PROM_IN / 1.2));
      for (let i = 0; i <= n; i++) {
        const a = a0 + len * i / n; const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, railH, 6), gold);
        post.position.set(C.x + (PROM_IN + 0.1) * Math.sin(a), PROM_Y + railH / 2, C.z + (PROM_IN + 0.1) * Math.cos(a)); root.add(post);
      }
    }
  }

  // ── seats (instanced)
  {
    const target = new THREE.Vector3(0, 0, SCREEN.z);
    for (let k = 0; k < NROWS; k++) {
      const R = R0 + k * ROW, y = tierY(k);
      const amax = Math.min(1.2, Math.acos(Math.min(1, (STAGE_FRONT + 1.2 - C.z) / R)));
      const dA = 0.64 / R;
      for (let a = -amax + dA / 2; a <= amax - dA / 2 + 1e-6; a += dA) {
        const x = C.x + R * Math.sin(a), z = C.z + R * Math.cos(a);
        if (Math.abs(x) < 0.8) continue;                              // centre aisle
        if (Math.abs(Math.abs(a) - 0.62) * R < 0.55) continue;        // side aisles
        const heading = Math.atan2(target.x - x, target.z - z);
        W.seats.push({ id: W.seats.length, x, y, z, heading, row: k });
      }
    }
    const n = W.seats.length;
    const seatRed = std({ map: TX.velvet('#7a1222', { pattern: false }), roughness: 0.85 });
    const parts = [
      { geo: new THREE.BoxGeometry(0.56, 0.12, 0.5), mat: seatRed, m: new THREE.Matrix4().makeTranslation(0, 0.42, 0.03) },
      { geo: new THREE.BoxGeometry(0.58, 0.7, 0.1), mat: seatRed, m: new THREE.Matrix4().makeRotationX(-0.12).premultiply(new THREE.Matrix4().makeTranslation(0, 0.8, -0.24)) },
      { geo: new THREE.BoxGeometry(0.6, 0.06, 0.12), mat: gold, m: new THREE.Matrix4().makeTranslation(0, 1.16, -0.28) },
      { geo: new THREE.BoxGeometry(0.05, 0.07, 0.44), mat: goldDark, m: new THREE.Matrix4().makeTranslation(0.31, 0.62, 0.0) },
      { geo: new THREE.BoxGeometry(0.4, 0.36, 0.36), mat: dark, m: new THREE.Matrix4().makeTranslation(0, 0.18, -0.02) },
    ];
    const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, n);
      W.seats.forEach((s, i) => {
        q.setFromAxisAngle(up, s.heading);
        tmp.compose(new THREE.Vector3(s.x, s.y, s.z), q, one).multiply(p.m);
        im.setMatrixAt(i, tmp);
      });
      im.instanceMatrix.needsUpdate = true; root.add(im);
    }
  }

  // ── stage
  const stage = new THREE.Mesh(new THREE.BoxGeometry(24, STAGE_Y, 12), [dark, dark, std({ map: TX.wood([6, 3]), roughness: 0.35, metalness: 0.1 }), dark, std({ color: 0x1a0609, roughness: 0.7 }), dark]);
  stage.position.set(0, STAGE_Y / 2, -21); root.add(stage);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(24.2, 0.1, 0.16), gold); lip.position.set(0, STAGE_Y, STAGE_FRONT + 0.05); root.add(lip);
  const lip2 = new THREE.Mesh(new THREE.BoxGeometry(24.2, 0.06, 0.12), gold); lip2.position.set(0, 0.08, STAGE_FRONT + 0.05); root.add(lip2);
  // footlights
  {
    const n = 40; const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 1.1), toneMapped: false }), n);
    const m = new THREE.Matrix4(); for (let i = 0; i < n; i++) { m.makeTranslation(-11.5 + 23 * i / (n - 1), STAGE_Y + 0.06, STAGE_FRONT + 0.25); fl.setMatrixAt(i, m); }
    root.add(fl);
  }
  // podium wings either side of the stage (meets the rake)
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(13.5, PROM_Y, 2.6), [velvetWall, velvetWall, std({ map: TX.wood([3, 1]), roughness: 0.5 }), dark, velvetWall, dark]);
    wing.position.set(s * 18.75, PROM_Y / 2, -16.3); root.add(wing);
    const t = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.08, 0.12), gold); t.position.set(s * 18.75, PROM_Y, -15.02); root.add(t);
  }

  // ── stage house + screen
  const house = new THREE.Mesh(new THREE.BoxGeometry(23.4, 16, 9.8), std({ color: 0x0a0405, roughness: 1, side: THREE.BackSide }));
  house.position.set(0, 8, -22.5); root.add(house);
  const mask = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w + 1.6, SCREEN.h + 1.4), black);
  mask.position.set(0, SCREEN.y, SCREEN.z - 0.02); root.add(mask);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x241016, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat);
  screen.position.set(0, SCREEN.y, SCREEN.z); root.add(screen);
  W.screen = screen; W.screenMat = screenMat;
  { // thin glowing frame
    const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.15, 0.6), toneMapped: false });
    const t = 0.05, w = SCREEN.w + 0.3, h = SCREEN.h + 0.3;
    [[0, h / 2, w, t], [0, -h / 2, w, t], [-w / 2, 0, t, h], [w / 2, 0, t, h]].forEach(([x, y, a, b]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(a, b), fm); m.position.set(x, SCREEN.y + y, SCREEN.z + 0.01); root.add(m); });
  }

  // ── proscenium wall with arched opening + gold frame
  const OPEN_W = 11, OPEN_Y0 = STAGE_Y, OPEN_Y1 = 13.6, ARCH = 1.6;
  const openingPath = (inset = 0, p = new THREE.Path(), y0 = OPEN_Y0) => {
    const w = OPEN_W - inset, y1 = OPEN_Y1 - inset;
    p.moveTo(-w, y0); p.lineTo(w, y0); p.lineTo(w, y1 - ARCH);
    p.quadraticCurveTo(w, y1, w - ARCH * 1.6, y1); p.lineTo(-w + ARCH * 1.6, y1); p.quadraticCurveTo(-w, y1, -w, y1 - ARCH); p.closePath();
    return p;
  };
  {
    const s = new THREE.Shape(); s.moveTo(-26, 0); s.lineTo(26, 0); s.lineTo(26, 30); s.lineTo(-26, 30); s.closePath();
    s.holes.push(openingPath(0));
    const g = new THREE.ShapeGeometry(s, 24);
    const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 5, p.getY(i) / 5);
    const wallMat = std({ map: TX.velvet('#3a0911', { repeat: [1, 1] }), roughness: 0.95 });
    const w = new THREE.Mesh(g, wallMat); w.position.z = PROSC_Z; root.add(w);
    // ornate gold frame = outer shape minus inner opening, extruded
    const outer = new THREE.Shape(); openingPath(-1.0, outer, 0); outer.holes.push(openingPath(0));
    const fg = new THREE.ExtrudeGeometry(outer, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 3, curveSegments: 24 });
    const frame = new THREE.Mesh(fg, gold); frame.position.z = PROSC_Z - 0.1; root.add(frame);
    const outer2 = new THREE.Shape(); openingPath(-1.5, outer2, 0); outer2.holes.push(openingPath(-1.15, new THREE.Path(), 0.6));
    const fg2 = new THREE.ExtrudeGeometry(outer2, { depth: 0.2, bevelEnabled: false, curveSegments: 24 });
    const frame2 = new THREE.Mesh(fg2, goldDark); frame2.position.z = PROSC_Z; root.add(frame2);
  }
  // giant columns + glowing arched windows on the proscenium wall
  {
    const colGeo = new THREE.CylinderGeometry(0.55, 0.65, 16.4, 20); const capGeo = new THREE.BoxGeometry(1.7, 0.6, 1.7); const baseGeo = new THREE.BoxGeometry(1.6, 0.8, 1.6);
    const winMat = new THREE.MeshBasicMaterial({ map: TX.sign([{ text: '', size: 10 }], { w: 128, h: 256, bg: '#ffcf86', border: false }), color: new THREE.Color(1.5, 1.05, 0.6), toneMapped: false });
    for (const s of [-1, 1]) {
      for (const x of [13.2, 23.6]) {
        const c = new THREE.Mesh(colGeo, gold); c.position.set(s * x, PROM_Y + 0.8 + 8.2, PROSC_Z + 0.75); root.add(c);
        const cap = new THREE.Mesh(capGeo, gold); cap.position.set(s * x, PROM_Y + 17.3, PROSC_Z + 0.75); root.add(cap);
        const b = new THREE.Mesh(baseGeo, goldDark); b.position.set(s * x, PROM_Y + 0.4, PROSC_Z + 0.75); root.add(b);
      }
      // tall window between the columns
      const shp = new THREE.Shape(); const ww = 3.2, hh = 9, x0 = s * 18.4;
      shp.moveTo(-ww / 2, 0); shp.lineTo(ww / 2, 0); shp.lineTo(ww / 2, hh); shp.absarc(0, hh, ww / 2, 0, Math.PI, false); shp.closePath();
      const win = new THREE.Mesh(new THREE.ShapeGeometry(shp, 20), winMat); win.position.set(x0, PROM_Y + 3.2, PROSC_Z + 0.06); root.add(win);
      for (let i = -1; i <= 1; i++) { const mull = new THREE.Mesh(new THREE.BoxGeometry(0.08, hh + ww / 2, 0.1), goldDark); mull.position.set(x0 + i * ww / 4 * (i ? 1 : 0), PROM_Y + 3.2 + (hh + ww / 2) / 2, PROSC_Z + 0.1); if (i) mull.position.x = x0 + i * ww / 4; root.add(mull); }
      for (let j = 1; j <= 4; j++) { const tr = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.08, 0.1), goldDark); tr.position.set(x0, PROM_Y + 3.2 + j * hh / 4.5, PROSC_Z + 0.1); root.add(tr); }
      const frame = new THREE.Mesh(new THREE.TorusGeometry(ww / 2 + 0.1, 0.12, 8, 32, Math.PI), gold); frame.position.set(x0, PROM_Y + 3.2 + hh, PROSC_Z + 0.12); root.add(frame);
      W.winMat = winMat;
    }
  }

  // ── curtains (velvet, folded) + valance
  const curtainMat = new THREE.MeshPhysicalMaterial({ color: 0x7d0f1f, roughness: 0.75, sheen: 1, sheenColor: new THREE.Color(0xff6a7a), sheenRoughness: 0.35, map: TX.velvet('#ffffff', { pattern: false }) });
  const curtains = [];
  {
    const cw = 11.4, ch = OPEN_Y1 - OPEN_Y0 + 0.4;
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(cw, ch, 120, 6);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 3.1) * 0.22 + Math.sin(x * 7.3) * 0.05); }
      g.computeVertexNormals();
      g.translate(-s * cw / 2, 0, 0); // pivot at the outer edge
      const pivot = new THREE.Group(); pivot.position.set(s * OPEN_W, OPEN_Y0 + ch / 2 - 0.2, PROSC_Z - 0.45);
      const m = new THREE.Mesh(g, curtainMat); pivot.add(m); root.add(pivot);
      curtains.push(pivot);
    }
    // valance: scalloped swags
    const vg = new THREE.PlaneGeometry(OPEN_W * 2 + 0.6, 1.6, 160, 4); const p = vg.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const sw = Math.abs(Math.sin(x * 0.72)); p.setZ(i, sw * 0.35 * (0.8 - y / 1.6)); if (y < 0) p.setY(i, y - sw * 0.55); }
    vg.computeVertexNormals();
    const val = new THREE.Mesh(vg, curtainMat); val.position.set(0, OPEN_Y1 - 1.1, PROSC_Z - 0.2); root.add(val);
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(OPEN_W * 2 + 0.6, 0.12, 0.08), gold); fringe.position.set(0, OPEN_Y1 - 0.3, PROSC_Z - 0.12); root.add(fringe);
  }
  W.curtains = curtains; W.curtainOpen = 0;

  // intermission board projected on the curtains
  const board = TX.liveCanvas(1024, 512);
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5), new THREE.MeshBasicMaterial({ map: board.t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  boardMesh.position.set(0, 7.4, PROSC_Z - 0.1); root.add(boardMesh);
  W.board = board; W.boardMesh = boardMesh;

  // ── marquee above the proscenium with chasing bulbs
  {
    const cfg = window.THEATER_CONFIG.brand;
    const lines = cfg.logo ? [{ text: cfg.marqueeSub || '', size: 40, spacing: 16 }, { text: ' ', size: 150 }, { text: cfg.marquee || '', size: 44, spacing: 22 }]
                           : [{ text: cfg.marqueeSub || '', size: 52, spacing: 18 }, { text: cfg.marquee, size: 120, spacing: 10 }];
    const tex = TX.sign(lines, { w: 1536, h: 384, bg: '#1b0609' });
    const mw = 15, mh = 3.75;
    const mq = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.35, 1.25, 1.15), toneMapped: false }));
    mq.position.set(0, 16.9, PROSC_Z + 0.32); root.add(mq);
    if (cfg.logo) {
      const logoMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: new THREE.Color(1.9, 1.55, 1.05), toneMapped: false });
      new THREE.TextureLoader().load(cfg.logo, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; logoMat.map = t; logoMat.needsUpdate = true;
        const asp = t.image.width / t.image.height, lw = 9.2;
        const logo = new THREE.Mesh(new THREE.PlaneGeometry(lw, lw / asp), logoMat); logo.position.set(0, 16.92, PROSC_Z + 0.34); root.add(logo);
        // glowing logo inlaid on the stage apron, readable from every seat
        const floorMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.1, 0.8, 0.4), toneMapped: false });
        const fw = 6.2; const fl = new THREE.Mesh(new THREE.PlaneGeometry(fw, fw / asp), floorMat);
        fl.rotation.x = -Math.PI / 2; fl.position.set(0, STAGE_Y + 0.012, STAGE_FRONT - 0.9); root.add(fl);
        W.anim.push((tt, S) => { floorMat.color.setRGB(0.7 + 0.5 * S.house + 0.15 * Math.sin(tt * 1.5), 0.5 + 0.35 * S.house, 0.25 + 0.15 * S.house); });
      });
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(mw + 0.9, mh + 0.9, 0.3), gold); back.position.set(0, 16.9, PROSC_Z + 0.12); root.add(back);
    const pts = []; const nx = 30, ny = 8;
    for (let i = 0; i < nx; i++) { const x = -mw / 2 - 0.2 + (mw + 0.4) * i / (nx - 1); pts.push([x, mh / 2 + 0.22], [x, -mh / 2 - 0.22]); }
    for (let j = 1; j < ny - 1; j++) { const y = -mh / 2 - 0.22 + (mh + 0.44) * j / (ny - 1); pts.push([-mw / 2 - 0.22, y], [mw / 2 + 0.22, y]); }
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), pts.length);
    const m = new THREE.Matrix4(); pts.forEach(([x, y], i) => { m.makeTranslation(x, 16.9 + y, PROSC_Z + 0.36); bulbs.setMatrixAt(i, m); bulbs.setColorAt(i, new THREE.Color(3, 2, 1)); });
    root.add(bulbs);
    const order = pts.map(([x, y]) => Math.atan2(y, x));
    const col = new THREE.Color();
    W.anim.push((t, S) => {
      const speed = S.house > 0.6 ? 6 : 2;
      for (let i = 0; i < pts.length; i++) {
        const k = 0.5 + 0.5 * Math.sin(order[i] * 8 - t * speed);
        const b = 0.35 + (k > 0.55 ? 2.6 : 0.4) * (0.5 + S.house * 0.5);
        bulbs.setColorAt(i, col.setRGB(b * 1.0, b * 0.72, b * 0.38));
      }
      bulbs.instanceColor.needsUpdate = true;
    });
  }

  // ── horseshoe walls
  {
    const a = Math.acos((PROSC_Z - C.z) / WALL_R);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, 24, 128, 1, true, -a, 2 * a), std({ map: TX.velvet('#3d0a13', { repeat: [28, 4] }), roughness: 0.95, side: THREE.BackSide }));
    wall.position.set(C.x, 12, C.z); root.add(wall);
    // wall sconces along the promenade
    const sconceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 1.1), toneMapped: false });
    const glowTex = TX.radial('rgba(255,190,110,0.9)', 'rgba(255,140,60,0)');
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 18; i++) {
      const ang = -a + 0.25 + (2 * a - 0.5) * i / 17; const r = WALL_R - 0.15;
      const x = C.x + r * Math.sin(ang), z = C.z + r * Math.cos(ang);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), sconceMat); bulb.position.set(x, PROM_Y + 2.6, z); root.add(bulb);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 6), gold); arm.position.set(x, PROM_Y + 2.3, z); root.add(arm);
      const sp = new THREE.Sprite(glowMat); sp.scale.setScalar(2.2); sp.position.set(x, PROM_Y + 2.6, z); root.add(sp);
    }
  }

  // ── balconies (3 tiers) with pearl lamps and crowd holding light sticks
  const crowd = []; // {x,y,z,phase,tier}
  {
    const a = Math.acos((PROSC_Z + 0.5 - C.z) / BALC_R);
    const pearlPts = [];
    BALC_Y.forEach((y, ti) => {
      const { geo } = sectorShape(BALC_R, WALL_R + 0.1, PROSC_Z + 0.5);
      const fl = new THREE.Mesh(geo, carpetMat); fl.position.y = y; root.add(fl);
      const soffit = new THREE.Mesh(geo.clone(), std({ color: 0x2a0a10, roughness: 0.9, side: THREE.BackSide })); soffit.position.y = y - 0.35; root.add(soffit);
      const parapet = new THREE.Mesh(arcBand(BALC_R, 1.05, a), std({ map: TX.velvet('#5a0f1c', { repeat: [40, 1] }), roughness: 0.9, side: THREE.DoubleSide }));
      parapet.position.set(C.x, y + 0.5, C.z); root.add(parapet);
      const front = new THREE.Mesh(arcBand(BALC_R - 0.02, 0.38, a), gold); front.position.set(C.x, y - 0.18, C.z); root.add(front);
      const rail = new THREE.Mesh(arcBand(BALC_R - 0.03, 0.09, a), gold); rail.position.set(C.x, y + 1.05, C.z); root.add(rail);
      for (let ang = -a + 0.02; ang < a; ang += 0.045) pearlPts.push([C.x + (BALC_R - 0.12) * Math.sin(ang), y - 0.18, C.z + (BALC_R - 0.12) * Math.cos(ang)]);
      // columns up to the next tier
      const top = ti < 2 ? BALC_Y[ti + 1] - 0.35 : 18.6;
      for (let ang = -a + 0.08; ang < a; ang += 0.24) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, top - (y + 1.1), 8), goldDark);
        col.position.set(C.x + (BALC_R + 0.15) * Math.sin(ang), (top + y + 1.1) / 2, C.z + (BALC_R + 0.15) * Math.cos(ang)); root.add(col);
      }
      // crowd
      const rr = Math.random;
      for (const [r, dy] of [[23.1, 0], [24.1, 0.45]]) for (let ang = -a + 0.04; ang < a - 0.02; ang += 0.058) {
        if (rr() < 0.18) continue;
        crowd.push({ x: C.x + r * Math.sin(ang), y: y + dy, z: C.z + r * Math.cos(ang), ang, ph: rr() * 6.28, tier: ti, hue: rr() });
      }
    });
    // promenade columns under first balcony
    for (let ang = -1.3; ang <= 1.3; ang += 0.26) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, BALC_Y[0] - 0.35 - PROM_Y, 12), gold);
      col.position.set(C.x + (BALC_R + 0.15) * Math.sin(ang), (BALC_Y[0] - 0.35 + PROM_Y) / 2, C.z + (BALC_R + 0.15) * Math.cos(ang));
      if (col.position.z > STAGE_FRONT + 0.5 && Math.abs(ang) > 0.15) root.add(col);
    }
    const pearls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), pearlPts.length);
    const m = new THREE.Matrix4(); const pc = new THREE.Color(2.6, 1.8, 1.0);
    pearlPts.forEach((p, i) => { m.makeTranslation(...p); pearls.setMatrixAt(i, m); pearls.setColorAt(i, pc); });
    root.add(pearls);
    W.pearls = pearls; W.pearlCount = pearlPts.length;
  }
  // crowd instancing: body, head, stick
  {
    const n = crowd.length;
    const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.3, 4, 10), std({ color: 0xffffff, roughness: 0.8 }), n);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 14, 10), std({ color: 0xf2d6bf, roughness: 0.7 }), n);
    const stick = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.045, 0.28, 3, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
    const bodyCols = ['#5b1a2a', '#2b2f4a', '#3b2a1e', '#4a3b2c', '#20363a', '#5a4a2a', '#2a2a2a'];
    crowd.forEach((c, i) => body.setColorAt(i, new THREE.Color(bodyCols[(c.hue * bodyCols.length) | 0]).multiplyScalar(0.8)));
    root.add(body, head, stick);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const palette = window.THEATER_CONFIG.colors.map(h => new THREE.Color(h));
    W.crowdCount = n;
    W.anim.push((t, S) => {
      const energy = S.cheer > 0 ? 1 : S.house > 0.6 ? 0.7 : 0.35;
      for (let i = 0; i < n; i++) {
        const c = crowd[i];
        const wave = Math.sin(t * (1.6 + energy * 2.4) + c.ang * 4 + c.ph * (S.house > 0.6 ? 1 : 0.15));
        const hop = S.cheer > 0 ? Math.max(0, Math.sin(t * 9 + c.ph)) * 0.18 : 0;
        q.setFromAxisAngle(v.set(0, 1, 0), c.ang + Math.PI);
        m.compose(v.set(c.x, c.y + 0.55 + hop, c.z), q, s1); body.setMatrixAt(i, m);
        m.compose(v.set(c.x, c.y + 1.06 + hop, c.z), q, s1); head.setMatrixAt(i, m);
        // stick swings left-right overhead
        const sw = wave * (0.35 + energy * 0.35);
        e.set(0, c.ang + Math.PI, sw); q.setFromEuler(e);
        const ox = Math.sin(-sw) * 0.25;
        m.compose(v.set(c.x + Math.cos(c.ang) * ox, c.y + 1.62 + hop, c.z - Math.sin(c.ang) * ox), q, s1); stick.setMatrixAt(i, m);
        // show: unified brand gold; intermission: everyone's colours
        const pc = S.house > 0.6 ? palette[(c.hue * palette.length) | 0] : palette[0];
        const b = 1.1 + 0.7 * Math.max(0, wave);
        stick.setColorAt(i, col.copy(pc).multiplyScalar(b));
      }
      body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = stick.instanceMatrix.needsUpdate = true;
      stick.instanceColor.needsUpdate = true;
    });
  }

  // ── dome ceiling
  {
    const tex = TX.dome();
    const domeG = new THREE.SphereGeometry(WALL_R + 0.6, 96, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const d = new THREE.Mesh(domeG, std({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.8, side: THREE.BackSide }));
    d.scale.set(1, 0.36, 1); d.position.set(C.x, 18.4, C.z); root.add(d);
    W.domeMat = d.material;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(WALL_R - 0.1, 0.25, 8, 160), gold); ring.rotation.x = Math.PI / 2; ring.position.set(C.x, 18.5, C.z); root.add(ring);
    const ringLed = new THREE.Mesh(new THREE.TorusGeometry(WALL_R - 0.4, 0.06, 6, 200), ledMat); ringLed.rotation.x = Math.PI / 2; ringLed.position.set(C.x, 18.25, C.z); root.add(ringLed);
  }

  // ── chandelier
  {
    const g = new THREE.Group(); g.position.set(0, 16.6, -11); root.add(g);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 9, 6), gold); chain.position.y = 4.5; g.add(chain);
    const tiers = [[0, 2.8], [-0.9, 2.1], [-1.7, 1.35], [-2.35, 0.6]];
    const crys = []; const ringsMesh = [];
    tiers.forEach(([y, r], i) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 64), gold); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); ringsMesh.push(t);
      const n = Math.round(r * 2 * Math.PI / 0.2);
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; for (let j = 0; j < 3; j++) crys.push([Math.cos(a) * r, y - 0.18 - j * 0.2 - (k % 2) * 0.1, Math.sin(a) * r, j]); }
      // spokes
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, r, 4), gold); sp.rotation.z = Math.PI / 2; sp.rotation.y = -a; sp.position.set(Math.cos(a) * r / 2, y, Math.sin(a) * r / 2); g.add(sp); }
    });
    const cm = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), crys.length);
    const m = new THREE.Matrix4(), s = new THREE.Vector3(1, 1.8, 1), q = new THREE.Quaternion(), v = new THREE.Vector3(), col = new THREE.Color();
    crys.forEach((c, i) => { m.compose(v.set(c[0], c[1], c[2]), q, s); cm.setMatrixAt(i, m); cm.setColorAt(i, col.setRGB(2, 1.8, 1.5)); });
    g.add(cm);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.8), toneMapped: false })); core.position.y = -1.2; g.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.radial('rgba(255,210,150,0.8)', 'rgba(255,160,80,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(9); halo.position.y = -1.2; g.add(halo);
    const light = new THREE.PointLight(0xffd9a0, 900, 60, 1.6); light.position.y = -1.4; g.add(light);
    W.chandelier = { g, light, halo, core };
    W.anim.push((t, S) => {
      g.rotation.y = t * 0.05;
      const b = 0.35 + S.house * 0.9;
      for (let i = 0; i < crys.length; i++) { const tw = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.7) * Math.sin(t * 1.3 + i * 0.37); cm.setColorAt(i, col.setRGB(2.2 * b * tw + 0.2, 1.9 * b * tw + 0.15, 1.5 * b * tw + 0.1)); }
      cm.instanceColor.needsUpdate = true;
      light.intensity = 90 + 430 * S.house; halo.material.opacity = 0.25 + 0.6 * S.house; core.material.color.setRGB(1 + 3 * S.house, 0.8 + 2.2 * S.house, 0.5 + 1.3 * S.house);
    });
  }

  // ── moving-head beams (visual cones + floor pools; cheap fake lighting)
  {
    const beamMat = (c) => new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(c) }, uI: { value: 1 } },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; uniform float uL;
        void main(){ vY = -position.y; vec4 wp = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float l = clamp(1.0 - vY/28.0, 0., 1.); gl_FragColor = vec4(uColor * f * l * l * 0.45 * uI, 1.); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const poolTex = TX.radial('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)');
    const L = 34; const coneGeo = new THREE.CylinderGeometry(0.12, 2.6, L, 32, 1, true); coneGeo.translate(0, -L / 2, 0);
    const heads = [];
    const srcs = [];
    for (const a of [-1.15, -0.62, -0.2, 0.2, 0.62, 1.15]) srcs.push(new THREE.Vector3(C.x + (BALC_R - 0.3) * Math.sin(a), BALC_Y[2] + 1.3, C.z + (BALC_R - 0.3) * Math.cos(a)));
    srcs.push(new THREE.Vector3(-7, 15.6, PROSC_Z + 1.2), new THREE.Vector3(7, 15.6, PROSC_Z + 1.2));
    const cols = [0xffc27a, 0xff4f7a, 0x8a7bff, 0x4fd7ff, 0xffe08a, 0xff8a4f, 0xfff1d0, 0xfff1d0];
    srcs.forEach((p, i) => {
      const cone = new THREE.Mesh(coneGeo, beamMat(cols[i])); cone.position.copy(p); root.add(cone);
      const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.45, 12), goldDark); fixture.position.copy(p); root.add(fixture);
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i]).multiplyScalar(3), toneMapped: false })); lens.position.copy(p); root.add(lens);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ map: poolTex, color: cols[i], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
      pool.rotation.x = -Math.PI / 2; root.add(pool);
      heads.push({ p, cone, pool, lens, base: new THREE.Color(cols[i]), ph: i * 1.3, i });
    });
    const dir = new THREE.Vector3(), tgt = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), hsl = {};
    W.anim.push((t, S) => {
      const lively = Math.max(S.house, S.party || 0); // 1 = party, ~0 = film
      heads.forEach((h) => {
        const isStage = h.i >= 6;
        if (isStage) tgt.set(Math.sin(t * 0.4 + h.ph) * 6, STAGE_Y, -16 - Math.cos(t * 0.3 + h.ph) * 0.6);
        else {
          const sp = 0.25 + lively * 0.55;
          const r = 6 + 6 * (0.5 + 0.5 * Math.sin(t * sp * 0.7 + h.ph));
          const ang = Math.sin(t * sp + h.ph) * 1.1;
          tgt.set(C.x + r * Math.sin(ang), 0, C.z + r * Math.cos(ang));
          if (lively < 0.5) tgt.set(tgt.x * 0.5, 0, Math.max(tgt.z, -14)); // during the film keep the beams low over the audience
          tgt.y = heightAt(tgt.x, tgt.z);
        }
        dir.subVectors(tgt, h.p); const len = dir.length(); dir.normalize();
        h.cone.quaternion.setFromUnitVectors(down, dir);
        h.cone.scale.set(1, len / L * 1.05, 1);
        h.pool.position.set(tgt.x, tgt.y + 0.03, tgt.z);
        // colour cycling in party mode
        const c = h.cone.material.uniforms.uColor.value;
        if (lively > 0.5 && !isStage) { h.base.getHSL(hsl); c.setHSL((hsl.h + t * 0.05 + h.i * 0.12) % 1, 0.85, 0.6); } else c.copy(h.base);
        const I = isStage ? (0.4 + 0.6 * lively) : (0.18 + 0.82 * lively);
        h.cone.material.uniforms.uI.value = I * S.beams;
        h.pool.material.color.copy(c); h.pool.material.opacity = 0.55 * I * S.beams;
        h.lens.material.color.copy(c).multiplyScalar(1 + 2.5 * I);
      });
    });
  }

  // ── floating gold dust
  {
    const n = lowEnd ? 500 : 1400; const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { const r = Math.sqrt(Math.random()) * 23, a = Math.random() * Math.PI * 2; pos.set([C.x + r * Math.sin(a), Math.random() * 18, C.z + r * Math.cos(a)], i * 3); seed[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uTex: { value: TX.radial('rgba(255,230,170,1)', 'rgba(255,200,120,0)', 64) }, uPx: { value: renderer.getPixelRatio() } },
      vertexShader: `attribute float seed; uniform float uT; uniform float uPx; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y + uT*0.18 + seed, 18.0); p.x += sin(uT*0.3+seed)*0.6; p.z += cos(uT*0.25+seed*1.3)*0.6;
          vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = (40.0*uPx) / -mv.z * (0.6+0.4*sin(uT*2.0+seed)); vA = 0.5+0.5*sin(uT*1.7+seed*3.0); }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ vec4 c = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(c.rgb*vec3(1.0,0.82,0.55)*1.6, c.a*vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; root.add(pts);
    W.anim.push((t) => { mat.uniforms.uT.value = t; });
  }

  // ── confetti cannons
  {
    const N = lowEnd ? 500 : 1100;
    const geo = new THREE.PlaneGeometry(0.09, 0.15);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), N);
    mesh.frustumCulled = false;
    const P = []; const col = new THREE.Color(); const cols = [[1.1, .78, .3], [1.0, .12, .2], [1.05, 1.05, .98], [.9, .6, .22], [.55, .38, 1.0], [.2, .75, .55]];
    for (let i = 0; i < N; i++) { P.push({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 }); const c = cols[i % cols.length]; mesh.setColorAt(i, col.setRGB(c[0], c[1], c[2])); }
    root.add(mesh);
    let cursor = 0;
    W.confetti = (big = true) => {
      const origins = [new THREE.Vector3(-10, STAGE_Y + 0.4, -15.6), new THREE.Vector3(10, STAGE_Y + 0.4, -15.6)];
      if (big) origins.push(new THREE.Vector3(0, 17.5, -11));
      const per = Math.floor((big ? N : N * 0.5) / origins.length);
      origins.forEach((o, oi) => {
        for (let k = 0; k < per; k++) {
          const p = P[cursor]; cursor = (cursor + 1) % N;
          p.p.copy(o).add(new THREE.Vector3((Math.random() - .5) * .5, 0, (Math.random() - .5) * .5));
          if (oi < 2) p.v.set(-Math.sign(o.x) * (1 + Math.random() * 4), 9 + Math.random() * 7, 3 + Math.random() * 8);
          else p.v.set((Math.random() - .5) * 10, -Math.random() * 2, (Math.random() - .5) * 10);
          p.w.set(Math.random() * 10, Math.random() * 10, Math.random() * 10); p.life = 9 + Math.random() * 3;
        }
      });
    };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
    let active = false;
    W.anim.push((t, S, dt) => {
      let any = false;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life <= 0) { if (active) { m.compose(p.p.set(0, -50, 0), q, zero); mesh.setMatrixAt(i, m); } continue; }
        any = true; p.life -= dt;
        p.v.y -= 6 * dt; p.v.multiplyScalar(1 - 1.6 * dt); if (p.v.y < -1.6) p.v.y = -1.6;
        p.p.addScaledVector(p.v, dt); p.p.x += Math.sin(t * 3 + i) * 0.01;
        const floor = heightAt(p.p.x, p.p.z) + 0.02; if (p.p.y < floor) { p.p.y = floor; p.v.set(0, 0, 0); p.w.multiplyScalar(0.9); }
        p.r.x += p.w.x * dt; p.r.y += p.w.y * dt; p.r.z += p.w.z * dt; q.setFromEuler(p.r);
        m.compose(p.p, q, p.life < 1 ? one.clone().multiplyScalar(p.life) : one); mesh.setMatrixAt(i, m);
      }
      if (any || active) mesh.instanceMatrix.needsUpdate = true;
      active = any;
    });
  }

  // ── cold-spark fountains on the stage lip (film start, curtain call)
  {
    const N = lowEnd ? 700 : 1600;
    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), alpha = new Float32Array(N);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: TX.radial('rgba(255,240,200,1)', 'rgba(255,170,60,0)', 64) }, uPx: { value: renderer.getPixelRatio() } },
      vertexShader: `attribute float alpha; uniform float uPx; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = 22.0*uPx/-mv.z*(0.5+alpha); vA = alpha; }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ vec4 c = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.6,1.15,0.6)*c.rgb, c.a*vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; root.add(pts);
    const src = [-9, -4.5, 4.5, 9].map((x) => new THREE.Vector3(x, STAGE_Y + 0.05, STAGE_FRONT - 0.5));
    const caps = src.map((p) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 12), goldDark); m.position.copy(p); root.add(m); return m; });
    let until = 0, cursor = 0, clock = 0;
    W.sparks = (sec = 4) => { until = Math.max(until, clock + sec); };
    W.anim.push((t, S, dt) => {
      clock = t;
      if (t < until) {
        const n = Math.min(N / 3, Math.ceil(dt * 900));
        for (let k = 0; k < n; k++) {
          const i = cursor; cursor = (cursor + 1) % N; const o = src[k % src.length];
          pos[i * 3] = o.x; pos[i * 3 + 1] = o.y + 0.15; pos[i * 3 + 2] = o.z;
          const a = Math.random() * Math.PI * 2, r = Math.random() * 0.9;
          vel[i * 3] = Math.cos(a) * r; vel[i * 3 + 1] = 6.5 + Math.random() * 3.5; vel[i * 3 + 2] = Math.sin(a) * r;
          life[i] = 0.9 + Math.random() * 0.8;
        }
      }
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        life[i] -= dt; vel[i * 3 + 1] -= 9 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        alpha[i] = Math.max(0, Math.min(1, life[i] * 1.5)) * (0.6 + 0.4 * Math.random());
      }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    });
  }

  // ── kiosks on the promenade
  {
    const mkKiosk = (kind, ang) => {
      const r = 23.3; const x = C.x + r * Math.sin(ang), z = C.z + r * Math.cos(ang);
      const g = new THREE.Group(); g.position.set(x, PROM_Y, z); g.rotation.y = ang + Math.PI; root.add(g);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.05, 0.9), std({ color: kind === 'popcorn' ? 0x6e0f1c : 0x1d1630, roughness: 0.5 })); counter.position.set(0, 0.52, 0.2); g.add(counter);
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, 1.0), gold); top.position.set(0, 1.07, 0.2); g.add(top);
      const stripeMat = std({ map: TX.stripes(kind === 'popcorn' ? '#d8263a' : '#3a2a8a', '#fff4e6', 14), roughness: 0.7, side: THREE.DoubleSide });
      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3.4, 20, 1, true, 0, Math.PI), stripeMat); canopy.rotation.z = Math.PI / 2; canopy.position.set(0, 2.75, 0.15); g.add(canopy);
      for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.7, 8), gold); post.position.set(s * 1.55, 1.35, 0.6); g.add(post); }
      const label = kind === 'popcorn' ? [{ text: 'POPCORN', size: 92, spacing: 12 }, { text: '팝콘 받기 · E', size: 46, font: '"Noto Sans KR",sans-serif' }] : [{ text: 'LIGHT STICK', size: 82, spacing: 10 }, { text: '응원봉 받기 · E', size: 46, font: '"Noto Sans KR",sans-serif' }];
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.9), new THREE.MeshBasicMaterial({ map: TX.sign(label, { w: 1024, h: 300, bg: '#160709', color: kind === 'popcorn' ? '#ffe0a0' : '#d9d0ff', glow: kind === 'popcorn' ? '#ff8a3d' : '#8f7bff' }), toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
      sg.position.set(0, 3.55, 0.25); g.add(sg);
      if (kind === 'popcorn') {
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.6), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0, transparent: true, opacity: 0.18, roughness: 0.05 })); glass.position.set(-0.9, 1.55, 0.2); g.add(glass);
        const pc = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 0), std({ color: 0xfff1c4, emissive: 0x806020, roughness: 0.6 }), 160);
        const m = new THREE.Matrix4(); for (let i = 0; i < 160; i++) { m.makeTranslation(-0.9 + (Math.random() - .5) * 0.8, 1.15 + Math.random() * Math.random() * 0.6, 0.2 + (Math.random() - .5) * 0.5); pc.setMatrixAt(i, m); } g.add(pc);
        const lamp = new THREE.PointLight(0xffb060, 25, 6, 2); lamp.position.set(0, 2.2, 1.2); g.add(lamp);
        for (let i = 0; i < 3; i++) { const b = makePopcornBucket(); b.position.set(0.3 + i * 0.4, 1.1, 0.2); g.add(b); }
      } else {
        const lamp = new THREE.PointLight(0x9f8bff, 25, 6, 2); lamp.position.set(0, 2.2, 1.2); g.add(lamp);
        window.THEATER_CONFIG.colors.forEach((c, i) => { const st = makeLightStick(c); st.position.set(-1.3 + i * 0.37, 1.1, 0.2); st.rotation.z = (i - 3.5) * 0.06; g.add(st); });
      }
      W.kiosks.push({ kind, x, z, y: PROM_Y });
    };
    mkKiosk('popcorn', -0.82); mkKiosk('stick', 0.82);
  }

  // ── lights
  const hemi = new THREE.HemisphereLight(0xffd7b0, 0x2a0a10, 1.2); root.add(hemi);
  const stageWash = new THREE.SpotLight(0xffd2a0, 900, 50, 0.5, 0.6, 1.5); stageWash.position.set(0, 18, -6); stageWash.target.position.set(0, 7, -19); root.add(stageWash, stageWash.target);
  const screenLight = new THREE.PointLight(0xffffff, 0, 45, 1.4); screenLight.position.set(0, SCREEN.y, -18); root.add(screenLight);
  W.lights = { hemi, stageWash, screenLight };

  // ── environment for gold reflections (warm studio, generated)
  {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x1a0508, side: THREE.BackSide })));
    const panel = (c, x, y, z, sx, sy) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
    panel(new THREE.Color(6, 4.2, 2.4), 0, 4.8, 0, 4, 4); panel(new THREE.Color(2.5, 1.2, 0.8), 4.8, 1, 0, 2, 6); panel(new THREE.Color(2.5, 1.2, 0.8), -4.8, 1, 0, 2, 6); panel(new THREE.Color(1.2, 0.5, 0.4), 0, 0, 4.8, 6, 2);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.04).texture; scene.environmentIntensity = 0.9;
  }

  scene.fog = new THREE.FogExp2(0x12060a, 0.0085);
  scene.background = new THREE.Color(0x0a0405);

  // ── per-frame show state (house lights, curtains, intermission board)
  W.update = (t, dt, S) => {
    W.curtainOpen += (S.curtain - W.curtainOpen) * Math.min(1, dt * 1.6);
    const o = W.curtainOpen;
    curtains.forEach((c) => { c.scale.x = 1 - 0.84 * o; c.rotation.y = 0; });
    hemi.intensity = 0.16 + 0.36 * S.house;
    stageWash.intensity = 80 + 420 * S.house;
    W.domeMat.emissiveIntensity = 0.12 + 0.5 * S.house;
    ledMat.color.setRGB(0.8 + 1.4 * S.house, 0.55 + 1.0 * S.house, 0.25 + 0.5 * S.house);
    W.winMat.color.setRGB(0.5 + 1.0 * S.house, 0.35 + 0.7 * S.house, 0.2 + 0.4 * S.house);
    boardMesh.material.opacity = Math.max(0, 1 - o * 1.6);
    boardMesh.visible = o < 0.6;
    for (const f of W.anim) f(t, S, dt);
  };
  return W;
}

// ───────── props shared with avatars ─────────
let _stripe;
export function makePopcornBucket() {
  _stripe = _stripe || TX.stripes();
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.085, 0.22, 16), new THREE.MeshStandardMaterial({ map: _stripe, roughness: 0.6 }));
  b.position.y = 0.11; g.add(b);
  const pc = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 0), new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0x403010, roughness: 0.6 }), 16);
  const m = new THREE.Matrix4(); for (let i = 0; i < 16; i++) { const a = i * 2.4, r = Math.sqrt(i / 16) * 0.1; m.makeTranslation(Math.cos(a) * r, 0.23 + Math.random() * 0.05 * (1 - r * 6), Math.sin(a) * r); pc.setMatrixAt(i, m); }
  g.add(pc);
  return g;
}
export function makeLightStick(color) {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.4, metalness: 0.4 })); h.position.y = 0.08; g.add(h);
  const c = new THREE.Color(color);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 4, 12), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(3.2), toneMapped: false })); head.position.y = 0.27; g.add(head);
  g.userData.head = head; g.userData.base = c;
  return g;
}
