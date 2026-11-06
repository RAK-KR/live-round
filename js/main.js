import { Game, ITEMS } from './game.js';
import { decide, LEVELS } from './ai.js';
import { Scene } from './render.js';
import { sfx, initAudio, setMuted } from './audio.js';
import { STAGES, PROLOGUE, ENDING } from './campaign.js';

const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const j = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };
const fmt = n => n.toLocaleString('ko-KR') + '원';
const LV = { easy: '쉬움', normal: '보통', hard: '어려움', nightmare: '악몽' };
const ISFX = { cuffs: 'cuffs', saw: 'saw', beer: 'glass', cigs: 'puff', adrenaline: 'zap', phone: 'phone', inverter: 'zap', meds: 'glass' };
const SK = 'liveround.v1';
const save = Object.assign({ unlocked: 1, cleared: false, best: 0, muted: false, seen: false }, (() => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch { return {}; } })());
const persist = () => { try { localStorage.setItem(SK, JSON.stringify(save)); } catch { } };
setMuted(save.muted);

const scene = new Scene($('scene'));
let G = null, M = null, busy = true, paused = false, SES = 0, sel = -1, stealFrom = -1;
const hold = async () => { while (paused) await wait(120); };
const hud = on => $('hud').classList.toggle('hidden', !on);

// ── 메뉴 ──
const scr = $('screen'); let acts = {};
const menu = (html, a) => { scr.innerHTML = `<div class="menu">${html}</div>`; acts = a; };
scr.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  initAudio(); sfx.ui(); acts[b.dataset.a]?.(b.dataset.v);
});
const sndLabel = () => `소리: ${save.muted ? '꺼짐' : '켜짐'}`;
const toggleSnd = () => { save.muted = !save.muted; setMuted(save.muted); persist(); };

function title() {
  SES++; paused = false; G = M = null; hud(false); scene.v = null; scene.reset(); scene.setOpp(STAGES[4]);
  menu(`<h1 class="title">LIVE ROUND</h1><p class="sub">둘이 앉고, 하나만 일어선다</p>
    <button data-a="camp">캠페인</button><button data-a="endless">더블 오어 낫싱</button><button data-a="quick">빠른 대결</button>
    <button data-a="rules">규칙</button><button data-a="snd">${sndLabel()}</button>
    ${save.best ? `<p class="note">최고 상금 ${fmt(save.best)}</p>` : ''}`,
    { camp: campaign, endless: startEndless, quick: quickMenu, rules, snd: () => { toggleSnd(); title(); } });
}
function rules() {
  menu(`<h2>규칙</h2><div class="scroll">
    <p>산탄총에는 실탄과 공포탄이 섞여 장전됩니다. 장전 직후 각각 몇 발인지 보여주지만, 순서는 알 수 없습니다.</p>
    <p>자기 차례에 상대를 쏘거나 자신을 쏩니다. <b>자신을 쏘았는데 공포탄이면 한 번 더</b> 당신의 차례입니다. 그 외에는 차례가 넘어갑니다.</p>
    <p>촛불이 체력입니다. 먼저 모든 촛불이 꺼지는 쪽이 집니다. 마지막 라운드에서는 체력이 2 이하가 되면 생명 유지 장치가 끊겨 회복할 수 없습니다(파란 불꽃).</p>
    <p>탄을 모두 쓰면 다시 장전되고 아이템이 배분됩니다. 아이템은 최대 8개까지 가질 수 있습니다.</p>
    ${Object.values(ITEMS).map(i => `<p><b>${i.name}</b> — ${i.desc}</p>`).join('')}
    </div><button data-a="back">돌아가기</button>`, { back: title });
}
function campaign() {
  menu(`<h2>캠페인</h2>${STAGES.map((s, i) => i < save.unlocked
    ? `<button class="stage" data-a="go" data-v="${i}"><span>${i + 1}. ${s.name}</span><small>${LV[s.lv]}</small></button>`
    : `<button class="stage" disabled><span>${i + 1}. ???</span><small>잠김</small></button>`).join('')}
    ${save.cleared ? '<p class="note">모든 문을 지나왔습니다.</p>' : ''}<button data-a="back">돌아가기</button>`, { go: i => stageIntro(+i), back: title });
}
function dialog(name, lines, done) {
  let k = 0;
  const show = () => {
    const l = lines[k], q = l.startsWith('“');
    menu(`<h2>${q ? name : ''}</h2><p class="line ${q ? 'q' : ''}">${l}</p><button data-a="n">${k < lines.length - 1 ? '계속' : '확인'}</button>`,
      { n: () => (++k < lines.length ? show() : done()) });
    if (q) sfx.whisper();
  };
  show();
}
function stageIntro(i) {
  const s = STAGES[i]; scene.setOpp(s); scene.reset(); scene.v = null;
  const lines = (i === 0 && !save.seen ? PROLOGUE : []).concat(s.intro);
  save.seen = true; persist();
  dialog(s.name, lines, () => startMatch({ mode: 'camp', stage: i, rounds: s.rounds, lv: s.lv, opp: s }));
}
function quickMenu() {
  menu(`<h2>빠른 대결</h2>${Object.keys(LV).map(l => `<button data-a="go" data-v="${l}">${LV[l]}</button>`).join('')}<button data-a="back">돌아가기</button>`,
    { go: startQuick, back: title });
}
const QUICK = [{ hp: 2, items: 1 }, { hp: 4, items: 2 }, { hp: 6, items: 4, sudden: true }];
const startQuick = lv => startMatch({ mode: 'quick', lv, opp: pick(STAGES), rounds: QUICK });
const startEndless = () => startMatch({ mode: 'endless', lv: 'normal', opp: pick(STAGES.slice(0, 4)) });
const endlessCfg = n => ({ hp: Math.min(6, 2 + Math.ceil(n * .7)), items: Math.min(4, 1 + n), sudden: n >= 2 });
const prize = n => 5000 * 2 ** (n - 1);

