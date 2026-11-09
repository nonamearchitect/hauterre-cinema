import * as THREE from 'three';
import * as TX from './textures.js';
import { makePopcornBucket, makeLightStick } from './world.js';

export const ANIM = { idle: 0, walk: 1, sit: 2, wave: 3, clap: 4, dance: 5, cheer: 6, eat: 7, jump: 8, run: 9 };
export const ITEM = { none: 0, popcorn: 1, stick: 2 };
const HAIR = ['#3a2418', '#1c1412', '#6b3f22', '#c98a4b', '#2c2f45', '#8a2b3a', '#e8d9b8', '#4a4a4a'];
const SKIN = 0xffe0c7;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const shadowTex = TX.radial('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 64);
const sharedGeo = {
  head: new THREE.SphereGeometry(0.32, 28, 20),
  hair: new THREE.SphereGeometry(0.338, 28, 16, 0, Math.PI * 2, 0, 1.25),
  eye: new THREE.SphereGeometry(0.052, 14, 10),
  hl: new THREE.SphereGeometry(0.017, 8, 6),
  blush: new THREE.CircleGeometry(0.048, 16),
  mouth: new THREE.TorusGeometry(0.036, 0.011, 6, 14, Math.PI),
  arm: new THREE.CapsuleGeometry(0.062, 0.16, 4, 10),
  hand: new THREE.SphereGeometry(0.072, 12, 10),
  leg: new THREE.CapsuleGeometry(0.075, 0.12, 4, 10),
  foot: new THREE.SphereGeometry(0.088, 12, 10),
  bow: new THREE.ConeGeometry(0.06, 0.1, 10),
  shadow: new THREE.PlaneGeometry(0.9, 0.9),
};
sharedGeo.shadow.rotateX(-Math.PI / 2);
const bodyGeo = (() => {
  const pts = [[0, 0], [0.18, 0.0], [0.225, 0.07], [0.24, 0.2], [0.22, 0.32], [0.17, 0.41], [0.06, 0.445], [0, 0.45]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 24);
})();
const mats = {
  skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x1b1210, roughness: 0.15, metalness: 0.1 }),
  hl: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  blush: new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.55, depthWrite: false }),
  mouth: new THREE.MeshBasicMaterial({ color: 0x5a2420 }),
  shoe: new THREE.MeshStandardMaterial({ color: 0x241815, roughness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xe0b45c, metalness: 1, roughness: 0.3 }),
  shadow: new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
};

