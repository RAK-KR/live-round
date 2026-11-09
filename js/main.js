import { Game, ITEMS } from './game.js';
import { decide, LEVELS } from './ai.js';
import { Scene } from './render.js';
import { sfx, initAudio, setMuted } from './audio.js';
import { STAGES, PROLOGUE, ENDING } from './campaign.js';
import { Net } from './net.js';

const VER = 2;
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const j = (w, a, b) => { const l = w.trim().slice(-1); if (/\d/.test(l)) return '013678'.includes(l) ? a : b; const c = l.charCodeAt(0) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n.toLocaleString('ko-KR') + '원';
const LV = { easy: '쉬움', normal: '보통', hard: '어려움', nightmare: '악몽' };
const ISFX = { cuffs: 'cuffs', saw: 'saw', beer: 'glass', cigs: 'puff', adrenaline: 'zap', phone: 'phone', inverter: 'zap', meds: 'glass' };
const SK = 'liveround.v1';
const save = Object.assign({ unlocked: 1, cleared: false, best: 0, muted: false, seen: false, name: '' }, (() => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch { return {}; } })());
const persist = () => { try { localStorage.setItem(SK, JSON.stringify(save)); } catch { } };
setMuted(save.muted);

const scene = new Scene($('scene'));
// G: 방장/혼자 할 때의 실제 게임, M: 매치 정보, MP: 친구 대전 세션
let G = null, M = null, MP = null, CFG = null, busy = true, paused = false, SES = 0, sel = -1, stealFrom = -1, ANIMATING = false;
// 화면 기준 좌석: 0 = 나. SEAT = 내 전체 좌석 번호, N = 인원
let SEAT = 0, N = 2, NAMES = ['당신', ''], KNOWN = [], TURN = -1, CQ = Promise.resolve();
const loc = g => (g - SEAT + N) % N, glob = l => (l + SEAT) % N;
const hold = async () => { while (paused) await wait(120); };
const hud = on => $('hud').classList.toggle('hidden', !on);
const alive = i => !!scene.v && scene.v.hp[i] > 0;

// ── 메뉴 ──
const scr = $('screen'); let acts = {};
const menu = (html, a) => { scr.innerHTML = `<div class="menu">${html}</div>`; acts = a; };
scr.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  initAudio(); sfx.ui(); acts[b.dataset.a]?.(b.dataset.v);
});
const sndLabel = () => `소리: ${save.muted ? '꺼짐' : '켜짐'}`;
const toggleSnd = () => { save.muted = !save.muted; setMuted(save.muted); persist(); };

