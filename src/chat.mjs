/** Bounded evidence, not a transcript of one prolific viewer. */
export class ChatWindow {
  constructor(now = Date.now) { this.now = now; this.reset(); }
  reset() { this.messages = []; this.activity = []; this.started = this.now(); this.connected = false; this.quietSince = 0; this.lastQuiet = 0; this.lastFingerprint = ''; }
  add(message) {
    if (!message.id || !message.author || !message.text || this.messages.some(item => item.id === message.id)) return;
    const at = this.now();
    this.messages.push({ id: String(message.id), author: String(message.author), text: String(message.text).slice(0, 500), at });
    this.activity.push({ at, author: String(message.author) }); this.prune();
  }
  remove(id) { this.messages = this.messages.filter(item => item.id !== id); }
  prune() {
    const now = this.now(); this.messages = this.messages.filter(item => item.at >= now - 20000).slice(-200);
    this.activity = this.activity.filter(item => item.at >= now - 300000).slice(-10000);
  }
  evidence() {
    this.prune(); const counts = new Map(); const seen = new Set();
    return this.messages.filter(item => {
      const key = item.author + ':' + item.text.toLowerCase().trim();
      if (seen.has(key) || (counts.get(item.author) || 0) >= 3) return false;
      seen.add(key); counts.set(item.author, (counts.get(item.author) || 0) + 1); return true;
    });
  }
  quiet() {
    const now = this.now(); this.prune();
    if (!this.connected || now - this.started < 120000) { this.quietSince = 0; return false; }
    const historical = this.activity.filter(item => item.at < now - 40000);
    if (new Set(historical.map(item => item.author)).size < 3) { this.quietSince = 0; return false; }
    const baseline = historical.length / Math.max(1, (Math.min(now - this.started, 300000) - 40000) / 20000);
    const current = this.activity.filter(item => item.at >= now - 20000).length;
    if (baseline < 5 || current > baseline * .2) { this.quietSince = 0; return false; }
    if (!this.quietSince) this.quietSince = now;
    if (now - this.quietSince < 40000 || (this.lastQuiet && now - this.lastQuiet < 60000)) return false;
    this.lastQuiet = now; return true;
  }
}
