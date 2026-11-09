// node tests/sim.js — 봇 대 봇 시뮬레이션으로 규칙 불변식 검사
import { Game, ITEMS, SLOTS } from '../js/game.js';
import { decide, LEVELS } from '../js/ai.js';

const lvls = Object.keys(LEVELS);
let games = 0, wins = [0, 0], actions = 0;
const fail = m => { console.error('FAIL:', m); process.exit(1); };
const vs = { nightmare: 0, easy: 0 };

for (let n = 0; n < 4000; n++) {
  const cfg = { hp: 2 + (n % 5), items: n % 5, sudden: n % 2 === 0 };
  const g = new Game(cfg);
  const L = [LEVELS[lvls[n % 4]], LEVELS[lvls[(n >> 2) % 4]]];
  let steps = 0;
  const check = () => {
    for (const e of g.flush()) if (e.t === 'load') {
      if (e.live < 1 || e.blank < 1 || e.live + e.blank > 8) fail('bad load ' + JSON.stringify(e));
    }
    g.players.forEach(p => {
      if (p.hp > p.max || p.hp < 0) fail('hp out of range');
      if (p.items.length > SLOTS) fail('too many items');
      p.items.forEach(i => { if (!ITEMS[i]) fail('unknown item ' + i); });
    });
    if (!g.over && !g.shells.length) fail('empty chamber during play');
  };
  check();
  while (!g.over) {
    if (++steps > 2000) fail('infinite loop');
    const me = g.turn, a = decide(g, me, L[me]);
    const ok = a.type === 'item' ? g.use(me, a.idx, a.steal ?? -1, a.who ?? -1) : g.shoot(me, a.target);
    if (!ok) fail('AI produced invalid action ' + JSON.stringify(a) + ' items=' + g.players[me].items);
    actions++; check();
  }
  games++; wins[g.winner]++;
  if (L[0] === LEVELS.nightmare && L[1] === LEVELS.easy) vs.nightmare += g.winner === 0;
  if (L[0] === LEVELS.easy && L[1] === LEVELS.nightmare) vs.easy += g.winner === 0;
}

// 수동 규칙 검사
{
  const g = new Game({ hp: 3, items: 0 }, () => 0.99);
  g.shells = [false, true, true]; g.known = [[], []];
  g.shoot(0, 0); if (g.turn !== 0) fail('self blank should keep turn');
  g.players[0].items = ['cuffs', 'saw']; g.use(0, 0);
  if (g.use(0, 0) !== true || !g.sawed) fail('saw');
  g.shoot(0, 1); if (g.players[1].hp !== 1) fail('sawed damage 2');
  if (g.turn !== 0) fail('cuffed opponent should be skipped');
  g.players[0].items = ['cuffs'];
  if (g.canUse(0, 'cuffs')) fail('cannot re-cuff right after release');
}
{
  const g = new Game({ hp: 2, items: 0, sudden: true });
  g.players[0].hp = 1; g.players[0].items = ['cigs'];
  g.use(0, 0); if (g.players[0].hp !== 1) fail('sudden death blocks heal');
}
// 3~4인 친구 대전 규칙
const mw = [0, 0, 0, 0];
for (let n = 0; n < 3000; n++) {
  const N = 3 + (n % 2), g = new Game({ hp: 2 + (n % 5), items: 1 + n % 4, sudden: n % 3 === 0, multi: true, slots: 4 }, Math.random, N);
  let steps = 0;
  while (!g.over) {
    if (++steps > 3000) fail('multi infinite loop');
    const me = g.turn; if (!g.alive(me)) fail('dead player has turn');
    const a = decide(g, me, LEVELS[lvls[(n + me) % 4]]);
    const ok = a.type === 'item' ? g.use(me, a.idx, a.steal ?? -1, a.who ?? -1) : g.shoot(me, a.target);
    if (!ok) fail('multi invalid action ' + JSON.stringify(a));
    g.players.forEach(p => { if (p.items.length > 4) fail('multi slots'); if (p.hp < 0 || p.hp > p.max) fail('multi hp'); });
    for (const e of g.flush()) if (e.t === 'die' && g.players[e.p].hp > 0) fail('die event alive');
    if (!g.over && !g.shells.length) fail('multi empty chamber');
  }
  if (g.players.filter(p => p.hp > 0).length !== 1 || g.players[g.winner].hp <= 0) fail('multi winner');
  mw[g.winner]++;
}
console.log(`OK multi 3000 games, winner seat dist ${mw.join('/')}`);
console.log(`OK ${games} games, ${actions} actions, wins P0/P1 = ${wins.join('/')}`);
console.log(`nightmare(P0) vs easy: ${vs.nightmare} wins / easy(P0) vs nightmare: ${vs.easy} wins (각 250판)`);