// ── 매치 진행 ──
function startMatch(cfg) {
  SES++; paused = false; M = { ...cfg, ri: 0, n: 0 }; scr.innerHTML = ''; scene.setOpp(M.opp); hud(true);
  startRound();
}
async function startRound() {
  const tk = SES, cfg = M.mode === 'endless' ? endlessCfg(M.n) : M.rounds[M.ri];
  G = new Game(cfg); scene.reset(); scene.v = null; scene.fx.black = 1; closeTip(); setCtl(false);
  $('log').innerHTML = ''; $('known').innerHTML = ''; $('hp').innerHTML = ''; $('stageName').textContent = M.opp.name;
  const rn = M.mode === 'endless' ? M.n + 1 : M.ri + 1;
  $('roundInfo').textContent = M.mode === 'endless' ? `ROUND ${rn} · ${LV[M.lv]}` : `ROUND ${rn} / ${M.rounds.length}`;
  await banner(`ROUND ${rn}`, cfg.sudden ? '체력 2 이하에서 생명 유지 장치가 끊어집니다' : '');
  if (tk !== SES) return;
  scene.fx.blackT = 0;
  await play(G.flush(), tk); next(tk);
}
function next(tk) {
  if (tk !== SES) return;
  if (G.over) return roundEnd(tk);
  if (G.turn === 1) { setCtl(false); botLoop(tk); } else setCtl(true);
}
async function botLoop(tk) {
  await wait(700 + Math.random() * 600);
  while (tk === SES && !G.over && G.turn === 1) {
    await hold();
    const a = decide(G, 1, LEVELS[M.lv]);
    const ok = a.type === 'item' ? G.use(1, a.idx, a.steal ?? -1) : G.shoot(1, a.target);
    if (!ok) G.shoot(1, 0);
    await play(G.flush(), tk);
    if (tk !== SES) return;
    await wait(450);
  }
  next(tk);
}
async function act(fn) {
  if (busy) return;
  closeTip(); setCtl(false);
  const tk = SES;
  if (!fn()) return setCtl(true);
  await play(G.flush(), tk); next(tk);
}
async function play(evs, tk) {
  for (const e of evs) { if (tk !== SES) return; await hold(); await ANIM[e.t](e); updKnown(); }
}
async function roundEnd(tk) {
  setCtl(false);
  if (G.winner === 0) {
    scene.fx.deadT = 1; sfx.stinger(); log(`${sub(1)} 쓰러집니다.`, 'hit');
    await wait(2000); if (tk !== SES) return;
    if (M.mode === 'endless') { M.n++; return endlessChoice(); }
    if (++M.ri < M.rounds.length) { say(pick(M.opp.hurt)); await wait(1200); if (tk === SES) startRound(); return; }
    return matchWin();
  }
  scene.fx.blackT = 1; sfx.stinger(); await wait(1700); if (tk !== SES) return;
  hud(false);
  if (M.mode === 'endless') return menu(`<h2 class="red">전부 잃었습니다</h2><p class="line">${M.n}라운드 생존 · 최고 기록 ${fmt(save.best)}</p>
    <button data-a="again">다시 앉는다</button><button data-a="title">메인 메뉴</button>`, { again: startEndless, title });
  menu(`<h2 class="red">당신은 죽었습니다</h2><p class="line q">“${pick(M.opp.win)}”</p>
    <button data-a="retry">다시 앉는다</button><button data-a="title">메인 메뉴</button>`, { retry: () => startMatch(M), title });
}
function matchWin() {
  hud(false);
  if (M.mode !== 'camp') return menu(`<h2>승리</h2><p class="line q">“${pick(M.opp.lose)}”</p>
    <button data-a="again">다시</button><button data-a="title">메인 메뉴</button>`, { again: () => startQuick(M.lv), title });
  const i = M.stage, last = i === STAGES.length - 1;
  save.unlocked = Math.max(save.unlocked, Math.min(STAGES.length, i + 2)); if (last) save.cleared = true; persist();
  dialog(M.opp.name, [`“${pick(M.opp.lose)}”`, ...(last ? ENDING : [])], () =>
    menu(`<h2>${last ? '끝' : '통과'}</h2><p class="line">${last ? '당신은 마지막 문을 열었습니다.' : '다음 문이 열렸습니다.'}</p>
      ${last ? '' : '<button data-a="next">다음 상대</button>'}<button data-a="camp">캠페인</button><button data-a="title">메인 메뉴</button>`,
      { next: () => stageIntro(i + 1), camp: campaign, title }));
}
function endlessChoice() {
  hud(false); const p = prize(M.n);
  menu(`<h2>상금 ${fmt(p)}</h2><p class="line">여기서 일어나거나, 전부를 걸고 다시 앉거나.</p>
    <button data-a="dbl">더블 오어 낫싱</button><button data-a="cash">현금화</button>`, {
    dbl: () => {
      M.lv = M.n >= 4 ? 'nightmare' : M.n >= 2 ? 'hard' : 'normal';
      if (M.n % 2 === 0) { M.opp = pick(STAGES); scene.setOpp(M.opp); }
      scr.innerHTML = ''; hud(true); startRound();
    },
    cash: () => {
      save.best = Math.max(save.best, p); persist();
      menu(`<h2>현금화</h2><p class="line">${fmt(p)}을 들고 계단을 오릅니다.<br>최고 기록 ${fmt(save.best)}</p><button data-a="title">메인 메뉴</button>`, { title });
    },
  });
}

