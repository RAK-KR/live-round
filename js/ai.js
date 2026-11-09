// 봇 AI — smart: 최적 판단 확률, item: 아이템 사용 의지. 2~4인 지원
export const LEVELS = {
  easy: { smart: 0.45, item: 0.5 },
  normal: { smart: 0.72, item: 0.8 },
  hard: { smart: 0.9, item: 0.95 },
  nightmare: { smart: 1, item: 1 },
};

export function decide(g, me, lv, rng = Math.random) {
  const P = g.players[me], opps = g.others(me);
  // 노릴 상대: 체력이 가장 낮은 상대
  const opp = opps.reduce((a, b) => g.players[b].hp < g.players[a].hp ? b : a, opps[0]);
  const smart = rng() < lv.smart, useItems = rng() < lv.item;
  const p = g.pLive(me);
  const own = (n, who = -1) => { const i = P.items.indexOf(n); return i >= 0 && g.canUse(me, n, who) ? { type: 'item', idx: i, who } : null; };
  const steal = n => {
    const a = P.items.indexOf('adrenaline'); if (a < 0 || n === 'adrenaline' || !g.canUse(me, n)) return null;
    if (n === 'cuffs' && !opps.some(o => g.players[o].cuffed === 0)) return null;
    for (const o of opps) { const j = g.players[o].items.indexOf(n); if (j >= 0) return { type: 'item', idx: a, steal: j, who: o }; }
    return null;
  };
  const want = (n, who = -1) => own(n, who) || (smart ? steal(n) : null);
  // 수갑 대상: 다음 차례가 될 상대 중 아직 묶이지 않은 쪽
  const cuffT = () => { let o = me; for (let k = 0; k < g.n; k++) { o = g.next(o); if (o !== me && g.players[o].cuffed === 0) return o; } return -1; };
  let a;
  if (useItems) {
    const healable = P.hp < P.max && !g.sudden(me), ct = cuffT();
    if (healable && (a = want('cigs'))) return a;
    if (p === 1) {
      if (ct >= 0 && g.shells.length > 1 && (a = want('cuffs', ct))) return a;
      if (!g.sawed && (a = want('saw'))) return a;
      return { type: 'shoot', target: opp };
    }
    if (p === 0) {
      if (smart && (a = want('inverter'))) return a;
      return { type: 'shoot', target: me };
    }
    if ((a = want('magnifier'))) return a;
    if (healable && P.max - P.hp >= 2 && P.hp >= 2 && smart && (a = own('meds'))) return a;
    if (g.shells.length > 2 && (a = own('phone'))) return a;
    if (p > 0.3 && p < 0.7 && g.shells.length > 1 && (a = own('beer'))) return a;
    if (p >= 0.5 && smart && ct >= 0 && g.shells.length > 1 && (a = own('cuffs', ct))) return a;
    if (p >= 0.75 && !g.sawed && (a = own('saw'))) return a;
  } else if (p === 1) return { type: 'shoot', target: opp };
  let target = p >= 0.5 ? opp : me;
  if (!smart && rng() < 0.35) target = rng() < 0.5 ? me : opps[Math.floor(rng() * opps.length)];
  if (g.sawed) target = opp;
  return { type: 'shoot', target };
}