export class Avatar {
  constructor({ name = '관객', color = '#e2b45a', look = 0, isLocal = false } = {}) {
    this.name = name; this.color = color; this.isLocal = isLocal;
    this.anim = ANIM.idle; this.item = ITEM.none; this.speed = 0; this.walkPh = 0; this.t = Math.random() * 10;
    this.root = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 });
    this.bodyMat = bodyMat;

    const hips = this.hips = new THREE.Group(); hips.position.y = 0.38; this.root.add(hips);
    const torso = this.torso = new THREE.Group(); hips.add(torso);
    const body = new THREE.Mesh(bodyGeo, bodyMat); torso.add(body);
    // little gold bow tie — it's a gala night
    for (const s of [-1, 1]) { const b = new THREE.Mesh(sharedGeo.bow, mats.gold); b.rotation.z = s * Math.PI / 2; b.position.set(s * 0.05, 0.4, 0.17); torso.add(b); }

    const neck = this.neck = new THREE.Group(); neck.position.y = 0.42; torso.add(neck);
    const head = this.head = new THREE.Group(); head.position.y = 0.29; neck.add(head);
    const skull = new THREE.Mesh(sharedGeo.head, mats.skin); skull.scale.set(1.06, 0.96, 1); head.add(skull);
    const hairMat = new THREE.MeshStandardMaterial({ color: HAIR[look % HAIR.length], roughness: 0.6 });
    const hair = new THREE.Mesh(sharedGeo.hair, hairMat); hair.rotation.x = -0.32; hair.scale.set(1.06, 0.98, 1.02); head.add(hair);
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), hairMat); tuft.position.set(0.03, 0.34, 0.02); tuft.rotation.z = -0.5; head.add(tuft);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Group(); p.rotation.y = s * 0.34; head.add(p);
      const eye = new THREE.Mesh(sharedGeo.eye, mats.eye); eye.scale.set(0.85, 1.2, 0.55); eye.position.set(0, -0.0, 0.3); p.add(eye);
      const hl = new THREE.Mesh(sharedGeo.hl, mats.hl); hl.position.set(0.016, 0.03, 0.33); p.add(hl);
      const pb = new THREE.Group(); pb.rotation.y = s * 0.62; head.add(pb);
      const bl = new THREE.Mesh(sharedGeo.blush, mats.blush); bl.position.set(0, -0.09, 0.312); bl.scale.set(1.2, 0.8, 1); pb.add(bl);
      this.eyes.push(eye);
    }
    const mouth = new THREE.Mesh(sharedGeo.mouth, mats.mouth); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.1, 0.305); mouth.rotation.x = -0.2; head.add(mouth); this.mouth = mouth;

    const mkArm = (s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.205, 0.33, 0); torso.add(sh);
      const a = new THREE.Mesh(sharedGeo.arm, bodyMat); a.position.y = -0.13; sh.add(a);
      const h = new THREE.Mesh(sharedGeo.hand, mats.skin); h.position.y = -0.27; sh.add(h);
      const slot = new THREE.Group(); slot.position.y = -0.29; sh.add(slot);
      return { sh, slot };
    };
    this.armL = mkArm(1); this.armR = mkArm(-1);
    const mkLeg = (s) => {
      const hp = new THREE.Group(); hp.position.set(s * 0.1, 0.05, 0); hips.add(hp);
      const l = new THREE.Mesh(sharedGeo.leg, bodyMat); l.position.y = -0.13; hp.add(l);
      const f = new THREE.Mesh(sharedGeo.foot, mats.shoe); f.scale.set(1, 0.62, 1.35); f.position.set(0, -0.31, 0.03); hp.add(f);
      return hp;
    };
    this.legL = mkLeg(1); this.legR = mkLeg(-1);
    this.shadow = new THREE.Mesh(sharedGeo.shadow, mats.shadow); this.shadow.position.y = 0.015; this.shadow.renderOrder = -1; this.root.add(this.shadow);

    // items
    this.popcorn = makePopcornBucket(); this.popcorn.position.set(0, -0.06, 0.04); this.popcorn.visible = false; this.armL.slot.add(this.popcorn);
    this.stick = makeLightStick(color); this.stick.rotation.x = 2.2; this.stick.visible = false; this.armR.slot.add(this.stick);
    this.crumbs = [];

    // name tag
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.nameTag(name, color), depthWrite: false, transparent: true }));
    this.tag.scale.set(1.25, 0.27, 1); this.tag.position.y = 1.78; this.tag.renderOrder = 10; this.root.add(this.tag);
    if (isLocal) this.tag.material.opacity = 0.85;

    // pose state (smoothed)
    this.P = { lx: 0, rx: 0, alx: 0, alz: 0.12, arx: 0, arz: -0.12, hipY: 0.38, rz: 0, rx0: 0, hop: 0, hx: 0, hy: 0 };
    this.blink = 2 + Math.random() * 3;
    this.emoteUntil = 0;
  }

  setItem(it) { this.item = it; this.popcorn.visible = it === ITEM.popcorn; this.stick.visible = it === ITEM.stick; }

  say(text) {
    if (this.bubble) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.bubble(text), depthWrite: false, transparent: true }));
    sp.scale.set(1.9, 0.475, 1); sp.position.y = 2.15; sp.renderOrder = 11; this.root.add(sp);
    this.bubble = sp; this.bubbleT = 4.2;
  }

  /** advance animation; anim/speed already set by controller */
  update(dt, cam) {
    this.t += dt; const t = this.t, P = this.P, A = this.anim;
    const k = 12;
    let lx = 0, rx = 0, alx = 0, alz = 0.12 + Math.sin(t * 1.6) * 0.03, arx = 0, arz = -0.12 - Math.sin(t * 1.6) * 0.03;
    let hipY = 0.38 + Math.sin(t * 2) * 0.006, rz = 0, lean = 0, hop = 0, hx = 0, hy = 0;

    if (A === ANIM.walk || A === ANIM.run) {
      this.walkPh += dt * (A === ANIM.run ? 13 : 9.5);
      const s = Math.sin(this.walkPh), amp = A === ANIM.run ? 0.9 : 0.65;
      lx = s * amp; rx = -s * amp; alx = -s * amp * 0.8; arx = s * amp * 0.8;
      hipY = 0.38 + Math.abs(Math.cos(this.walkPh)) * 0.045; lean = A === ANIM.run ? 0.18 : 0.06; rz = s * 0.05;
    } else if (A === ANIM.sit) {
      lx = -1.45; rx = -1.45; alx = -0.42; arx = -0.42; alz = 0.25; arz = -0.25; hipY = 0.46; lean = -0.05;
    } else if (A === ANIM.wave) {
      arz = -2.55 + Math.sin(t * 11) * 0.35; hx = -0.1; rz = Math.sin(t * 5.5) * 0.05;
    } else if (A === ANIM.clap) {
      const c = 0.5 + 0.5 * Math.sin(t * 15);
      alx = -1.25; arx = -1.25; alz = -(0.08 + 0.42 * c); arz = 0.08 + 0.42 * c; hop = Math.max(0, Math.sin(t * 15)) * 0.015;
    } else if (A === ANIM.dance) {
      const b = t * 6.5; rz = Math.sin(b) * 0.22; hop = Math.abs(Math.sin(b)) * 0.12;
      alz = 2.1 + Math.sin(b) * 0.6; arz = -2.1 + Math.sin(b) * 0.6; lx = Math.max(0, Math.sin(b)) * -0.5; rx = Math.max(0, -Math.sin(b)) * -0.5; hy = Math.sin(b) * 0.25;
    } else if (A === ANIM.cheer) {
      const b = t * 11; alz = 2.75 + Math.sin(b) * 0.28; arz = -2.75 + Math.sin(b + 1.2) * 0.28; hop = Math.max(0, Math.sin(t * 7)) * 0.1; hx = -0.15;
    } else if (A === ANIM.eat) {
      const c = (t % 1.3) / 1.3, up = c < 0.5 ? Math.sin(c / 0.5 * Math.PI) : 0;
      arx = -0.9 - up * 1.55; arz = 0.25 + up * 0.25; hx = up * 0.12;
      this.mouth.scale.y = 1 + Math.max(0, Math.sin(t * 18)) * (c > 0.35 ? 1.2 : 0);
    } else if (A === ANIM.jump) {
      lx = -0.55; rx = -0.4; alz = 1.1; arz = -1.1;
    }
    if (A !== ANIM.eat) this.mouth.scale.y = damp(this.mouth.scale.y, A === ANIM.cheer || A === ANIM.dance ? 1.8 : 1, 10, dt);
    // hold items
    if (this.item === ITEM.popcorn && A !== ANIM.jump && A !== ANIM.dance && A !== ANIM.cheer) { alx = -0.95; alz = -0.28; }
    if (this.item === ITEM.stick && (A === ANIM.idle || A === ANIM.sit)) { arx = -0.55; arz = -0.15 + Math.sin(t * 2.4) * 0.12; }

    P.lx = damp(P.lx, lx, k, dt); P.rx = damp(P.rx, rx, k, dt);
    P.alx = damp(P.alx, alx, k, dt); P.alz = damp(P.alz, alz, k, dt); P.arx = damp(P.arx, arx, k, dt); P.arz = damp(P.arz, arz, k, dt);
    P.hipY = damp(P.hipY, hipY, k, dt); P.rz = damp(P.rz, rz, 8, dt); P.rx0 = damp(P.rx0, lean, 8, dt); P.hop = damp(P.hop, hop, 16, dt);
    P.hx = damp(P.hx, hx, 8, dt); P.hy = damp(P.hy, hy, 8, dt);

    this.legL.rotation.x = P.lx; this.legR.rotation.x = P.rx;
    this.armL.sh.rotation.set(P.alx, 0, P.alz); this.armR.sh.rotation.set(P.arx, 0, P.arz);
    this.hips.position.y = P.hipY + P.hop; this.torso.rotation.set(P.rx0, 0, P.rz);
    this.head.rotation.set(P.hx, P.hy, 0);
    // popcorn bucket stays upright-ish while held
    this.popcorn.rotation.set(-P.alx - P.rx0, 0, -P.alz);
    // blink
    this.blink -= dt; const bl = this.blink < 0.12 ? 0.15 : 1; if (this.blink < 0) this.blink = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = 1.2 * bl;
    // light stick glow pulse
    if (this.stick.visible) { const h = this.stick.userData.head; h.material.color.copy(this.stick.userData.base).multiplyScalar(2.6 + (A === ANIM.cheer ? 1.6 + Math.sin(t * 22) * 0.6 : 0.4 * Math.sin(t * 3))); }
    // bubble
    if (this.bubble) { this.bubbleT -= dt; this.bubble.material.opacity = Math.min(1, this.bubbleT * 2); if (this.bubbleT <= 0) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); this.bubble = null; } }
    this.shadow.visible = A !== ANIM.sit;
  }

  dispose() {
    this.root.traverse((o) => { if (o.material && o.material !== mats.skin && !Object.values(mats).includes(o.material)) { if (o.material.map && o.isSprite) o.material.map.dispose(); } });
  }
}
