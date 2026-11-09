// Tiny relay client: hello → welcome, state at 5 Hz, seats, says, fx. Falls back to offline mode.
export class Net {
  constructor(cfg) {
    this.cfg = cfg; this.ws = null; this.id = 0; this.online = false; this.offset = 0; this.handlers = {};
    this.retry = 0; this.hello = null; this.closedByUser = false;
  }
  on(t, fn) { this.handlers[t] = fn; return this; }
  emit(t, d) { this.handlers[t] && this.handlers[t](d); }
  url() {
    const s = this.cfg.server;
    if (!s || s === 'off') return null;
    if (s !== 'auto') return s;
    if (!/^https?:$/.test(location.protocol)) return null;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }
  now() { return Date.now() + this.offset; } // server-aligned clock
  connect(hello) {
    this.hello = hello; const url = this.url();
    if (!url) { this.emit('status', 'offline'); return; }
    let ws;
    try { ws = new WebSocket(url); } catch { this.emit('status', 'offline'); return; }
    this.ws = ws;
    const failT = setTimeout(() => { if (!this.online) { try { ws.close(); } catch {} } }, 5000);
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', ...hello })); this.ping(); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { clearTimeout(failT); this.id = m.id; this.online = true; this.retry = 0; this.offset = m.now - Date.now(); this.emit('status', 'online'); }
      if (m.t === 'pong') { const rtt = Date.now() - m.c; if (rtt < 2000) { const off = m.s + rtt / 2 - Date.now(); this.offset = this.samples ? this.offset * 0.7 + off * 0.3 : off; this.samples = (this.samples || 0) + 1; } return; }
      this.emit(m.t, m);
    };
    ws.onclose = () => {
      clearTimeout(failT); const was = this.online; this.online = false; this.ws = null;
      this.emit('status', was ? 'reconnecting' : 'offline'); this.emit('reset');
      if (this.closedByUser) return;
      const wait = Math.min(15000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.connect(this.hello), wait);
    };
    ws.onerror = () => {};
    clearInterval(this.pingT); this.pingT = setInterval(() => this.ping(), 10000);
  }
  ping() { this.send({ t: 'ping', c: Date.now() }); }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
}
