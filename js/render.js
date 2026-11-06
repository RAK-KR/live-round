// Three.js 3D 장면 — 저해상도 렌더 + 디더링/그레인 후처리 (PS1 풍)
import * as T from './lib/three.module.min.js';
import { sfx } from './audio.js';
const wait = ms => new Promise(r => setTimeout(r, ms)), ease = k => k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;

const mul = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const PSL = [[-.52, .2], [-.3, .2], [-.52, .4], [-.3, .4], [.3, .2], [.52, .2], [.3, .4], [.52, .4]];
const OSL = PSL.map(([x, z]) => [-x, -z]);
// 얼굴: 눈구멍 [x, y, 반경, 깊이], 입 형태
const FACES = {
  plain: { eyes: [[-.36, .2, .24, .32], [.36, .2, .24, .32]], mouth: 'slit' },
  stitch: { eyes: [[-.36, .2, .21, .28], [.37, .19, .27, .36]], mouth: 'stitch' },
  smile: { eyes: [[-.34, .22, .2, .3], [.34, .22, .2, .3]], mouth: 'grin' },
  cyclops: { eyes: [[0, .16, .36, .46]], mouth: 'none' },
  host: { eyes: [[-.35, .18, .22, .34], [.35, .18, .22, .34], [0, .56, .11, .2]], mouth: 'grin' },
};
const mouthY = (x, m) => m === 'grin' ? -.47 + .32 * x * x : -.56;
function jaw(p) { if (p.y < -.15) { const k = -.15 - p.y; p.y -= k * .6; p.x *= 1 - k * .5; p.z *= 1 - k * .1; } return p; }
function faceGeo(F) {
  const geo = new T.SphereGeometry(1, 56, 44), P = geo.attributes.position, col = new Float32Array(P.count * 3), n = new T.Vector3();
  for (let i = 0; i < P.count; i++) {
    n.fromBufferAttribute(P, i); let d = 0, dk = 0;
    if (n.z > 0) {
      for (const [sx, sy, r, dep] of F.eyes) { const q = Math.hypot(n.x - sx, n.y - sy); if (q < r) { const f = 1 - (q / r) ** 2; d -= dep * f; dk = Math.max(dk, Math.min(1, f * 1.7)); } }
      for (const sx of [-.5, .5]) { let q = Math.hypot(n.x - sx, n.y + .3); if (q < .3) d -= .11 * (1 - (q / .3) ** 2); q = Math.hypot(n.x - sx * .9, n.y + .02); if (q < .15) d += .05 * (1 - (q / .15) ** 2); }
      const q = Math.hypot(n.x * 1.6, n.y + .14); if (q < .12) { const f = 1 - (q / .12) ** 2; d -= .13 * f; dk = Math.max(dk, f * .9); }
      if (F.mouth !== 'none') {
        const w = F.mouth === 'grin' ? .62 : .3, h = F.mouth === 'grin' ? .07 : .03, qy = Math.abs(n.y - mouthY(n.x, F.mouth));
        if (Math.abs(n.x) < w && qy < h) { const f = (1 - qy / h) * (1 - (Math.abs(n.x) / w) ** 4); d -= .12 * f; dk = Math.max(dk, f * .95); }
      }
      const b = Math.hypot(n.x * .8, n.y - .38); if (b < .3) d += .035 * (1 - b / .3);
    }
    const p = jaw(n.clone().multiplyScalar(1 + d)); P.setXYZ(i, p.x, p.y, p.z);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 1 - dk;
  }
  geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.computeVertexNormals(); return geo;
}
const front = (x, y) => V(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)));
const uvPx = (x, y, w, h) => { const n = front(x, y); let u = Math.atan2(n.z, -n.x) / (Math.PI * 2); if (u < 0) u += 1; return [u * w, Math.acos(n.y) / Math.PI * h]; };
const V = (x, y, z) => new T.Vector3(x, y, z), UP = V(0, 1, 0);
const std = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: .88, metalness: 0, ...o });
const mesh = (geo, mat, x = 0, y = 0, z = 0, sh = true) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = sh; return m; };

function ctex(w, h, seed, fn, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); fn(g, w, h, mul(seed));
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.magFilter = T.NearestFilter;
  if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); }
  t.g = g; return t;
}
function grain(g, w, h, amt, r) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
}
const blob = (g, x, y, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };

