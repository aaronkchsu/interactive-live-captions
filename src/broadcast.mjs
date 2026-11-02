import { voiceSupported } from '../public/voice-languages.js';
import { randomUUID } from 'node:crypto';

/** Local signaling and streamer-controlled and timed dubbing lifecycles. Media travels peer-to-peer to OBS. */
export class BroadcastState {
  constructor({ now = Date.now } = {}) { this.now = now; this.receiver = null; this.effect = null; this.lastError = ''; this.tone = null; }
  reset() { this.receiver = null; this.effect = null; this.tone = null; this.lastError = ''; }
  connected() { return !!this.receiver && this.receiver.until > this.now() && this.receiver.ready; }
  claim({ clientId, sdp }) {
    if (typeof clientId !== 'string' || clientId.length > 100 || typeof sdp !== 'string' || !sdp.startsWith('v=0') || sdp.length > 100000) throw new Error('Invalid audio receiver offer.');
    if (this.receiver?.until > this.now() && this.receiver.clientId !== clientId) throw new Error('Another audio source is connected. Close duplicate Voice Box audio sources, then retry.');
    this.cancel();
    this.receiver = { clientId, id: randomUUID(), token: randomUUID(), offer: sdp, answer: '', ready: false, until: this.now() + 10000 };
    return { token: this.receiver.token, id: this.receiver.id };
  }
  poll({ token, ready }) {
    if (!this.receiver || token !== this.receiver.token || this.receiver.until <= this.now()) throw new Error('Audio receiver expired. Reconnecting.');
    this.receiver.until = this.now() + 10000; this.receiver.ready = ready === true;
    if (!this.receiver.ready && this.effect) this.cancel('Audio output disconnected. Normal microphone restored.');
    return { answer: this.receiver.answer, tone: this.tone?.until > this.now() ? this.tone.id : '' };
  }
  release(token) { if (this.receiver?.token === token) { this.receiver = null; this.cancel('Audio output disconnected.'); } }
  offer() { return this.receiver?.until > this.now() && !this.receiver.answer ? { id: this.receiver.id, sdp: this.receiver.offer } : null; }
  answer(id, sdp) {
    if (this.receiver?.id !== id || this.receiver.until <= this.now() || typeof sdp !== 'string' || !sdp.startsWith('v=0') || sdp.length > 100000) throw new Error('Audio connection changed.');
    this.receiver.answer = sdp;
  }
  start(language = 'zh', mode = 'timed', durationSeconds = 20) {
    if (!['timed', 'continuous'].includes(mode)) throw new Error('Unsupported voice mode.');
    if (!voiceSupported(language)) throw new Error('Unsupported voice language.');
    if (!this.connected()) throw new Error('Connect the OBS audio source before starting voice translation.');
    if (this.effect) throw new Error('A voice effect is already running. Stop it before starting another.');
    const durationMs = mode === 'timed' ? Math.round(Math.min(120, Math.max(5, Number.isFinite(durationSeconds) ? durationSeconds : 20)) * 1000) : 0;
    this.lastError = '';
    this.effect = { id: randomUUID(), language, mode, durationMs, phase: 'connecting', requestedAt: this.now(), until: 0, finishBy: 0, text: '', negotiating: false };
    return this.effect.id;
  }
  owns(id) { return !!id && this.effect?.id === id; }
  status({ id, phase, text }) {
    if (!this.owns(id)) return false;
    if (phase === 'active' && this.effect.phase === 'connecting') {
      this.effect.phase = 'active';
      if (this.effect.mode === 'timed') { this.effect.until = this.now() + this.effect.durationMs; this.effect.finishBy = this.effect.until + 5000; }
    } else if (phase === 'renew') {
      if (this.effect.mode !== 'continuous' || this.effect.phase !== 'active' || !this.connected()) return false;
      const language = this.effect.language; this.cancel(); this.start(language, 'continuous');
      return true;
    } else if (phase === 'error') { this.cancel('Translated audio stopped. Normal microphone restored; check your connection and model access.'); return true; }
    else if (phase === 'finished') { this.cancel(); return true; }
    if (typeof text === 'string') this.effect.text = text.slice(-240);
    return true;
  }
  cancel(error = '') { this.effect = null; this.lastError = error; }
  testTone() {
    if (!this.receiver || this.receiver.until <= this.now()) throw new Error('Add the OBS audio source first.');
    this.tone = { id: randomUUID(), until: this.now() + 3000 };
  }
  tick() {
    if (this.receiver && this.receiver.until <= this.now()) { this.receiver = null; this.cancel('Audio output disconnected.'); }
    const effect = this.effect; if (!effect) return;
    if (effect.phase === 'connecting' && this.now() - effect.requestedAt >= 15000) this.cancel('Translated audio could not connect. Your normal microphone is unchanged.');
    else if (effect.phase === 'active' && effect.mode === 'timed' && this.now() >= effect.until) effect.phase = 'draining';
    if (effect.finishBy && this.now() >= effect.finishBy) this.cancel();
  }
  snapshot() {
    const effect = this.effect;
    return { output: this.connected() ? 'connected' : this.receiver?.until > this.now() ? 'waiting for microphone' : 'disconnected',
      error: this.lastError, effect: effect ? { id: effect.id, language: effect.language, mode: effect.mode, durationMs: effect.durationMs, phase: effect.phase, requestedAt: effect.requestedAt, until: effect.until, finishBy: effect.finishBy, text: effect.text } : null };
  }
}
