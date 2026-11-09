// P2P 연결 (PeerJS) — 방장이 판정, 참가자는 행동만 보냄
const PREFIX = 'liveround-v1-';
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code5 = () => Array.from({ length: 5 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
// 테스트용: ?ps=host:port 로 자체 시그널 서버 지정 가능
function opts() {
  const ps = new URLSearchParams(location.search).get('ps'); if (!ps) return {};
  const [host, port] = ps.split(':'); return { host, port: +port || 9000, path: '/', secure: false };
}

export class Net {
  constructor() { this.peer = null; this.conns = new Map(); this.conn = null; this.on = {}; this.isHost = false; }
  emit(t, ...a) { this.on[t]?.(...a); }
  host() {
    return new Promise((res, rej) => {
      const P = window.Peer || window.peerjs?.Peer; if (!P) return rej(new Error('nolib'));
      const code = code5(), p = this.peer = new P(PREFIX + code, opts());
      p.on('open', () => { this.code = code; this.isHost = true; res(code); });
      p.on('error', e => { if (!this.code) rej(e); });
      p.on('connection', c => {
        c.on('open', () => this.conns.set(c.peer, c));
        c.on('data', d => this.emit('data', c.peer, d));
        c.on('close', () => { if (this.conns.delete(c.peer)) this.emit('leave', c.peer); });
        c.on('error', () => { if (this.conns.delete(c.peer)) this.emit('leave', c.peer); });
      });
      p.on('disconnected', () => { try { p.reconnect(); } catch { } });
    });
  }
  join(code) {
    return new Promise((res, rej) => {
      const P = window.Peer || window.peerjs?.Peer; if (!P) return rej(new Error('nolib'));
      const p = this.peer = new P(undefined, opts()); let done = false;
      const fail = e => { if (!done) { done = true; rej(e); } };
      p.on('error', e => { fail(e); if (done && e.type === 'peer-unavailable') this.emit('hostlost'); });
      p.on('open', () => {
        const c = this.conn = p.connect(PREFIX + code.toUpperCase(), { reliable: true });
        const to = setTimeout(() => fail(new Error('timeout')), 12000);
        c.on('open', () => { clearTimeout(to); done = true; res(); });
        c.on('data', d => this.emit('data', 'host', d));
        c.on('close', () => this.emit('hostlost'));
      });
    });
  }
  send(id, m) { const c = this.conns.get(id); if (c && c.open) c.send(m); }
  toHost(m) { if (this.conn && this.conn.open) this.conn.send(m); }
  close() { this.on = {}; try { this.peer?.destroy(); } catch { } this.peer = null; this.conns.clear(); this.conn = null; }
}
