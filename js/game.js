// 게임 규칙 (DOM 없음 — Node 테스트 가능). 2~4인 지원
export const ITEMS = {
  magnifier: { name: '돋보기', desc: '현재 장전된 탄이 실탄인지 공포탄인지 확인합니다.' },
  cuffs: { name: '수갑', desc: '상대에게 채워 그 상대의 다음 차례를 한 번 건너뛰게 합니다.' },
  saw: { name: '톱', desc: '총열을 잘라냅니다. 다음 한 발의 피해가 2배가 됩니다.' },
  beer: { name: '맥주', desc: '펌프를 당겨 현재 탄을 쏘지 않고 빼냅니다.' },
  cigs: { name: '담배', desc: '체력을 1 회복합니다.' },
  adrenaline: { name: '아드레날린', desc: '상대의 아이템 하나를 빼앗아 즉시 사용합니다. 아드레날린은 빼앗을 수 없습니다.' },
  phone: { name: '대포폰', desc: '남은 탄 중 무작위 한 발의 위치와 정체를 알려줍니다.' },
  inverter: { name: '인버터', desc: '현재 탄의 극성을 뒤집습니다. 실탄은 공포탄으로, 공포탄은 실탄으로.' },
  meds: { name: '상한 약', desc: '40% 확률로 체력 2 회복, 60% 확률로 체력 1 감소.' },
};
const WEIGHT = { magnifier: 3, cuffs: 2, saw: 2.2, beer: 3, cigs: 3, adrenaline: 1.4, phone: 2, inverter: 2, meds: 1.5 };
export const SLOTS = 8;

export class Game {
  // cfg: { hp, items(로드당 지급 수), sudden, multi(친구 대전 규칙), slots }
  constructor(cfg, rng = Math.random, n = 2) {
    this.cfg = cfg; this.rng = rng; this.n = n; this.multi = !!cfg.multi; this.slots = cfg.slots || SLOTS;
    this.players = Array.from({ length: n }, () => ({ hp: cfg.hp, max: cfg.hp, items: [], cuffed: 0 }));
    this.turn = 0; this.sawed = false; this.shells = []; this.known = this.players.map(() => []);
    this.events = []; this.winner = -1;
    this.load();
  }
  get over() { return this.winner >= 0; }
  snap() {
    return { hp: this.players.map(p => p.hp), items: this.players.map(p => [...p.items]), sawed: this.sawed, cuffed: this.players.map(p => p.cuffed) };
  }
  emit(e) { e.snap = this.snap(); this.events.push(e); }
  flush() { const e = this.events; this.events = []; return e; }
  sudden(i) { return !!this.cfg.sudden && this.players[i].hp <= 2; }
  alive(i) { return this.players[i].hp > 0; }
  others(by) { return this.players.map((_, i) => i).filter(i => i !== by && this.alive(i)); }
  next(i) { do i = (i + 1) % this.n; while (!this.alive(i)); return i; }
  def(by, who) { return who >= 0 ? who : this.n === 2 ? 1 - by : this.others(by)[0] ?? -1; }

  randItem() {
    const keys = Object.keys(WEIGHT), tot = keys.reduce((a, k) => a + WEIGHT[k], 0);
    let r = this.rng() * tot;
    for (const k of keys) { r -= WEIGHT[k]; if (r <= 0) return k; }
    return keys[0];
  }
  load() {
    const n = 2 + Math.floor(this.rng() * 7);
    const live = Math.max(1, Math.min(n - 1, Math.round(n * (0.3 + this.rng() * 0.4))));
    const s = Array.from({ length: n }, (_, i) => i < live);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
    this.shells = s; this.known = this.players.map(() => []); this.sawed = false;
    if (!this.multi) this.turn = 0;
    this.players.forEach((p, i) => {
      p.cuffed = 0; if (!this.alive(i)) return;
      for (let k = 0; k < (this.cfg.items || 0) && p.items.length < this.slots; k++) p.items.push(this.randItem());
    });
    this.emit({ t: 'load', live, blank: n - live });
  }
  shift() { this.shells.shift(); this.known.forEach(k => k.shift()); }
  pLive(i) {
    const k = this.known[i][0];
    if (k !== undefined) return k ? 1 : 0;
    let lu = 0, u = 0;
    this.shells.forEach((s, j) => { if (this.known[i][j] === undefined) { u++; if (s) lu++; } });
    return u ? lu / u : 0;
  }
  pass() {
    let o = this.next(this.turn);
    while (o !== this.turn) {
      const O = this.players[o];
      if (O.cuffed === 2) { O.cuffed = 1; this.emit({ t: 'skip', p: o }); o = this.next(o); continue; }
      if (O.cuffed === 1) O.cuffed = 0;
      this.turn = o; this.emit({ t: 'turn', p: o }); return;
    }
  }
  // 사망 처리 — 한 명만 남으면 게임 종료(true)
  death(p) {
    const P = this.players[p]; if (P.hp > 0) return false;
    const left = this.others(p);
    if (left.length <= 1) { this.winner = left[0] ?? p; this.emit({ t: 'end', winner: this.winner }); return true; }
    P.items = []; P.cuffed = 0; this.emit({ t: 'die', p });
    return false;
  }