// ── 텍스처 ──
const TEX = {};
function makeTextures() {
  TEX.felt = ctex(256, 256, 3, (g, w, h, r) => {
    g.fillStyle = '#1d3a22'; g.fillRect(0, 0, w, h); grain(g, w, h, 30, r);
    for (let i = 0; i < 14; i++) blob(g, r() * w, r() * h, 8 + r() * 30, 5 + r() * 18, 'rgba(0,0,0,.28)');
    for (let i = 0; i < 9; i++) { const x = r() * w, y = r() * h; blob(g, x, y, 6 + r() * 16, 4 + r() * 10, 'rgba(70,6,4,.5)'); for (let k = 0; k < 6; k++) blob(g, x + (r() - .5) * 40, y + (r() - .5) * 40, 1 + r() * 3, 1 + r() * 3, 'rgba(80,6,4,.6)'); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(r() * w, r() * h, 9 + r() * 5, 0, 7); g.stroke(); }
    for (let i = 0; i < 6; i++) { const x = r() * w, y = r() * h; blob(g, x, y, 4, 4, 'rgba(60,35,10,.8)'); blob(g, x, y, 2.4, 2.4, '#050403'); }
    g.strokeStyle = 'rgba(200,190,160,.07)'; g.lineWidth = 1; for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 50, y + (r() - .5) * 12); g.stroke(); }
  });
  TEX.wood = ctex(128, 128, 4, (g, w, h, r) => {
    g.fillStyle = '#2a170d'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${r() * .3})`; g.fillRect(0, y, w, 1 + r() * 2); }
    grain(g, w, h, 20, r);
  });
  TEX.wall = ctex(256, 256, 5, (g, w, h, r) => {
    g.fillStyle = '#2b2620'; g.fillRect(0, 0, w, h); grain(g, w, h, 40, r);
    for (let i = 0; i < 30; i++) blob(g, r() * w, r() * h, 10 + r() * 40, 8 + r() * 30, `rgba(0,0,0,${r() * .3})`);
    for (let i = 0; i < 22; i++) { const x = r() * w, y = r() * h * .5, l = 40 + r() * 160; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, r() < .4 ? 'rgba(80,8,4,.6)' : 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y, 1 + r() * 3, l); }
    g.strokeStyle = 'rgba(210,200,180,.45)'; g.lineWidth = 1.5; // 벽에 긁은 날짜 세기 표시
    for (let k = 0; k < 7; k++) { const x0 = 20 + (k % 4) * 52, y0 = 40 + Math.floor(k / 4) * 70 + r() * 10; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x0 + i * 7, y0); g.lineTo(x0 + i * 7 + r() * 2, y0 + 26); g.stroke(); } g.beginPath(); g.moveTo(x0 - 4, y0 + 20); g.lineTo(x0 + 26, y0 + 4); g.stroke(); }
  }, 2);
  TEX.floor = ctex(128, 128, 6, (g, w, h, r) => { g.fillStyle = '#1a1714'; g.fillRect(0, 0, w, h); grain(g, w, h, 30, r); for (let i = 0; i < 10; i++) blob(g, r() * w, r() * h, 6 + r() * 20, 4 + r() * 14, 'rgba(50,4,2,.45)'); }, 4);
  TEX.glow = ctex(64, 64, 1, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  TEX.glow.magFilter = T.LinearFilter;
}

// ── 아이템 3D ──
let MAT;
function itemMesh(k) {
  const g = new T.Group(), M = MAT, add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = mesh(geo, m, x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const cyl = (a, b, h, s = 10) => new T.CylinderGeometry(a, b, h, s), box = (a, b, c) => new T.BoxGeometry(a, b, c);
  switch (k) {
    case 'magnifier': add(new T.TorusGeometry(.034, .006, 6, 18), M.metal, 0, .008, -.02, Math.PI / 2); add(new T.CircleGeometry(.03, 16), M.lens, 0, .008, -.02, -Math.PI / 2); add(cyl(.008, .009, .07), M.wood, 0, .009, .045, Math.PI / 2); break;
    case 'cuffs': add(new T.TorusGeometry(.026, .006, 6, 16), M.metal, -.03, .006, 0, Math.PI / 2); add(new T.TorusGeometry(.026, .006, 6, 16), M.metal, .03, .006, 0, Math.PI / 2); add(cyl(.003, .003, .03), M.metal, 0, .006, 0, 0, 0, Math.PI / 2); break;
    case 'saw': add(box(.15, .004, .04), M.metal, -.02, .004, 0); add(box(.05, .022, .05), M.wood, .07, .011, 0); break;
    case 'beer': add(cyl(.022, .022, .08), M.glass, 0, .04, 0); add(cyl(.009, .018, .045), M.glass, 0, .1, 0); add(cyl(.0225, .0225, .03), M.paper, 0, .04, 0); add(cyl(.01, .01, .008), M.metal, 0, .126, 0); break;
    case 'cigs': add(box(.05, .075, .022), M.paper, 0, .0375, 0); add(box(.051, .025, .023), M.red, 0, .062, 0); add(cyl(.004, .004, .03), M.paper, -.01, .085, 0); add(cyl(.004, .004, .02), M.paper, .008, .08, 0); break;
    case 'adrenaline': add(cyl(.012, .012, .09), M.clear, 0, .013, 0, Math.PI / 2); add(cyl(.009, .009, .06), M.blood, 0, .013, .01, Math.PI / 2); add(cyl(.0015, .0015, .05), M.metal, 0, .013, .07, Math.PI / 2); add(box(.03, .03, .004), M.metal, 0, .013, -.05); break;
    case 'phone': add(box(.045, .014, .095), M.dark, 0, .007, 0); add(box(.034, .002, .03), M.screen, 0, .015, -.022); add(box(.004, .004, .03), M.dark, .015, .01, -.06); break;
    case 'inverter': add(box(.075, .032, .055), M.dark, 0, .016, 0); add(box(.012, .012, .012), M.red, -.02, .036, 0); add(box(.012, .012, .012), M.green, .02, .036, 0); break;
    case 'meds': add(cyl(.02, .02, .055), M.amber, 0, .0275, 0); add(cyl(.022, .022, .016), M.white, 0, .063, 0); add(cyl(.0205, .0205, .02), M.paper, 0, .025, 0); break;
  }
  return g;
}

export class Scene {
  constructor(cv) {
    this.cv = cv; this.t = 0; this.v = null; this.sel = -1; this.steal = false; this.dis = null; this.shells = null; this.float = null;
    this.blink = 0; this.flk = 1; this.tw = []; this.look = 0; this.crack = 0; this._crack = -1; this._ik = ''; this.twitch = 0;
    this.r = new T.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = T.PCFShadowMap; this.r.setPixelRatio(1);
    makeTextures();
    MAT = {
      metal: std('#77736c', { metalness: .7, roughness: .45 }), dark: std('#18181a', { roughness: .6 }), wood: std('#ffffff', { map: TEX.wood }),
      glass: std('#2a4a18', { roughness: .15, metalness: .1 }), paper: std('#cfc7b5'), red: std('#6e130e'), green: std('#1f6a2a'),
      clear: std('#9fb5bf', { transparent: true, opacity: .45, roughness: .1 }), blood: std('#8a0b06', { roughness: .3 }), amber: std('#7a3410', { roughness: .3 }),
      white: std('#d8d6d0'), screen: new T.MeshBasicMaterial({ color: '#3d7a4c' }), lens: std('#a8c4cc', { transparent: true, opacity: .3, roughness: .05 }),
      cloth: std('#0d0b0a', { roughness: 1 }), skin: std('#7f7566', { roughness: .8 }), wax: std('#d8cfba', { roughness: .6, emissive: '#5a3c18' }),
    };
    const S = this.S = new T.Scene(); S.fog = new T.FogExp2('#000000', .26); S.background = new T.Color('#020101');
    this.cam = new T.PerspectiveCamera(60, 1, .02, 30); S.add(this.cam);
    this.buildRoom(); this.buildOpp(); this.buildGun(); this.buildTableStuff(); this.buildPost();
    this.reset(); this.setOpp({ name: 'x', mask: 'host', mc: '#c9ae74', ec: '#ff1414' });
    this.ray = new T.Raycaster();
    this.resize(); addEventListener('resize', () => this.resize());
    const loop = ts => { this.frame(ts / 1000); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  }
  reset() {
    this.fx = { shake: 0, flash: 0, red: 0, black: 0, blackT: 0, hit: 0, dead: 0, deadT: 0 };
    this.gun = { pose: 0, by: 0, k: 0, kt: 0, recoil: 0, hide: false };
    this.crack = 0; this.look = 0; this.shells = null; this.float = null; this.sel = -1; this.steal = false;
  }
  buildRoom() {
    const S = this.S;
    const floor = mesh(new T.PlaneGeometry(12, 12), std('#fff', { map: TEX.floor }), 0, -.8, 0); floor.rotation.x = -Math.PI / 2; S.add(floor);
    const wm = std('#fff', { map: TEX.wall });
    const back = mesh(new T.PlaneGeometry(8, 4), wm, 0, 1.2, -2.6); S.add(back);
    [-1, 1].forEach(s => { const w = mesh(new T.PlaneGeometry(8, 4), wm, s * 2.5, 1.2, 0); w.rotation.y = -s * Math.PI / 2; S.add(w); });
    const rust = std('#3a2418', { metalness: .6, roughness: .7 });
    this.chains = [-1, 1].map(s => { const c = new T.Group(); c.position.set(s * 1.35, 2.7, -1.45); for (let i = 0; i < 16; i++) { const l = mesh(new T.TorusGeometry(.03, .008, 4, 8), rust, 0, -i * .05, 0); l.rotation.y = i % 2 * Math.PI / 2; c.add(l); } const hk = mesh(new T.TorusGeometry(.06, .01, 4, 10, Math.PI * 1.4), rust, .03, -.85, 0); c.add(hk); S.add(c); return c; });
    [[-1.75, -.52, -1.9, .55], [-1.72, .02, -1.92, .5], [-1.2, -.6, -2.2, .4], [1.8, -.55, -1.7, .5]].forEach(([x, y, z, k]) => { const b = mesh(new T.BoxGeometry(k, k, k), MAT.wood, x, y, z); b.rotation.y = x * .7; S.add(b); });
    [[0, 2.25, -2.5, 4.8, 0], [1.95, .8, -2.5, 3, 1]].forEach(([x, y, z, l, v]) => { const pp = mesh(new T.CylinderGeometry(.04, .04, l, 8), rust, x, y, z); if (!v) pp.rotation.z = Math.PI / 2; S.add(pp); });
    const chair = new T.Group(); chair.position.set(1.55, -.3, -.4); chair.rotation.set(0, -.9, 1.35); chair.add(mesh(new T.BoxGeometry(.45, .04, .45), MAT.wood), mesh(new T.BoxGeometry(.45, .5, .04), MAT.wood, 0, .27, -.21)); S.add(chair);
    const red = new T.PointLight('#ff1a0a', 1.6, 2.6, 1.3); red.position.set(1.9, 1.4, -2.2); S.add(red); this.redL = red;
    const sick = new T.PointLight('#7aa070', .7, 2.2, 1.4); sick.position.set(-1.9, .9, -1.6); S.add(sick); this.sickL = sick;
    const ceil = mesh(new T.PlaneGeometry(8, 8), std('#0a0908'), 0, 2.7, 0); ceil.rotation.x = Math.PI / 2; S.add(ceil);
    S.add(mesh(new T.BoxGeometry(.7, 1.6, .05), std('#050404'), -1.6, 0, -2.97)); // 어두운 문틈
    // 테이블
    const top = mesh(new T.BoxGeometry(1.9, .06, 1.7), [MAT.wood, MAT.wood, std('#fff', { map: TEX.felt }), MAT.wood, MAT.wood, MAT.wood], 0, -.03, 0); S.add(top);
    [[0, .86, 1.94, .06], [0, -.86, 1.94, .06]].forEach(([x, z, w, d]) => S.add(mesh(new T.BoxGeometry(w, .035, d), MAT.wood, x, .005, z)));
    [-.96, .96].forEach(x => S.add(mesh(new T.BoxGeometry(.06, .035, 1.7), MAT.wood, x, .005, 0)));
    S.add(mesh(new T.BoxGeometry(1.7, .75, 1.5), std('#0b0806'), 0, -.43, 0));
    // 전구
    this.lamp = new T.Group(); this.lamp.position.set(0, 2.7, 0); S.add(this.lamp);
    this.lamp.add(mesh(new T.CylinderGeometry(.004, .004, .95, 4), MAT.dark, 0, -.47, 0, false));
    const shade = mesh(new T.ConeGeometry(.2, .14, 14, 1, true), std('#1c1a17', { side: T.DoubleSide, metalness: .5, roughness: .5 }), 0, -1, 0, false); this.lamp.add(shade);
    this.bulb = mesh(new T.SphereGeometry(.035, 10, 8), new T.MeshBasicMaterial({ color: '#ffd9a0' }), 0, -1.06, 0, false); this.lamp.add(this.bulb);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#ffb070', blending: T.AdditiveBlending, depthWrite: false, opacity: .5 })); halo.scale.set(.5, .5, 1); this.bulb.add(halo);
    this.spot = new T.SpotLight('#ffe2bd', 22, 7, 1.0, .45, 1.2); this.spot.castShadow = true; this.spot.shadow.mapSize.set(1024, 1024); this.spot.shadow.bias = -.0005;
    this.spot.target.position.set(0, 0, -.3); S.add(this.spot, this.spot.target);
    this.fill = new T.PointLight('#ff9a50', .5, 4, 1.4); S.add(this.fill);
    this.rim = new T.PointLight('#a00c06', 2.2, 3.5, 1.2); this.rim.position.set(0, 1.5, -2.1); S.add(this.rim);
    S.add(new T.HemisphereLight('#1a1416', '#000000', .12));
  }
  buildOpp() {
    const o = this.oppG = new T.Group(); o.position.set(0, 0, -1.2); this.S.add(o);
    const body = this.body = new T.Group(); o.add(body);
    const torso = mesh(new T.CylinderGeometry(.15, .3, 1.0, 10), MAT.cloth, 0, .4, 0); torso.rotation.x = .25; body.add(torso);
    const sh = mesh(new T.SphereGeometry(.3, 12, 8), MAT.cloth, 0, .84, .1); sh.scale.set(1.55, .42, .8); body.add(sh);
    body.add(mesh(new T.CylinderGeometry(.035, .05, .26, 6), MAT.skin, 0, .98, .2)).rotation.x = .5;
    const head = this.head = new T.Group(); head.position.set(0, 1.12, .3); body.add(head);
    const hood = mesh(new T.SphereGeometry(.27, 20, 16, Math.PI / 2 + .95, Math.PI * 2 - 1.9), std('#0b0908', { roughness: 1, side: T.DoubleSide }), 0, .02, -.02);
    hood.scale.set(1.12, 1.3, 1.05); head.add(hood);
    this.maskTex = ctex(512, 256, 1, () => { });
    this.faceMat = std('#fff', { map: this.maskTex, vertexColors: true, roughness: .5 });
    this.face = mesh(new T.SphereGeometry(1, 8, 6), this.faceMat, 0, -.02, .03); this.face.scale.set(.175, .2, .16); head.add(this.face);
    this.feats = new T.Group(); this.face.add(this.feats);
    this.crown = new T.Group(); for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, c = mesh(new T.ConeGeometry(.016, .08 + (i % 2) * .06, 5), std('#6b5426', { metalness: .6, roughness: .4 }), Math.cos(a) * .17, .3, Math.sin(a) * .15 - .03); this.crown.add(c); } head.add(this.crown);
    const nail = std('#1a120c', { roughness: .4 });
    this.arms = [-1, 1].map(s => {
      const up = mesh(new T.CylinderGeometry(1, 1, 1, 6), MAT.cloth), fo = mesh(new T.CylinderGeometry(1, .7, 1, 6), MAT.cloth), el = mesh(new T.SphereGeometry(.036, 6, 5), MAT.cloth);
      const hand = new T.Group(); hand.add(mesh(new T.BoxGeometry(.06, .018, .075), MAT.skin, 0, .01, 0));
      const fingers = [0, 1, 2, 3].map(i => {
        const f = new T.Group(); f.position.set(-.024 + i * .016, .01, .035);
        const a = mesh(new T.CylinderGeometry(.006, .005, .085, 5), MAT.skin, 0, 0, .042); a.rotation.x = Math.PI / 2; f.add(a);
        const j = new T.Group(); j.position.z = .085; f.add(j);
        const b = mesh(new T.CylinderGeometry(.005, .003, .07, 5), MAT.skin, 0, 0, .035); b.rotation.x = Math.PI / 2; j.add(b);
        j.add(mesh(new T.ConeGeometry(.004, .02, 4), nail, 0, 0, .075)).rotation.x = Math.PI / 2;
        hand.add(f); f.j = j; return f;
      });
      body.add(up, fo, el, hand); return { s, up, fo, el, hand, fingers, w: V(s * .3, .03, .46) };
    });
    this.cuffO = new T.Group(); [-1, 1].forEach(s => { const c = mesh(new T.TorusGeometry(.035, .007, 6, 14), MAT.metal, s * .3, .04, .4); c.rotation.x = Math.PI / 2; this.cuffO.add(c); });
    this.cuffO.add(mesh(new T.BoxGeometry(.52, .006, .006), MAT.metal, 0, .035, .4)); body.add(this.cuffO);
  }
  setSeg(m, a, b, r) { const d = b.clone().sub(a); m.position.copy(a).add(b).multiplyScalar(.5); m.scale.set(r, d.length(), r); m.quaternion.setFromUnitVectors(UP, d.normalize()); }
  buildGun() {
    const g = this.gunG = new T.Group(); this.S.add(g);
    const stock = mesh(new T.BoxGeometry(.034, .07, .26), MAT.wood, 0, -.012, -.2); stock.rotation.x = -.12; g.add(stock);
    g.add(mesh(new T.BoxGeometry(.04, .06, .15), std('#1d1d1f', { metalness: .6, roughness: .5 }), 0, 0, -.01));
    this.barrel = mesh(new T.CylinderGeometry(.015, .015, 1, 12), std('#1e1e22', { metalness: .85, roughness: .5 })); this.barrel.rotation.x = Math.PI / 2; g.add(this.barrel);
    this.tube = mesh(new T.CylinderGeometry(.01, .01, 1, 8), std('#232326', { metalness: .6, roughness: .5 })); this.tube.rotation.x = Math.PI / 2; g.add(this.tube);
    this.pump = mesh(new T.CylinderGeometry(.019, .019, .13, 10), MAT.wood, 0, -.024, .19); this.pump.rotation.x = Math.PI / 2; g.add(this.pump);
    const tg = mesh(new T.TorusGeometry(.018, .003, 4, 10, Math.PI), MAT.dark, 0, -.03, -.03); tg.rotation.set(0, Math.PI / 2, Math.PI); g.add(tg);
    this.muzzle = new T.Object3D(); g.add(this.muzzle); this.bore = mesh(new T.CircleGeometry(.0105, 12), new T.MeshBasicMaterial({ color: '#000' }), 0, 0, .001, false); this.muzzle.add(this.bore);
    this.flashL = new T.PointLight('#ffb060', 0, 4, 1.2); this.muzzle.add(this.flashL);
    this.flashS = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#ffc070', blending: T.AdditiveBlending, depthWrite: false, opacity: 0 })); this.flashS.scale.set(.4, .4, 1); this.muzzle.add(this.flashS);
    this.setSaw(false);
    this.restQ = new T.Quaternion().setFromEuler(new T.Euler(0, Math.PI / 2 - .25, Math.PI / 2)); this.dummy = new T.Object3D();
  }
  setSaw(s) {
    if (this._saw === s) return; this._saw = s; const L = s ? .26 : .5, TL = s ? .2 : .36;
    this.barrel.scale.y = L; this.barrel.position.set(0, .012, .065 + L / 2);
    this.tube.scale.y = TL; this.tube.position.set(0, -.012, .065 + TL / 2); this.muzzle.position.set(0, .012, .07 + L);
  }
  buildTableStuff() {
    const S = this.S;
    this.items = new T.Group(); S.add(this.items);
    this.ring = mesh(new T.RingGeometry(.1, .115, 24), new T.MeshBasicMaterial({ color: '#ff2a18', transparent: true }), 0, .003, 0, false); this.ring.rotation.x = -Math.PI / 2; S.add(this.ring);
    this.candles = [0, 1].map(p => {
      const grp = new T.Group(); S.add(grp); const list = [];
      for (let i = 0; i < 6; i++) {
        const h = .085 + ((i * 7) % 5) * .012, c = mesh(new T.CylinderGeometry(.019, .021, h, 10), MAT.wax, 0, h / 2, 0); grp.add(c);
        const fl = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#ffb050', blending: T.AdditiveBlending, depthWrite: false }));
        fl.position.set(0, h + .03, 0); c.parent.add(fl);
        list.push({ c, fl, h });
      }
      const L = new T.PointLight('#ff8a3a', 0, 2, 1.2); L.position.set(0, .2, p ? .1 : -.05); grp.add(L);
      grp.position.set(0, 0, p ? -.46 : .3); return { grp, list, L };
    });
    this.flyG = new T.Group(); S.add(this.flyG);
    this.boxes = [0, 1].map(p => {
      const b = new T.Group(); b.visible = false; S.add(b);
      const wd = std('#3a2414', { map: TEX.wood }), iron = std('#2a2622', { metalness: .6, roughness: .6 });
      b.add(mesh(new T.BoxGeometry(.3, .1, .18), wd, 0, -.05, 0), mesh(new T.BoxGeometry(.31, .012, .19), iron, 0, -.02, 0));
      b.lid = new T.Group(); b.lid.position.set(0, 0, p ? .09 : -.09); b.add(b.lid);
      b.lid.add(mesh(new T.BoxGeometry(.31, .02, .19), wd, 0, .01, p ? -.095 : .095));
      const inner = new T.PointLight('#ffcf9a', 0, .6, 1.5); inner.position.set(0, .05, 0); b.add(inner); b.inner = inner;
      return b;
    });
    this.shellG = new T.Group(); this.shellG.visible = false; S.add(this.shellG);
    this.shellM = [...Array(8)].map(() => {
      const g = new T.Group(); const body = mesh(new T.CylinderGeometry(.013, .013, .055, 10), std('#8a1810', { roughness: .5 }), 0, .04, 0);
      g.add(body, mesh(new T.CylinderGeometry(.0135, .0135, .016, 10), std('#a8832e', { metalness: .8, roughness: .3 }), 0, .008, 0)); g.body = body; this.shellG.add(g); return g;
    });
    this.floatG = new T.Group(); this.floatG.position.set(0, -.04, -.42); this.cam.add(this.floatG);
    this.floatL = new T.PointLight('#ffd0a0', 1.5, .6, 1); this.floatL.position.set(.05, .1, .1); this.floatG.add(this.floatL);
    this.cuffP = new T.Group(); [-1, 1].forEach(s => { const c = mesh(new T.TorusGeometry(.045, .008, 6, 16), MAT.metal, s * .07, 0, 0, false); this.cuffP.add(c); });
    this.cuffP.add(mesh(new T.BoxGeometry(.1, .006, .006), MAT.metal, 0, -.02, 0, false)); this.cuffP.position.set(0, -.2, -.45); this.cam.add(this.cuffP);
    this.camL = new T.PointLight('#ffd0a8', .35, 1.2, 2); this.cam.add(this.camL);
    [-1, 1].forEach(s => { const l = new T.PointLight('#ffe6c8', 1.4, .75, 1.3); l.position.set(s * .41, .32, .32); S.add(l); const o = new T.PointLight('#ffd8b0', .8, .7, 1.3); o.position.set(s * .41, .3, -.28); S.add(o); });
  }
  buildPost() {
    this.rt = new T.WebGLRenderTarget(4, 4, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
    this.pu = { tD: { value: this.rt.texture }, res: { value: new T.Vector2(1, 1) }, time: { value: 0 }, red: { value: 0 }, flash: { value: 0 }, black: { value: 0 } };
    const m = new T.ShaderMaterial({
      uniforms: this.pu, depthTest: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `uniform sampler2D tD;uniform vec2 res;uniform float time,red,flash,black;varying vec2 vUv;
float b2(vec2 a){a=floor(a);return fract(dot(a,vec2(.5,a.y*.75)));}
float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
void main(){vec2 d=vUv-.5;float ca=.0025+red*.006;
vec3 c=vec3(texture2D(tD,vUv+d*ca).r,texture2D(tD,vUv).g,texture2D(tD,vUv-d*ca).b);
c=pow(c,vec3(1./2.2));c=clamp(c,0.,1.);c=c*c*(3.-2.*c);
c*=smoothstep(.95,.2,length(d*vec2(1.,1.1))*1.25);
float n=fract(sin(dot(vUv*res+fract(time)*91.,vec2(12.9898,78.233)))*43758.5453);c+=(n-.5)*.055;
c=mix(c,c*vec3(1.6,.15,.1)+vec3(.12,0.,0.),red*.6);c+=flash*vec3(1.,.92,.8);
float L=20.;c=floor(c*L+b4(gl_FragCoord.xy)-.25)/L;c*=1.-black;
gl_FragColor=vec4(clamp(c,0.,1.),1.);}`,
    });
    this.pS = new T.Scene(); this.pC = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.pS.add(new T.Mesh(new T.PlaneGeometry(2, 2), m));
  }
  resize() {
    const w = innerWidth, h = innerHeight, px = Math.max(2, Math.round(h / 300));
    this.lw = Math.ceil(w / px); this.lh = Math.ceil(h / px);
    this.r.setSize(this.lw, this.lh, false); this.rt.setSize(this.lw, this.lh); this.pu.res.value.set(this.lw, this.lh);
    const a = this.cam.aspect = w / h;
    if (a >= 1.2) { this.cam.fov = 56; this.camBase = V(0, 1.16, 1.62); this.camTgt = V(0, .4, -.3); }
    else {
      this.cam.fov = 72; const tv = Math.tan(this.cam.fov * Math.PI / 360), dist = Math.max(1.9, .78 / (tv * a));
      this.camTgt = V(0, .4, -.28); this.camBase = this.camTgt.clone().addScaledVector(V(0, .6, .8).normalize(), dist);
    }
    this.cam.updateProjectionMatrix();
  }
  setOpp(s) {
    this.opp = { ...s, seed: [...s.name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) };
    const F = this.F = FACES[s.mask] || FACES.plain, r = mul(this.opp.seed);
    this._crack = -1; this.crown.visible = s.mask === 'host';
    this.face.geometry.dispose(); this.face.geometry = faceGeo(F);
    this.feats.clear(); this.pupils = [];
    F.eyes.forEach(([x, y, , dep]) => {
      const p = jaw(front(x, y).multiplyScalar(1 - dep * .8));
      const pu = mesh(new T.SphereGeometry(.028, 6, 6), new T.MeshBasicMaterial({ color: s.ec }), p.x, p.y, p.z, false);
      const gl = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: s.ec, blending: T.AdditiveBlending, depthWrite: false })); gl.scale.set(.35, .35, 1); pu.add(gl);
      this.feats.add(pu); this.pupils.push(pu);
    });
    const bone = std('#c2b48e', { roughness: .45 }), thread = std('#1a0d07');
    if (F.mouth === 'grin') for (let k = 0; k < 22; k++) {
      if (r() < .15) continue; const x = -.56 + k * (1.12 / 21), y = mouthY(x, 'grin'), top = k % 2;
      const p = jaw(front(x, y + (top ? .03 : -.03)).multiplyScalar(.93));
      const t = mesh(new T.BoxGeometry(.04, .07 + r() * .03, .03), bone, p.x, p.y, p.z, false); t.rotation.z = (r() - .5) * .4; this.feats.add(t);
    }
    if (F.mouth === 'stitch') for (let x = -.24; x <= .25; x += .08) [-1, 1].forEach(sg => {
      const p = jaw(front(x, -.56).multiplyScalar(1.0)); const t = mesh(new T.BoxGeometry(.018, .16, .02), thread, p.x, p.y, p.z, false); t.rotation.z = sg * .6; this.feats.add(t);
    });
  }
  paintMask() {
    const o = this.opp, g = this.maskTex.g, w = 512, h = 256, r = mul(o.seed), rc = mul(o.seed + 99);
    g.fillStyle = o.mc; g.fillRect(0, 0, w, h); grain(g, w, h, 40, r);
    for (let i = 0; i < 60; i++) blob(g, r() * w, r() * h, 4 + r() * 20, 3 + r() * 12, `rgba(${30 + r() * 30},20,12,${.08 + r() * .12})`);
    const [cx] = uvPx(0, 0, w, h);
    const sg = g.createLinearGradient(cx - 90, 0, cx + 90, 0); sg.addColorStop(0, 'rgba(0,0,0,.6)'); sg.addColorStop(.25, 'rgba(0,0,0,0)'); sg.addColorStop(.75, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
    this.F.eyes.forEach(([x, y, rad]) => {
      if (!o.weep && this.crack === 0) return;
      const [px, py] = uvPx(x, y - rad * .7, w, h);
      g.fillStyle = 'rgba(75,3,1,.9)'; g.fillRect(px - 2, py, 4, 40 + r() * 40); g.fillRect(px + 3 + (r() - .5) * 4, py + 6, 2, 60 + r() * 30);
    });
    if (o.mask === 'host') { g.strokeStyle = 'rgba(190,150,60,.8)'; g.lineWidth = 2; g.beginPath(); const [a, b] = uvPx(0, .9, w, h), [c, d] = uvPx(0, .4, w, h); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
    const nc = Math.min(20, 4 + this.crack * 3);
    for (let i = 0; i < nc; i++) {
      let [x, y] = uvPx((rc() - .5) * 1.4, (rc() - .45) * 1.5, w, h), a = rc() * 7; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { a += (rc() - .5) * 1.5; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
      g.strokeStyle = 'rgba(12,6,3,.9)'; g.lineWidth = 1.4; g.stroke();
    }
    for (let i = 0; i < this.crack * 18; i++) { const [x, y] = uvPx((rc() - .5) * 1.3, (rc() - .5) * 1.4, w, h); blob(g, x, y, 1 + rc() * 4, 1 + rc() * 4, 'rgba(105,5,2,.9)'); }
    this.maskTex.needsUpdate = true; this._crack = this.crack;
  }
  pick(cx, cy) {
    if (!this.v) return null;
    this.ray.setFromCamera(new T.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), this.cam);
    let best = null, bd = .1;
    this.items.children.forEach(it => { const p = it.position.clone(); const d = this.ray.ray.distanceToPoint(p); if (d < bd) { bd = d; best = it.userData; } });
    return best;
  }
  update(dt) {
    const f = this.fx, g = this.gun, ap = (v, t, r) => v < t ? Math.min(t, v + r * dt) : Math.max(t, v - r * dt);
    g.k = ap(g.k, g.kt, 2.6); f.black = ap(f.black, f.blackT, 2.2); f.dead = ap(f.dead, f.deadT, 1.1);
    f.flash = Math.max(0, f.flash - dt * 5); f.shake = Math.max(0, f.shake - dt * 2.5); f.hit = Math.max(0, f.hit - dt * 2.2);
    f.red = Math.max(0, f.red - dt * .8); g.recoil = Math.max(0, g.recoil - dt * 5);
    if (this.lampOff) this.flk = .02; else if (this.blink > 0) { this.blink -= dt; this.flk = Math.random() < .5 ? .15 : .7; }
    else { this.flk = .93 + .07 * Math.sin(this.t * 17) * Math.sin(this.t * 5.3); if (Math.random() < dt * .22) this.blink = .06 + Math.random() * .3; }
    if (this.float && (this.float.t += dt) > 1.3) this.float = null;
    this.tw = this.tw.filter(w => { w.t += dt; const k = Math.min(1, w.t / w.d); w.fn(k); if (k >= 1) w.res(); return k < 1; });
    this.twitch = Math.max(0, this.twitch - dt * 6); if (Math.random() < dt * .18) this.twitch = 1, this.twDir = Math.random() < .5 ? -1 : 1;
  }
  frame(now) {
    const dt = Math.min(.05, now - (this.last || now)); this.last = now; this.t += dt; this.update(dt);
    const t = this.t, f = this.fx, v = this.v;
    if (this._crack !== this.crack) this.paintMask();
    // 카메라
    const sh = f.shake * .03;
    this.cam.position.copy(this.camBase).add(V(Math.sin(t * .5) * .012 + (Math.random() - .5) * sh, Math.sin(t * .7) * .008 + (Math.random() - .5) * sh, 0));
    this.cam.lookAt(this.camTgt);
    // 전구
    this.lamp.rotation.z = Math.sin(t * .6) * .1; this.lamp.rotation.x = Math.sin(t * .43) * .05;
    const bp = this.bulb.getWorldPosition(V(0, 0, 0)); this.spot.position.copy(bp); this.fill.position.copy(bp);
    this.spot.intensity = 22 * this.flk; this.fill.intensity = .5 * this.flk; this.bulb.material.color.setScalar(.35 + .65 * this.flk).multiply(new T.Color('#ffd9a0'));
    this.rim.intensity = 2.2 + Math.sin(t * 1.3) * .4; this.redL.intensity = Math.random() < .02 ? .2 : 1.6; this.chains.forEach((c, i) => c.rotation.z = Math.sin(t * .4 + i * 2) * .04);
    this.animOpp(dt);
    // 총
    this.setSaw(!!(v && v.sawed)); this.gunG.visible = !this.gun.hide; this.poseGun();
    this.flashL.intensity = f.flash * 25; this.flashS.material.opacity = f.flash;
    // 촛불, 아이템, 탄
    this.candles.forEach((cd, p) => {
      const n = v ? v.max : 0, hp = v ? v.hp[p] : 0, sp = p ? .07 : .075, blue = v && v.sudden[p]; let lit = 0;
      cd.list.forEach((o, i) => {
        o.c.visible = i < n; o.c.position.x = (i - (n - 1) / 2) * sp; o.fl.position.x = o.c.position.x;
        const on = i < hp; o.fl.visible = o.c.visible && on; if (on) lit++;
        const fl = 1 + Math.sin(t * 13 + i * 2.1) * .12 + (Math.random() - .5) * .1; o.fl.scale.set(.06 * fl, .1 * fl, 1);
        o.fl.material.color.set(blue ? '#5f9bff' : '#ffb050'); o.c.material = MAT.wax;
      });
      cd.L.intensity = lit * .7 * this.flk; cd.L.color.set(blue ? '#4a7aff' : '#ff8a3a');
    });
    this.syncItems();
    this.floatG.visible = !!this.float;
    if (this.float) {
      const fl = this.float; if (this.floatG.userData.k !== fl.k + fl.p) { this.floatG.children.filter(c => c !== this.floatL).forEach(c => this.floatG.remove(c)); const m = itemMesh(fl.k); m.scale.setScalar(1.6); this.floatG.add(m); this.floatG.userData.k = fl.k + fl.p; }
      this.floatG.rotation.y = fl.t * 2; this.floatG.position.y = -.06 + fl.t * .03; this.floatG.scale.setScalar(Math.min(1, fl.t * 5) * Math.min(1, (1.3 - fl.t) * 4) + .001);
    } else this.floatG.userData.k = '';
    this.cuffO.visible = !!(v && v.cuffed[1] === 2 && f.dead < .5); this.cuffP.visible = !!(v && v.cuffed[0] === 2);
    // 렌더
    this.pu.time.value = t; this.pu.red.value = f.red; this.pu.flash.value = f.flash * .8; this.pu.black.value = f.black;
    this.r.setRenderTarget(this.rt); this.r.render(this.S, this.cam); this.r.setRenderTarget(null); this.r.render(this.pS, this.pC);
  }
  animOpp(dt) {
    const t = this.t, f = this.fx, d = f.dead, br = Math.sin(t * 1.1), look = this.look;
    this.lean = (this.lean || 0) + ((look ? .14 : 0) - (this.lean || 0)) * Math.min(1, dt * 2);
    this.oppG.position.y = -d * .25;
    this.body.rotation.x = br * .015 + this.lean - f.hit * .3 + d * .7; this.body.position.z = -f.hit * .1 + this.lean * .3;
    const h = this.head;
    h.rotation.x = .1 + look * .1 - f.hit * .7 + d * .6 + Math.sin(t * .29) * .04;
    h.rotation.z = Math.sin(t * .19) * .28 + this.twitch * .45 * (this.twDir || 1) + f.hit * .3 * Math.sin(t * 40);
    h.rotation.y = Math.sin(t * .23) * .1 + this.twitch * .2 * (this.twDir || 1);
    const glow = ((.75 + .25 * Math.sin(t * 2.3)) * (1 + f.red * 2)) * (1 - d);
    this.pupils.forEach(e => { e.visible = d < .9 && Math.random() > (this.blink > 0 ? .5 : .003); e.children[0].material.opacity = glow; });
    const holdK = this.gun.by === 1 ? this.gun.k : 0, grip = this.muzzle.getWorldPosition(V(0, 0, 0)).lerp(this.gunG.position, .6);
    this.arms.forEach(a => {
      const sh = V(a.s * .4, .82, .14);
      let w = a.w.clone(); w.y += Math.max(0, Math.sin(t * 2.6 + a.s)) * .004;
      if (a.s > 0 && holdK > 0) w.lerp(this.body.worldToLocal(grip.clone()), holdK);
      const el = V(a.s * (.66 - holdK * .2), .52 + holdK * .1, .2);
      this.setSeg(a.up, sh, el, .04); this.setSeg(a.fo, el, w.clone().lerp(el, .12), .032); a.el.position.copy(el);
      a.hand.position.copy(w); a.hand.rotation.set(0, -a.s * .25, 0);
      a.fingers.forEach((fg, i) => {
        const tap = a.s > 0 && i === 2 ? Math.max(0, Math.sin(t * 7)) * .5 * (Math.sin(t * .5) > .4) : 0;
        fg.rotation.x = .15 - tap + holdK * .6; fg.rotation.y = (i - 1.5) * .12 * a.s; fg.j.rotation.x = .9 + holdK * .5 + Math.sin(t * .8 + i) * .05;
      });
    });
  }
  poseGun() {
    const g = this.gun, G = this.gunG, k = g.k < .5 ? 2 * g.k * g.k : 1 - (-2 * g.k + 2) ** 2 / 2;
    const rest = V(-.08, .03, -.04); let pos = rest, q = this.restQ;
    if (g.pose === 2) { this.dummy.position.set(0, .34, .3); this.dummy.rotation.set(-.2, Math.PI / 2, .3); pos = rest.clone().lerp(this.dummy.position, k); q = this.restQ.clone().slerp(this.dummy.quaternion, k); }
    else if (g.pose && k > 0) {
      const cp = this.cam.position, cd = this.cam.getWorldDirection(V(0, 0, 0)), head = this.head.getWorldPosition(V(0, 0, 0));
      let p, tg;
      if (g.pose === 1 && g.by === 0) { p = V(.1, .48, .45); tg = head; }
      else if (g.pose === 1) { p = head.clone().add(V(.55, -.08, .2)); tg = head; }
      else if (g.by === 0) { p = cp.clone().addScaledVector(cd, .82).add(V(.02, -.06, 0)); tg = cp; }
      else { p = V(.05, .72, -.45); tg = cp; }
      this.dummy.position.copy(p); this.dummy.lookAt(tg);
      pos = rest.clone().lerp(p, k); q = this.restQ.clone().slerp(this.dummy.quaternion, k);
    }
    G.position.copy(pos); G.quaternion.copy(q);
    if (g.recoil) { G.translateZ(-g.recoil * .06); G.rotateX(-g.recoil * .25); }
  }
  tween(d, fn) { return new Promise(res => this.tw.push({ t: 0, d, fn, res })); }
  async rack() { sfx.rack(); await this.tween(.13, k => this.pump.position.z = .19 - .07 * k); await this.tween(.13, k => this.pump.position.z = .12 + .07 * k); }
  // 장전: 탄을 늘어놓고 → 불이 꺼진 사이 섞고 → 한 발씩 밀어 넣고 → 펌프
  async loadShells(live, blank) {
    const n = live + blank, M = this.shellM, xs = i => (i - (n - 1) / 2) * .085;
    this.shellG.visible = true;
    M.forEach((m, i) => { m.visible = i < n; m.scale.setScalar(1.6); m.rotation.set(0, 0, 0); m.position.set(xs(i), .4, .14); m.body.material.color.set(i < live ? '#a81c10' : '#2c4250'); });
    await this.tween(.7, k => M.forEach((m, i) => { if (i < n) { const kk = Math.min(1, Math.max(0, k * 1.8 - i * .1)); m.position.y = .4 * (1 - kk * kk); } }));
    sfx.shells(n); await wait(1200);
    this.lampOff = true; sfx.whisper(); await wait(550);
    const ord = [...Array(n).keys()].sort(() => Math.random() - .5);
    ord.forEach((o, i) => { M[o].position.x = xs(i); M[o].body.material.color.set('#2a2420'); M[o].rotation.y = Math.random() * 6; });
    this.lampOff = false; await wait(300);
    this.gun.pose = 2; this.gun.kt = 1; await wait(500);
    for (let i = 0; i < n; i++) {
      const m = M[ord[i]], from = m.position.clone(), to = this.gunG.localToWorld(V(0, -.03, .02));
      await this.tween(.19, k => { m.position.lerpVectors(from, to, ease(k)); m.position.y += Math.sin(k * Math.PI) * .1; m.rotation.x = k * 1.5; m.scale.setScalar(1.6 - k * .9); });
      m.visible = false; sfx.insert(); this.gun.recoil = .25; await wait(60);
    }
    await wait(150); await this.rack(); await wait(250);
    this.gun.kt = 0; await wait(450); this.gun.pose = 0; this.shellG.visible = false;
  }
  // 아이템: 테이블 해치에서 상자가 올라와 열리고, 하나씩 꺼내 자리에 놓는다
  async dealItems(old, neu) {
    this.dealing = true;
    await Promise.all([0, 1].map(async p => {
      const add = neu[p].slice(old[p].length); if (!add.length) return;
      const b = this.boxes[p], zc = p ? -.22 : .14, sc = p ? 1.7 : 2.1;
      b.visible = true; b.position.set(0, -.12, zc); b.lid.rotation.x = 0; b.inner.intensity = 0;
      sfx.drop(); await this.tween(.4, k => b.position.y = -.12 + .12 * ease(k));
      sfx.creak(); await this.tween(.3, k => { b.lid.rotation.x = (p ? 1 : -1) * 1.9 * ease(k); b.inner.intensity = k * 1.2; });
      for (let j = 0; j < add.length; j++) {
        const m = itemMesh(add[j]), [x, z] = (p ? OSL : PSL)[old[p].length + j], from = V(0, .03, zc), to = V(x, 0, z);
        m.scale.setScalar(sc); this.flyG.add(m); sfx.item();
        await this.tween(.45, k => { m.position.lerpVectors(from, to, ease(k)); m.position.y += Math.sin(k * Math.PI) * .2; m.rotation.y = (p ? Math.PI : 0) + (1 - k) * 5; });
        sfx.drop(); await wait(70);
      }
      await this.tween(.22, k => { b.lid.rotation.x = (p ? 1 : -1) * 1.9 * (1 - k); b.inner.intensity = 1.2 * (1 - k); });
      await this.tween(.35, k => b.position.y = -.12 * ease(k)); b.visible = false;
    }));
    this.v = { ...this.v, items: neu }; this.flyG.clear(); this.dealing = false;
  }
  syncItems() {
    const v = this.v, key = v ? JSON.stringify(v.items) : '';
    if (key !== this._ik) {
      this._ik = key; this.items.clear();
      if (v) [0, 1].forEach(p => v.items[p].forEach((k, i) => { const m = itemMesh(k), [x, z] = (p ? OSL : PSL)[i]; m.position.set(x, 0, z); m.scale.setScalar(p ? 1.7 : 2.1); m.rotation.y = p ? Math.PI : 0; m.userData = { p, i, k }; this.items.add(m); }));
    }
    let ring = null;
    this.items.children.forEach(m => {
      const { p, i } = m.userData, s = p === 0 && i === this.sel, tgt = this.steal && p === 1 && m.userData.k !== 'adrenaline';
      m.position.y = s ? .03 + Math.sin(this.t * 3) * .006 : 0; if (s) { m.rotation.y += .02; ring = m; }
      if (tgt) m.position.y = .015 + Math.max(0, Math.sin(this.t * 6)) * .02;
    });
    this.ring.visible = !!ring; if (ring) { this.ring.position.set(ring.position.x, .003, ring.position.z); this.ring.material.opacity = .6 + .4 * Math.sin(this.t * 6); }
  }
}