// ── 연출 ──
const who = p => p ? M.opp.name + j(M.opp.name, '은', '는') : '당신은';
const sub = p => p ? M.opp.name + j(M.opp.name, '이', '가') : '당신이';
const SN = l => l ? '실탄' : '공포탄';
function log(msg, cls = '') {
  const L = $('log'), d = document.createElement('div'); d.className = 'ln ' + cls; d.textContent = msg; L.appendChild(d);
  while (L.children.length > 3) L.firstChild.remove();
}
const say = l => { log(`“${l}”`, 'opp'); sfx.whisper(); };
function applySnap(sn) { scene.v = { ...sn, max: G.cfg.hp, sudden: sn.hp.map(h => !!G.cfg.sudden && h <= 2) }; drawHp(); }
function drawHp() {
  const v = scene.v; if (!v || !M) return;
  const bar = p => Array.from({ length: v.max }, (_, i) => `<b class="${i < v.hp[p] ? (v.sudden[p] ? 'sd' : 'on') : ''}"></b>`).join('');
  $('hp').innerHTML = `<span>${M.opp.name}</span>${bar(1)}<em></em><span>당신</span>${bar(0)}`;
}
async function banner(t, s) {
  const b = $('banner'); b.innerHTML = `<div>${t}</div>${s ? `<small>${s}</small>` : ''}`; b.classList.add('on');
  await wait(1500); b.classList.remove('on'); await wait(450);
}
function updKnown() {
  if (!G) return;
  $('known').innerHTML = G.known[0].map((v, i) => v === undefined ? '' : `<span class="${v ? 'live' : 'blank'}">${i ? i + 1 + '번째' : '현재'} · ${SN(v)}</span>`).join('');
}
const ANIM = {
  async load(e) {
    const old = scene.v ? scene.v.items : [[], []];
    applySnap({ ...e.snap, items: old });
    log(`실탄 ${e.live}발, 공포탄 ${e.blank}발.`, 'sys');
    await scene.loadShells(e.live, e.blank);
    if (e.snap.items.some((a, p) => a.length > old[p].length)) { log('아이템 상자가 올라옵니다.', 'sys'); await scene.dealItems(old, e.snap.items); }
    applySnap(e.snap); log('당신의 차례입니다.', 'sys');
  },
  async turn(e) { applySnap(e.snap); if (e.p === 0) log('당신의 차례입니다.', 'sys'); },
  async skip(e) { applySnap(e.snap); sfx.cuffs(); log(`${who(e.p)} 수갑에 묶여 차례를 건너뜁니다.`, 'sys'); await wait(800); },
  async end(e) { applySnap(e.snap); },
  async shot(e) {
    const opp = M.opp.name, self = e.by === e.target;
    log(e.by === 0 ? (self ? '당신은 총구를 자신에게 겨눕니다.' : `당신은 ${opp}에게 총구를 겨눕니다.`)
      : (self ? `${sub(1)} 총구를 자신에게 겨눕니다.` : `${sub(1)} 당신에게 총구를 겨눕니다.`));
    scene.gun.pose = e.target === 1 ? 1 : -1; scene.gun.by = e.by; scene.gun.kt = 1; scene.look = e.target === 0 ? 1 : 0;
    await wait(550); sfx.heart(); await wait(500 + Math.random() * 900);
    applySnap({ ...e.snap, sawed: e.sawed });
    if (e.live) {
      sfx.shot(); scene.fx.flash = 1; scene.fx.shake = e.dmg > 1 ? 1.5 : 1; scene.gun.recoil = 1;
      if (e.target === 0) {
        scene.fx.red = 1; scene.fx.blackT = 1; log(`탕. 당신은 ${e.dmg}의 피해를 입었습니다.`, 'hit');
        await wait(1000); if (e.snap.hp[0] > 0) scene.fx.blackT = 0;
      } else { scene.fx.hit = 1; scene.crack += e.dmg; log(`탕. ${opp}에게 ${e.dmg}의 피해.`, 'hit'); await wait(700); }
    } else {
      sfx.click(); log(self && e.by === 0 ? '찰칵. 공포탄입니다. 한 번 더 당신의 차례입니다.' : '찰칵. 공포탄입니다.'); await wait(700);
    }
    scene.gun.kt = 0; scene.look = 0; await wait(380); scene.rack(); applySnap(e.snap);
    if (Math.random() < .3 && e.snap.hp[0] > 0 && e.snap.hp[1] > 0) say(pick(e.live && e.target === 1 ? M.opp.hurt : M.opp.taunt));
  },
  async item(e) {
    const W = who(e.by), me = e.by === 0, opp = M.opp.name;
    scene.float = { k: e.item, p: e.by, t: 0 }; sfx[ISFX[e.item] || 'item'](); applySnap(e.snap);
    let m;
    switch (e.item) {
      case 'magnifier': m = me ? `돋보기로 약실을 들여다봅니다. 현재 탄은 ${SN(e.live)}입니다.` : `${W} 돋보기로 약실을 들여다봅니다.`; break;
      case 'cuffs': m = me ? `${opp}에게 수갑을 채웠습니다.` : `${W} 당신에게 수갑을 채웠습니다.`; break;
      case 'saw': m = `${W} 총열을 잘라냅니다. 다음 한 발은 피해가 2배입니다.`; break;
      case 'beer': scene.rack(); m = `${W} 펌프를 당겨 탄을 빼냅니다. 빠져나온 것은 ${SN(e.live)}입니다.`; break;
      case 'cigs': m = e.heal ? `${W} 담배를 피웁니다. 체력 +${e.heal}.` : G.cfg.sudden && e.snap.hp[e.by] <= 2 ? `${W} 담배를 피우지만, 생명 유지 장치가 끊겨 회복되지 않습니다.` : `${W} 담배를 피웁니다. 회복할 체력이 없습니다.`; break;
      case 'meds': m = e.hurt ? `${W} 약을 삼킵니다. 상한 약이었습니다. 체력 -1.` : e.heal ? `${W} 약을 삼킵니다. 체력 +${e.heal}.` : `${W} 약을 삼키지만 아무 일도 일어나지 않습니다.`; break;
      case 'phone': m = me ? (e.pos != null ? `수화기 너머의 목소리: “${e.pos + 1}번째 탄은... ${SN(e.live)}.”` : '수화기 너머의 목소리: “...안타깝군.”') : `${W} 대포폰에 귀를 기울입니다.`; break;
      case 'inverter': m = `${W} 인버터를 사용합니다. 현재 탄의 극성이 뒤집힙니다.`; break;
      case 'adrenaline': { const n = ITEMS[e.stole].name; m = `${W} 아드레날린을 주사하고 ${me ? '상대' : '당신'}의 ${n}${j(n, '을', '를')} 빼앗습니다.`; break; }
    }
    log(m, e.hurt ? 'hit' : ''); if (e.hurt) { scene.fx.red = me ? .6 : 0; if (!me) scene.fx.hit = .6; }
    await wait(1000);
  },
};