  shoot(by, target) {
    if (this.over || by !== this.turn || !this.shells.length || !this.alive(target)) return false;
    const live = this.shells[0], sawed = this.sawed, dmg = live ? (sawed ? 2 : 1) : 0;
    this.shift(); this.sawed = false;
    const T = this.players[target];
    if (dmg) T.hp = Math.max(0, T.hp - dmg);
    this.emit({ t: 'shot', by, target, live, dmg, sawed });
    if (this.death(target)) return true;
    const keep = target === by && !live;
    if (this.multi) { if (!keep || !this.alive(by)) this.pass(); if (!this.shells.length) this.load(); }
    else if (!this.shells.length) this.load();
    else if (!keep) this.pass();
    return true;
  }
  canUse(by, name, who = -1) {
    const opp = who >= 0 ? [who] : this.others(by);
    switch (name) {
      case 'saw': return !this.sawed;
      case 'cuffs': return opp.some(o => o !== by && this.alive(o) && this.players[o].cuffed === 0);
      case 'adrenaline': return opp.some(o => o !== by && this.alive(o) && this.players[o].items.some(n => n !== 'adrenaline' && this.canUse(by, n)));
      case 'cigs': case 'meds': return true;
      default: return this.shells.length > 0;
    }
  }
  use(by, idx, steal = -1, who = -1) {
    if (this.over || by !== this.turn) return false;
    const P = this.players[by];
    let name = P.items[idx];
    if (!name) return false;
    if (name === 'cuffs' || name === 'adrenaline') { who = this.def(by, who); if (who < 0 || who === by || !this.alive(who)) return false; }
    if (!this.canUse(by, name, name === 'cuffs' || name === 'adrenaline' ? who : -1)) return false;
    if (name === 'adrenaline') {
      const O = this.players[who], sn = O.items[steal];
      if (!sn || sn === 'adrenaline' || !this.canUse(by, sn)) return false;
      if (sn === 'cuffs' && !this.others(by).some(o => this.players[o].cuffed === 0)) return false;
      P.items.splice(idx, 1); O.items.splice(steal, 1);
      this.emit({ t: 'item', by, item: 'adrenaline', stole: sn, who });
      name = sn;
      if (sn === 'cuffs') who = this.players[who].cuffed === 0 ? who : this.others(by).find(o => this.players[o].cuffed === 0);
    } else P.items.splice(idx, 1);
    this.apply(by, name, who);
    return true;
  }
  heal(by, n) { const P = this.players[by]; if (this.sudden(by)) return 0; const h = Math.min(n, P.max - P.hp); P.hp += h; return h; }
  apply(by, name, who) {
    const P = this.players[by], e = { t: 'item', by, item: name };
    switch (name) {
      case 'magnifier': e.live = this.shells[0]; this.known[by][0] = e.live; break;
      case 'cuffs': e.who = who; this.players[who].cuffed = 2; break;
      case 'saw': this.sawed = true; break;
      case 'beer': e.live = this.shells[0]; this.shift(); break;
      case 'cigs': e.heal = this.heal(by, 1); break;
      case 'meds':
        if (this.rng() < 0.4) e.heal = this.heal(by, 2);
        else { P.hp = Math.max(0, P.hp - 1); e.hurt = 1; }
        break;
      case 'phone':
        if (this.shells.length > 1) {
          const j = 1 + Math.floor(this.rng() * (this.shells.length - 1));
          e.pos = j; e.live = this.shells[j]; this.known[by][j] = e.live;
        }
        break;
      case 'inverter':
        this.shells[0] = !this.shells[0];
        this.known.forEach(k => { if (k[0] !== undefined) k[0] = !k[0]; });
        break;
    }
    this.emit(e);
    if (P.hp <= 0) { if (this.death(by)) return; this.pass(); if (!this.shells.length) this.load(); return; }
    if (name === 'beer' && !this.shells.length) this.load();
  }
}