function leaveMP() { if (MP) { MP.net.close(); MP = null; } }
function title() {
  SES++; paused = false; leaveMP(); G = M = null; hud(false); scene.v = null; scene.reset(); scene.setOpp(STAGES[4]); scene.turn = -1;
  history.replaceState(null, '', location.pathname + location.search.replace(/[?&]room=\w+/, '').replace(/^&/, '?'));
  menu(`<h1 class="title">LIVE ROUND</h1><p class="sub">둘이 앉고, 하나만 일어선다</p>
    <button data-a="camp">캠페인</button><button data-a="friends">친구와 하기</button><button data-a="endless">더블 오어 낫싱</button><button data-a="quick">빠른 대결</button>
    <button data-a="rules">규칙</button><button data-a="snd">${sndLabel()}</button>
    ${save.best ? `<p class="note">최고 상금 ${fmt(save.best)}</p>` : ''}`,
    { camp: campaign, friends: () => friends(), endless: startEndless, quick: quickMenu, rules, snd: () => { toggleSnd(); title(); } });
}
function rules() {
  menu(`<h2>규칙</h2><div class="scroll">
    <p>산탄총에는 실탄과 공포탄이 섞여 장전됩니다. 장전 직후 각각 몇 발인지 보여주지만, 순서는 알 수 없습니다.</p>
    <p>자기 차례에 상대를 쏘거나 자신을 쏩니다. <b>자신을 쏘았는데 공포탄이면 한 번 더</b> 당신의 차례입니다. 그 외에는 차례가 넘어갑니다.</p>
    <p>촛불이 체력입니다. 먼저 모든 촛불이 꺼지는 쪽이 집니다. 마지막 라운드에서는 체력이 2 이하가 되면 생명 유지 장치가 끊겨 회복할 수 없습니다(파란 불꽃).</p>
    <p>탄을 모두 쓰면 다시 장전되고 아이템이 배분됩니다. 아이템은 최대 8개(친구와 하기는 4개)까지 가질 수 있습니다.</p>
    <p><b>친구와 하기</b> — 2~4명이 한 테이블에 앉아 마지막 한 명이 남을 때까지 겨룹니다. 3라운드 동안 가장 많이 살아남은 사람이 이깁니다. 빈자리는 봇으로 채울 수 있습니다.</p>
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
const MPR = [{ hp: 3, items: 2 }, { hp: 4, items: 2 }, { hp: 5, items: 3, sudden: true }].map(r => ({ ...r, multi: true, slots: 4 }));
const startQuick = lv => startMatch({ mode: 'quick', lv, opp: pick(STAGES), rounds: QUICK });
const startEndless = () => startMatch({ mode: 'endless', lv: 'normal', opp: pick(STAGES.slice(0, 4)) });
const endlessCfg = n => ({ hp: Math.min(6, 2 + Math.ceil(n * .7)), items: Math.min(4, 1 + n), sudden: n >= 2 });
const prize = n => 5000 * 2 ** (n - 1);

// ── 혼자 하는 매치 ──
function startMatch(cfg) {
  SES++; paused = false; M = { ...cfg, ri: 0, n: 0 }; scr.innerHTML = ''; hud(true);
  SEAT = 0; N = 2; NAMES = ['당신', M.opp.name]; scene.setOpp(M.opp);
  startRound();
}
async function roundIntro(tk, label, sub) {
  scene.reset(); scene.v = null; scene.fx.black = 1; scene.turn = -1; closeTip(); setCtl(false);
  $('log').innerHTML = ''; $('known').innerHTML = ''; $('hp').innerHTML = ''; KNOWN = [];
  $('stageName').textContent = MP ? `ROOM ${MP.code}` : M.opp.name; $('roundInfo').textContent = label;
  await banner(label.split(' ·')[0].replace(/ \/ \d+/, ''), sub);
  if (tk === SES) scene.fx.blackT = 0;
}
async function startRound() {
  const tk = SES;
  CFG = M.mode === 'endless' ? endlessCfg(M.n) : M.rounds[M.ri];
  G = new Game(CFG, Math.random, N);
  const rn = M.mode === 'endless' ? M.n + 1 : M.ri + 1;
  if (MP) MP.peers().forEach(s => MP.net.send(s.id, { t: 'round', cfg: CFG, ri: M.ri, total: M.rounds.length }));
  await roundIntro(tk, M.mode === 'endless' ? `ROUND ${rn} · ${LV[M.lv]}` : `ROUND ${rn} / ${M.rounds.length}`, CFG.sudden ? '체력 2 이하에서 생명 유지 장치가 끊어집니다' : '');
  if (tk !== SES) return;
  await settle(tk); next(tk);
}
// 방장: 이벤트를 모두에게 보내고 내 화면에서도 재생
const knownOf = s => Array.from({ length: G.shells.length }, (_, i) => G.known[s][i] ?? null);
async function settle(tk) {
  const evs = G.flush();
  if (MP) MP.peers().forEach(s => MP.net.send(s.id, { t: 'ev', evs: localize(evs, s.seat), known: knownOf(s.seat), turn: G.turn, over: G.over }));
  KNOWN = knownOf(0); ANIMATING = true;
  await play(localize(evs, 0), tk); ANIMATING = false;
}
function localize(evs, s) {
  const n = G.n, L = g => (g - s + n) % n, rot = a => a.map((_, i) => a[(i + s) % n]);
  return evs.map(e => {
    const c = { ...e, snap: { ...e.snap, hp: rot(e.snap.hp), items: rot(e.snap.items), cuffed: rot(e.snap.cuffed) } };
    for (const k of ['by', 'target', 'p', 'winner', 'who']) if (typeof c[k] === 'number' && c[k] >= 0) c[k] = L(c[k]);
    if (c.t === 'item' && e.by !== s && (c.item === 'magnifier' || c.item === 'phone')) { delete c.live; delete c.pos; }
    return c;
  });
}
const seatType = g => !MP ? (g === 0 ? 'me' : 'bot') : MP.seats[g].type;
function applyA(seat, a) { return a.type === 'shoot' ? G.shoot(seat, a.target) : G.use(seat, a.idx, a.steal ?? -1, a.who ?? -1); }
function hostAct(seat, a) {
  if (!applyA(seat, a)) return false;
  const tk = SES; (async () => { await settle(tk); next(tk); })(); return true;
}
function next(tk) {
  if (tk !== SES) return;
  updKnown();
  if (G.over) return roundEnd(tk);
  TURN = G.turn; scene.turn = TURN; const st = seatType(G.turn);
  if (st === 'me') setCtl(true);
  else if (st === 'bot') { setCtl(false); botLoop(tk, G.turn); }
  else {
    setCtl(false);
    const p = MP.pending; MP.pending = null;
    if (p && p.seat === G.turn && hostAct(p.seat, p.a)) return;
    if (p) MP.net.send(MP.seats[p.seat].id, { t: 'rej' });
  }
}
async function botLoop(tk, seat) {
  await wait(700 + Math.random() * 600);
  while (tk === SES && !G.over && G.turn === seat && seatType(seat) === 'bot') {
    await hold();
    const a = decide(G, seat, LEVELS[M.lv || 'normal']);
    if (!applyA(seat, a)) G.shoot(seat, seat);
    await settle(tk);
    if (tk !== SES) return;
    await wait(450);
  }
  next(tk);
}
async function play(evs, tk) {
  for (const e of evs) { if (tk !== SES) return; await hold(); await ANIM[e.t](e); updKnown(); }
}
async function roundEnd(tk) {
  setCtl(false); scene.turn = -1;
  if (MP) {
    const w = G.winner; M.wins[w]++;
    MP.peers().forEach(s => MP.net.send(s.id, { t: 'rend', w, wins: M.wins }));
    await showRoundEnd(w, M.wins, tk); if (tk !== SES) return;
    if (++M.ri < M.rounds.length) return startRound();
    MP.peers().forEach(s => MP.net.send(s.id, { t: 'mend', wins: M.wins }));
    MP.playing = false; return matchEndMP(M.wins);
  }
  if (G.winner === 0) {
    scene.killSeat(1); sfx.stinger(); log(`${sub(1)} 쓰러집니다.`, 'hit');
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
      if (M.n % 2 === 0) { M.opp = pick(STAGES); scene.setOpp(M.opp); NAMES = ['당신', M.opp.name]; }
      scr.innerHTML = ''; hud(true); startRound();
    },
    cash: () => {
      save.best = Math.max(save.best, p); persist();
      menu(`<h2>현금화</h2><p class="line">${fmt(p)}을 들고 계단을 오릅니다.<br>최고 기록 ${fmt(save.best)}</p><button data-a="title">메인 메뉴</button>`, { title });
    },
  });
}

// ── 친구와 하기 ──
const inviteURL = code => `${location.origin}${location.pathname}?room=${code}`;
const NETERR = e => e?.type === 'peer-unavailable' ? '그 코드의 방이 없습니다. 코드를 다시 확인해 주세요.'
  : e?.message === 'timeout' ? '방에 연결하지 못했습니다. 둘 다 일반 와이파이에서 다시 시도해 보세요.'
    : e?.message === 'nolib' ? '통신 파일(js/lib/peerjs.min.js)을 불러오지 못했습니다.' : '연결 서버에 접속하지 못했습니다. 잠시 후 다시 시도해 주세요.';
function friends(code = '', msg = '') {
  SES++; leaveMP(); hud(false);
  menu(`<h2>친구와 하기</h2>${msg ? `<p class="note red">${msg}</p>` : ''}
    <input id="nm" maxlength="8" placeholder="내 이름" value="${esc(save.name)}">
    <button data-a="host">방 만들기</button>
    <input id="code" maxlength="5" placeholder="방 코드 5자리" value="${esc(code)}" style="text-transform:uppercase">
    <button data-a="join">참가하기</button><button data-a="back">돌아가기</button>`, {
    host: () => { if (getName()) hostRoom(); },
    join: () => { const c = $('code').value.trim().toUpperCase(); if (!getName()) return; if (c.length !== 5) return friends(c, '방 코드 5자리를 입력해 주세요.'); joinRoom(c); },
    back: title,
  });
}
function getName() {
  const n = $('nm').value.trim().slice(0, 8);
  if (!n) { $('nm').focus(); $('nm').classList.add('bad'); return ''; }
  save.name = n; persist(); return n;
}
function mkMP(net, isHost) {
  const mp = { net, isHost, code: net.code, seats: [], pending: null, playing: false, peers: () => mp.seats.map((s, seat) => ({ ...s, seat })).filter(s => s.type === 'peer') };
  return mp;
}
async function hostRoom() {
  menu(`<h2>방을 만드는 중</h2><p class="line">연결 서버에 접속하고 있습니다...</p>`, {});
  const net = new Net(); let code;
  try { code = await net.host(); } catch (e) { net.close(); return friends('', NETERR(e)); }
  MP = mkMP(net, true); MP.code = code; MP.seats = [{ type: 'me', name: save.name }];
  net.on.data = (id, d) => hostRecv(id, d);
  net.on.leave = id => {
    const k = MP.seats.findIndex(s => s.id === id); if (k < 0) return;
    if (!MP.playing) { MP.seats.splice(k, 1); lobbyMsg(); return lobby(); }
    const s = MP.seats[k]; s.type = 'bot'; s.name += '(봇)'; log(`${NAMES[loc(k)]}의 연결이 끊겨 봇이 대신합니다.`, 'sys');
    if (G && !G.over && G.turn === k && !ANIMATING) { setCtl(false); botLoop(SES, k); }
  };
  lobby();
}
function hostRecv(id, d) {
  const k = MP.seats.findIndex(s => s.id === id);
  if (d.t === 'hello') {
    if (d.v !== VER) return MP.net.send(id, { t: 'ver' });
    if (MP.playing || MP.seats.length >= 4) return MP.net.send(id, { t: 'full' });
    if (k < 0) MP.seats.push({ type: 'peer', id, name: String(d.name || '손님').slice(0, 8) });
    lobbyMsg(); lobby(); return;
  }
  if (d.t === 'act' && k >= 0 && G && !G.over && G.turn === k && MP.seats[k].type === 'peer') {
    if (ANIMATING) { MP.pending = { seat: k, a: d.a }; return; }
    if (!hostAct(k, d.a)) MP.net.send(id, { t: 'rej' });
  }
}
function lobbyMsg() { MP.peers().forEach(s => MP.net.send(s.id, { t: 'lobby', seats: MP.seats.map(x => ({ name: x.name, bot: x.type === 'bot' })) })); }
function lobby(list) {
  if (!MP || MP.playing) return;
  hud(false); scene.v = null; scene.reset();
  const seats = list || MP.seats.map(x => ({ name: x.name, bot: x.type === 'bot' }));
  const rows = [0, 1, 2, 3].map(i => seats[i] ? `<div class="seat"><span>${i + 1}. ${esc(seats[i].name)}</span><small>${i === 0 ? '방장' : seats[i].bot ? '봇' : '친구'}</small></div>` : `<div class="seat empty"><span>${i + 1}. 빈자리</span></div>`).join('');
  const H = MP.isHost, nb = MP.seats.filter(s => s.type === 'bot').length;
  menu(`<h2>대기실</h2><p class="code">ROOM <b>${MP.code}</b></p>
    <button data-a="copy">초대 링크 복사</button><div class="seats">${rows}</div>
    ${H ? `<div class="row2"><button data-a="addbot" ${seats.length >= 4 ? 'disabled' : ''}>봇 추가</button><button data-a="rmbot" ${nb ? '' : 'disabled'}>봇 빼기</button></div>
      <button data-a="start" ${seats.length < 2 ? 'disabled' : ''}>게임 시작 (${seats.length}명)</button>`
      : '<p class="note">방장이 게임을 시작하기를 기다리는 중입니다.</p>'}
    <button data-a="leave">방 나가기</button>`, {
    copy: () => { const u = inviteURL(MP.code); (navigator.clipboard?.writeText(u) || Promise.reject()).then(() => toast('초대 링크를 복사했습니다.'), () => prompt('초대 링크', u)); },
    addbot: () => { if (MP.seats.length < 4) { MP.seats.push({ type: 'bot', name: `봇 ${MP.seats.filter(s => s.type === 'bot').length + 1}` }); lobbyMsg(); lobby(); } },
    rmbot: () => { const k = MP.seats.map(s => s.type).lastIndexOf('bot'); if (k > 0) { MP.seats.splice(k, 1); lobbyMsg(); lobby(); } },
    start: hostStart, leave: title,
  });
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
function hostStart() {
  if (MP.seats.length < 2) return;
  MP.playing = true; const names = MP.seats.map(s => s.name);
  MP.peers().forEach(s => MP.net.send(s.id, { t: 'start', seat: s.seat, names }));
  beginMP(0, names); startRound();
}
function beginMP(seat, names) {
  SES++; paused = false; scr.innerHTML = ''; hud(true);
  SEAT = seat; N = names.length; MP.names = names;
  NAMES = Array.from({ length: N }, (_, l) => l ? names[glob(l)] : '당신');
  M = { mode: 'mp', rounds: MPR, ri: 0, wins: Array(N).fill(0), lv: 'normal', opp: { name: '' } };
  scene.setTable(N, true, Array.from({ length: N - 1 }, (_, i) => { const g = glob(i + 1), st = STAGES[g % 5]; return { ...st, name: names[g] + g, label: names[g] }; }));
}
async function joinRoom(code) {
  menu(`<h2>참가하는 중</h2><p class="line">방 ${code}에 연결하고 있습니다...</p>`, {});
  const net = new Net();
  try { await net.join(code); } catch (e) { net.close(); return friends(code, NETERR(e)); }
  MP = mkMP(net, false); MP.code = code;
  net.on.hostlost = () => { if (!MP) return; leaveMP(); SES++; hud(false); menu(`<h2 class="red">연결이 끊어졌습니다</h2><p class="line">방장과의 연결이 끊어졌습니다.</p><button data-a="title">메인 메뉴</button>`, { title }); };
  net.on.data = (id, d) => clientRecv(d);
  net.toHost({ t: 'hello', name: save.name, v: VER });
  menu(`<h2>대기실</h2><p class="line">방장의 응답을 기다리는 중입니다...</p>`, {});
}
const Q = fn => { CQ = CQ.then(fn).catch(e => console.error(e)); };
function clientRecv(d) {
  switch (d.t) {
    case 'ver': return friends(MP.code, '방장과 게임 버전이 다릅니다. 둘 다 새로고침(Ctrl+Shift+R) 후 다시 시도해 주세요.');
    case 'full': return friends('', '방이 가득 찼거나 이미 게임이 시작됐습니다.');
    case 'lobby': MP.lastLobby = d.seats; if (!MP.playing) lobby(d.seats); return;
    case 'start': MP.playing = true; CQ = Promise.resolve(); beginMP(d.seat, d.names); return;
    case 'round': { const tk = SES; return Q(async () => { CFG = d.cfg; M.ri = d.ri; await roundIntro(tk, `ROUND ${d.ri + 1} / ${d.total}`, CFG.sudden ? '체력 2 이하에서 생명 유지 장치가 끊어집니다' : ''); }); }
    case 'ev': { const tk = SES; return Q(async () => { if (tk !== SES) return; KNOWN = d.known.map(v => v ?? undefined); TURN = loc(d.turn); await play(d.evs, tk); if (tk !== SES || d.over) return; scene.turn = TURN; setCtl(TURN === 0 && alive(0)); }); }
    case 'rej': return setCtl(TURN === 0);
    case 'rend': { const tk = SES; return Q(() => showRoundEnd(d.w, d.wins, tk)); }
    case 'mend': return Q(() => { MP.playing = false; matchEndMP(d.wins); });
  }
}
async function showRoundEnd(w, wins, tk) {
  const l = loc(w); scene.turn = -1;
  log(l === 0 ? '당신이 끝까지 살아남았습니다.' : `${sub(l)} 끝까지 살아남았습니다.`, 'hit'); sfx.stinger();
  M.wins = wins; await wait(2600);
}
function matchEndMP(wins) {
  hud(false); setCtl(false);
  const names = MP.names, order = names.map((n, i) => i).sort((a, b) => wins[b] - wins[a]), top = wins[order[0]];
  const champ = order.filter(i => wins[i] === top), me = champ.includes(SEAT);
  menu(`<h2 class="${me ? '' : 'red'}">${me ? '당신이 살아남았습니다' : `${esc(champ.map(i => names[i]).join(', '))} 승리`}</h2>
    <div class="seats">${order.map(i => `<div class="seat"><span>${esc(names[i])}${i === SEAT ? ' (나)' : ''}</span><small>${wins[i]}승</small></div>`).join('')}</div>
    ${MP.isHost ? '<button data-a="room">대기실로</button>' : '<p class="note">방장이 대기실로 돌아가면 다음 판을 할 수 있습니다.</p><button data-a="room">대기실 보기</button>'}
    <button data-a="title">방 나가기</button>`, {
    room: () => { SES++; G = null; if (MP.isHost) { MP.seats = MP.seats.filter(s => s.type !== 'bot' || !s.name.endsWith('(봇)')); lobbyMsg(); } lobby(MP.isHost ? undefined : MP.lastLobby); }, title,
  });
}

// ── 연출 ──
const who = p => p ? NAMES[p] + j(NAMES[p], '은', '는') : '당신은';
const sub = p => p ? NAMES[p] + j(NAMES[p], '이', '가') : '당신이';
const SN = l => l ? '실탄' : '공포탄';
function log(msg, cls = '') {
  const L = $('log'), d = document.createElement('div'); d.className = 'ln ' + cls; d.textContent = msg; L.appendChild(d);
  while (L.children.length > 3) L.firstChild.remove();
}
const say = l => { if (MP) return; log(`“${l}”`, 'opp'); sfx.whisper(); };
function applySnap(sn) { scene.v = { ...sn, max: CFG.hp, sudden: sn.hp.map(h => !!CFG.sudden && h <= 2) }; drawHp(); }
function drawHp() {
  const v = scene.v; if (!v) return;
  const bar = p => Array.from({ length: v.max }, (_, i) => `<b class="${i < v.hp[p] ? (v.sudden[p] ? 'sd' : 'on') : ''}"></b>`).join('');
  const order = [...Array(v.hp.length).keys()].slice(1).concat(0);
  $('hp').innerHTML = order.map(p => `<div class="pl ${v.hp[p] > 0 ? '' : 'out'}"><span>${esc(p ? NAMES[p] : '당신')}</span>${bar(p)}</div>`).join('');
}
async function banner(t, s) {
  const b = $('banner'); b.innerHTML = `<div>${t}</div>${s ? `<small>${s}</small>` : ''}`; b.classList.add('on');
  await wait(1500); b.classList.remove('on'); await wait(450);
}
function updKnown() {
  $('known').innerHTML = KNOWN.map((v, i) => v == null ? '' : `<span class="${v ? 'live' : 'blank'}">${i ? i + 1 + '번째' : '현재'} · ${SN(v)}</span>`).join('');
}
const ANIM = {
  async load(e) {
    const old = scene.v ? scene.v.items : e.snap.items.map(() => []);
    applySnap({ ...e.snap, items: old });
    log(`실탄 ${e.live}발, 공포탄 ${e.blank}발.`, 'sys');
    await scene.loadShells(e.live, e.blank);
    if (e.snap.items.some((a, p) => a.length > (old[p] || []).length)) { log('아이템 상자가 올라옵니다.', 'sys'); await scene.dealItems(old, e.snap.items); }
    applySnap(e.snap);
  },
  async turn(e) { applySnap(e.snap); scene.turn = e.p; if (e.p === 0 || MP) log(e.p === 0 ? '당신의 차례입니다.' : `${NAMES[e.p]}의 차례입니다.`, 'sys'); },
  async skip(e) { applySnap(e.snap); sfx.cuffs(); log(`${who(e.p)} 수갑에 묶여 차례를 건너뜁니다.`, 'sys'); await wait(800); },
  async die(e) {
    applySnap(e.snap); sfx.stinger();
    if (e.p === 0) { log('당신은 쓰러졌습니다. 남은 판을 지켜봅니다.', 'hit'); scene.fx.blackT = .5; }
    else { scene.killSeat(e.p); log(`${sub(e.p)} 쓰러집니다.`, 'hit'); }
    await wait(1200);
  },
  async end(e) { applySnap(e.snap); },
  async shot(e) {
    const b = e.by, t = e.target, self = b === t;
    log(b === 0 ? (self ? '당신은 총구를 자신에게 겨눕니다.' : `당신은 ${NAMES[t]}에게 총구를 겨눕니다.`)
      : self ? `${sub(b)} 총구를 자신에게 겨눕니다.` : t === 0 ? `${sub(b)} 당신에게 총구를 겨눕니다.` : `${sub(b)} ${NAMES[t]}에게 총구를 겨눕니다.`);
    Object.assign(scene.gun, { pose: 1, by: b, target: t, kt: 1 }); scene.look = t === 0 ? 1 : 0;
    await wait(550); sfx.heart(); await wait(500 + Math.random() * 900);
    applySnap({ ...e.snap, sawed: e.sawed });
    if (e.live) {
      sfx.shot(); scene.fx.flash = 1; scene.fx.shake = e.dmg > 1 ? 1.5 : 1; scene.gun.recoil = 1;
      if (t === 0) {
        scene.fx.red = 1; scene.fx.blackT = 1; log(`탕. 당신은 ${e.dmg}의 피해를 입었습니다.`, 'hit');
        await wait(1000); if (e.snap.hp[0] > 0) scene.fx.blackT = 0;
      } else { scene.hitSeat(t, e.dmg); if (e.snap.hp[t] <= 0) scene.killSeat(t); log(`탕. ${NAMES[t]}에게 ${e.dmg}의 피해.`, 'hit'); await wait(700); }
    } else {
      sfx.click(); log(self && b === 0 ? '찰칵. 공포탄입니다. 한 번 더 당신의 차례입니다.' : '찰칵. 공포탄입니다.'); await wait(700);
    }
    scene.gun.kt = 0; scene.look = 0; await wait(380); scene.rack(); applySnap(e.snap);
    if (!MP && Math.random() < .3 && e.snap.hp[0] > 0 && e.snap.hp[1] > 0) say(pick(e.live && t === 1 ? M.opp.hurt : M.opp.taunt));
  },
  async item(e) {
    const W = who(e.by), me = e.by === 0, tn = e.who === 0 ? '당신' : NAMES[e.who] || '';
    scene.float = { k: e.item, p: e.by, t: 0 }; sfx[ISFX[e.item] || 'item'](); applySnap(e.snap);
    let m;
    switch (e.item) {
      case 'magnifier': m = me ? `돋보기로 약실을 들여다봅니다. 현재 탄은 ${SN(e.live)}입니다.` : `${W} 돋보기로 약실을 들여다봅니다.`; break;
      case 'cuffs': m = me ? `${tn}에게 수갑을 채웠습니다.` : `${W} ${tn}에게 수갑을 채웠습니다.`; break;
      case 'saw': m = `${W} 총열을 잘라냅니다. 다음 한 발은 피해가 2배입니다.`; break;
      case 'beer': scene.rack(); m = `${W} 펌프를 당겨 탄을 빼냅니다. 빠져나온 것은 ${SN(e.live)}입니다.`; break;
      case 'cigs': m = e.heal ? `${W} 담배를 피웁니다. 체력 +${e.heal}.` : CFG.sudden && e.snap.hp[e.by] <= 2 ? `${W} 담배를 피우지만, 생명 유지 장치가 끊겨 회복되지 않습니다.` : `${W} 담배를 피웁니다. 회복할 체력이 없습니다.`; break;
      case 'meds': m = e.hurt ? `${W} 약을 삼킵니다. 상한 약이었습니다. 체력 -1.` : e.heal ? `${W} 약을 삼킵니다. 체력 +${e.heal}.` : `${W} 약을 삼키지만 아무 일도 일어나지 않습니다.`; break;
      case 'phone': m = me ? (e.pos != null ? `수화기 너머의 목소리: “${e.pos + 1}번째 탄은... ${SN(e.live)}.”` : '수화기 너머의 목소리: “...안타깝군.”') : `${W} 대포폰에 귀를 기울입니다.`; break;
      case 'inverter': m = `${W} 인버터를 사용합니다. 현재 탄의 극성이 뒤집힙니다.`; break;
      case 'adrenaline': { const n = ITEMS[e.stole].name; m = `${W} 아드레날린을 주사하고 ${tn}의 ${n}${j(n, '을', '를')} 빼앗습니다.`; break; }
    }
    log(m, e.hurt ? 'hit' : '');
    if (e.hurt) { if (me) scene.fx.red = .6; else scene.hitSeat(e.by, 0); }
    await wait(1000);
  },
};

// ── 입력 ──
function canUseL(name) {
  const v = scene.v; if (!v) return false;
  const opps = v.hp.map((h, i) => i).filter(i => i > 0 && v.hp[i] > 0);
  switch (name) {
    case 'saw': return !v.sawed;
    case 'cuffs': return opps.some(i => v.cuffed[i] === 0);
    case 'adrenaline': return opps.some(i => v.items[i].some(n => n !== 'adrenaline' && canUseL(n)));
    default: return true;
  }
}
function setCtl(on) {
  busy = !on; const A = $('actions');
  const opps = scene.v ? scene.v.hp.map((h, i) => i).filter(i => i > 0 && scene.v.hp[i] > 0) : [1];
  A.innerHTML = (MP ? opps.map(i => `<button data-s="${i}">${esc(NAMES[i])} 쏘기</button>`).join('') : '<button data-s="1">상대를 쏜다</button>') + '<button data-s="0">나를 쏜다</button>';
  A.querySelectorAll('button').forEach(b => b.disabled = !on);
  A.classList.toggle('wait', !on);
  scene.dis = on && scene.v ? scene.v.items[0].map(n => !canUseL(n)) : null;
}
$('actions').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b && !b.disabled) doAction({ type: 'shoot', target: +b.dataset.s }); });
function doAction(a) {
  if (busy) return;
  closeTip(); setCtl(false);
  if (MP && !MP.isHost) {
    const g = { ...a }; if (g.type === 'shoot') g.target = glob(g.target); if (g.who != null && g.who >= 0) g.who = glob(g.who);
    MP.net.toHost({ t: 'act', a: g }); return;
  }
  if (!hostAct(0, a)) setCtl(true);
}
const REASON = { saw: '이미 총열이 잘려 있습니다.', cuffs: '수갑을 채울 수 있는 상대가 없습니다.', adrenaline: '빼앗아 쓸 수 있는 아이템이 없습니다.' };
function tip(name, desc, canUse, useLabel = '사용', targets = '') {
  $('tipName').textContent = name; $('tipDesc').textContent = desc; $('tipTargets').innerHTML = targets;
  $('tipUse').classList.toggle('hidden', !useLabel); $('tipUse').disabled = !canUse; $('tipUse').textContent = useLabel || '';
  $('itemTip').classList.remove('hidden');
}
function closeTip() { $('itemTip').classList.add('hidden'); sel = stealFrom = -1; scene.sel = -1; scene.steal = false; }
$('scene').addEventListener('pointerdown', e => {
  initAudio();
  if (busy || !scene.v) return;
  const h = scene.pick(e.clientX, e.clientY); if (!h) return;
  const name = scene.v.items[h.p][h.i];
  if (stealFrom >= 0) {
    if (h.p === 0) return;
    if (name === 'adrenaline' || !canUseL(name)) { log('그 아이템은 빼앗을 수 없습니다.', 'sys'); return; }
    return doAction({ type: 'item', idx: stealFrom, steal: h.i, who: h.p });
  }
  sfx.ui();
  if (h.p === 0) {
    sel = h.i; scene.sel = h.i; const ok = canUseL(name);
    tip(ITEMS[name].name, ok ? ITEMS[name].desc : `${ITEMS[name].desc}\n${REASON[name] || ''}`, ok);
  } else { closeTip(); tip(`${NAMES[h.p]}의 ${ITEMS[name].name}`, ITEMS[name].desc, false, ''); }
});
$('tipUse').onclick = () => {
  if (sel < 0) return; const name = scene.v.items[0][sel], i = sel;
  if (name === 'adrenaline') { stealFrom = i; scene.steal = true; tip('아드레날린', '빼앗을 상대의 아이템을 누르세요.', false, ''); return; }
  if (name === 'cuffs') {
    const t = scene.v.hp.map((h, k) => k).filter(k => k > 0 && scene.v.hp[k] > 0 && scene.v.cuffed[k] === 0);
    if (t.length > 1) return tip('수갑', '누구에게 채울까요?', false, '', t.map(k => `<button data-w="${k}">${esc(NAMES[k])}</button>`).join(''));
    return doAction({ type: 'item', idx: i, who: t[0] });
  }
  doAction({ type: 'item', idx: i });
};
$('tipTargets').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b && sel >= 0) doAction({ type: 'item', idx: sel, who: +b.dataset.w }); });
$('tipCancel').onclick = closeTip;
$('scene').addEventListener('pointermove', e => {
  const hv = $('hover'), h = scene.v && e.pointerType === 'mouse' ? scene.pick(e.clientX, e.clientY) : null;
  if (!h) { hv.classList.add('hidden'); $('scene').style.cursor = ''; return; }
  const n = scene.v.items[h.p][h.i]; if (!n) return;
  hv.textContent = (h.p ? `${NAMES[h.p]}의 ` : '') + ITEMS[n].name; hv.style.left = e.clientX + 14 + 'px'; hv.style.top = e.clientY + 12 + 'px';
  hv.classList.remove('hidden'); $('scene').style.cursor = 'pointer';
});
$('btnPause').onclick = () => {
  if (!M) return; initAudio(); if (!MP) paused = true;
  const pm = () => menu(`<h2>${MP ? '메뉴' : '일시 정지'}</h2><button data-a="go">계속하기</button><button data-a="snd">${sndLabel()}</button><button data-a="quit">${MP ? '방 나가기' : '포기하고 나가기'}</button>`,
    { go: () => { paused = false; scr.innerHTML = ''; }, esc: () => { paused = false; scr.innerHTML = ''; }, snd: () => { toggleSnd(); pm(); }, quit: title });
  pm();
};
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') scr.querySelector(e.target.id === 'code' ? '[data-a=join]' : '[data-a=host]')?.click(); return; }
  if (!scr.innerHTML && !busy && /^[1-5]$/.test(e.key)) $('actions').querySelectorAll('button')[+e.key - 1]?.click();
  if (e.key === 'Escape') { if (scr.innerHTML && acts.esc) acts.esc(); else if (M && !scr.innerHTML) $('btnPause').click(); }
});

const room = new URLSearchParams(location.search).get('room');
if (room) { title(); friends(room.toUpperCase().slice(0, 5)); } else title();
