// Web Audio 합성 사운드 (외부 파일 없음)
let ac, out, nb, muted = false;

export function initAudio() {
  if (!ac) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    ac = new A(); out = ac.createGain(); out.gain.value = muted ? 0 : 0.9; out.connect(ac.destination);
    nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    drone();
  }
  if (ac.state === 'suspended') ac.resume();
}
export function setMuted(m) { muted = m; if (out) out.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.05); }

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(f, dur, o = {}) {
  if (!ac) return;
  const t = ac.currentTime + (o.d || 0), os = ac.createOscillator(), g = ac.createGain();
  os.type = o.type || 'sine'; os.frequency.setValueAtTime(f, t);
  if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  env(g, t, o.a || 0.005, o.g || 0.3, dur); os.connect(g).connect(out); os.start(t); os.stop(t + dur + 0.05);
}
function noise(dur, o = {}) {
  if (!ac) return;
  const t = ac.currentTime + (o.d || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = nb; f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f || 1000, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  f.Q.value = o.q || 0.7; env(g, t, o.a || 0.003, o.g || 0.4, dur);
  s.connect(f).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function drone() {
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  g.gain.value = 0.12; lp.type = 'lowpass'; lp.frequency.value = 140; lp.connect(g).connect(out);
  [41.2, 41.9, 61.7].forEach((f, i) => { const o = ac.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'sine'; o.frequency.value = f; o.connect(lp); o.start(); });
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 60; lfo.connect(lg).connect(lp.frequency); lfo.start();
  const n = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain();
  n.buffer = nb; n.loop = true; bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8; ng.gain.value = 0.025;
  n.connect(bp).connect(ng).connect(out); n.start();
}

export const sfx = {
  ui() { tone(220, 0.08, { type: 'triangle', g: 0.08, f2: 180 }); },
  shot() { noise(1.1, { f: 5000, f2: 120, g: 1 }); tone(80, 0.6, { g: 0.9, f2: 28 }); noise(0.08, { type: 'highpass', f: 3000, g: 0.6 }); },
  click() { noise(0.035, { type: 'highpass', f: 3500, g: 0.5 }); tone(2400, 0.02, { type: 'square', g: 0.06 }); },
  rack() { [0, 0.16].forEach(d => { noise(0.07, { d, type: 'bandpass', f: d ? 1800 : 2600, q: 3, g: 0.7 }); tone(d ? 140 : 180, 0.06, { d, type: 'square', g: 0.06 }); }); },
  heart() { tone(58, 0.18, { g: 0.8, f2: 40 }); tone(52, 0.18, { d: 0.24, g: 0.55, f2: 38 }); },
  shells(n) { for (let i = 0; i < n; i++) tone(1500 + Math.random() * 700, 0.06, { d: i * 0.09, type: 'triangle', g: 0.08 }); },
  drop(n = 1) { for (let i = 0; i < n; i++) { noise(0.08, { d: i * 0.12, f: 900, g: 0.35 }); tone(150, 0.08, { d: i * 0.12, g: 0.15, f2: 80 }); } },
  item() { tone(330, 0.12, { type: 'triangle', g: 0.12, f2: 500 }); },
  glass() { tone(2200, 0.25, { g: 0.08, f2: 1800 }); noise(0.3, { d: 0.05, type: 'bandpass', f: 600, q: 2, g: 0.2 }); },
  puff() { noise(0.6, { f: 500, f2: 200, g: 0.2, a: 0.1 }); },
  zap() { tone(90, 0.3, { type: 'sawtooth', g: 0.15, f2: 900 }); },
  saw() { for (let i = 0; i < 6; i++) noise(0.07, { d: i * 0.08, type: 'bandpass', f: 1400 + i * 90, q: 4, g: 0.4 }); },
  phone() { tone(440, 0.3, { type: 'square', g: 0.03 }); tone(480, 0.3, { type: 'square', g: 0.03 }); tone(440, 0.3, { d: 0.5, type: 'square', g: 0.03 }); },
  cuffs() { [0, 0.1, 0.2].forEach(d => tone(1800 + d * 1500, 0.05, { d, type: 'triangle', g: 0.1 })); },
  whisper() { noise(0.8, { type: 'bandpass', f: 900, f2: 2400, q: 9, g: 0.25, a: 0.2 }); },
  stinger() { [0, 7, 13].forEach(dt => tone(300 + dt, 1.8, { type: 'sawtooth', g: 0.07, f2: 60, a: 0.05 })); noise(1.5, { f: 300, f2: 60, g: 0.3, a: 0.05 }); },
};
