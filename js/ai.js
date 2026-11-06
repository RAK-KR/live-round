// 봇 AI — smart: 최적 판단 확률, item: 아이템 사용 의지
export const LEVELS = {
  easy: { smart: 0.45, item: 0.5 },
  normal: { smart: 0.72, item: 0.8 },
  hard: { smart: 0.9, item: 0.95 },
  nightmare: { smart: 1, item: 1 },
};

export function decide(g, me, lv, rng = Math.random) {
  const P = g.players[me], O = g.players[1 - me], opp = 1 - me;
  const smart = rng() < lv.smart, useItems = rng() < lv.item;
  const p = g.pLive(me);
  const own = n => { const i = P.items.indexOf(n); return i >= 0 && g.canUse(me, n) ? { type: 'item', idx: i } : null; };
  const steal = n => {
    const a = P.items.indexOf('adrenaline'), j = O.items.indexOf(n);
    if (a < 0 || j < 0 || n === 'adrenaline' || !g.canUse(me, n)) return null;
    return { type: 'item', idx: a, steal: j };
  };
  const want = n => own(n) || (smart ? steal(n) : null);
  let a;
  if (useItems) {
    const healable = P.hp < P.max && !g.sudden(me);
    if (healable && (a = want('cigs'))) return a;
    if (p === 1) {
      if (O.cuffed === 0 && g.shells.length > 1 && (a = want('cuffs'))) return a;
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
    if (p >= 0.5 && smart && O.cuffed === 0 && g.shells.length > 1 && (a = own('cuffs'))) return a;
    if (p >= 0.75 && !g.sawed && (a = own('saw'))) return a;
  } else {
    if (p === 1) return { type: 'shoot', target: opp };
  }
  let target = p >= 0.5 ? opp : me;
  if (!smart && rng() < 0.35) target = rng() < 0.5 ? me : opp;
  if (g.sawed) target = opp;
  return { type: 'shoot', target };
}