// ── 입력 ──
function setCtl(on) {
  busy = !on; $('btnShootOpp').disabled = $('btnShootSelf').disabled = !on;
  $('actions').classList.toggle('wait', !on);
  scene.dis = on && G ? G.players[0].items.map(n => !G.canUse(0, n)) : null;
}
const REASON = { saw: '이미 총열이 잘려 있습니다.', cuffs: '상대가 이미 수갑을 찼거나 막 풀려났습니다.', adrenaline: '빼앗아 쓸 수 있는 아이템이 없습니다.' };
function tip(name, desc, canUse, useLabel = '사용') {
  $('tipName').textContent = name; $('tipDesc').textContent = desc;
  $('tipUse').classList.toggle('hidden', !useLabel); $('tipUse').disabled = !canUse; $('tipUse').textContent = useLabel || '';
  $('itemTip').classList.remove('hidden');
}
function closeTip() { $('itemTip').classList.add('hidden'); sel = stealFrom = -1; scene.sel = -1; scene.steal = false; }
$('scene').addEventListener('pointerdown', e => {
  initAudio();
  if (!G || busy) return;
  const h = scene.pick(e.clientX, e.clientY); if (!h) return;
  const name = G.players[h.p].items[h.i];
  if (stealFrom >= 0) {
    if (h.p !== 1) return;
    if (name === 'adrenaline' || !G.canUse(0, name)) { log('그 아이템은 빼앗을 수 없습니다.', 'sys'); return; }
    const a = stealFrom; return act(() => G.use(0, a, h.i));
  }
  sfx.ui();
  if (h.p === 0) {
    sel = h.i; scene.sel = h.i; const ok = G.canUse(0, name);
    tip(ITEMS[name].name, ok ? ITEMS[name].desc : `${ITEMS[name].desc}\n${REASON[name] || ''}`, ok);
  } else { closeTip(); tip(`상대의 ${ITEMS[name].name}`, ITEMS[name].desc, false, ''); }
});
$('tipUse').onclick = () => {
  if (sel < 0) return; const name = G.players[0].items[sel];
  if (name === 'adrenaline') { stealFrom = sel; scene.steal = true; tip('아드레날린', '빼앗을 상대의 아이템을 누르세요.', false, ''); return; }
  const i = sel; act(() => G.use(0, i));
};
$('tipCancel').onclick = closeTip;
$('scene').addEventListener('pointermove', e => {
  const hv = $('hover'), h = G && e.pointerType === 'mouse' ? scene.pick(e.clientX, e.clientY) : null;
  if (!h) { hv.classList.add('hidden'); $('scene').style.cursor = ''; return; }
  const n = G.players[h.p].items[h.i]; if (!n) return;
  hv.textContent = (h.p ? '상대의 ' : '') + ITEMS[n].name; hv.style.left = e.clientX + 14 + 'px'; hv.style.top = e.clientY + 12 + 'px';
  hv.classList.remove('hidden'); $('scene').style.cursor = 'pointer';
});
$('btnShootOpp').onclick = () => act(() => G.shoot(0, 1));
$('btnShootSelf').onclick = () => act(() => G.shoot(0, 0));
$('btnPause').onclick = () => {
  if (!M) return; paused = true; initAudio();
  const pm = () => menu(`<h2>일시 정지</h2><button data-a="go">계속하기</button><button data-a="snd">${sndLabel()}</button><button data-a="quit">포기하고 나가기</button>`,
    { go: () => { paused = false; scr.innerHTML = ''; }, snd: () => { toggleSnd(); pm(); }, quit: title });
  pm();
};
addEventListener('keydown', e => {
  if (!scr.innerHTML && !busy) { if (e.key === '1') $('btnShootOpp').click(); if (e.key === '2') $('btnShootSelf').click(); }
  if (e.key === 'Escape') { if (paused) acts.go?.(); else if (M && !scr.innerHTML) $('btnPause').click(); }
});

title();
