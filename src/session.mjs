import { translationSupported } from '../public/languages.js';
import { randomUUID } from 'node:crypto';
import { defaults, sanitizeSettings } from './state.mjs';
import { WorkLane } from './scheduler.mjs';
import { ChatWindow } from './chat.mjs';
import { BroadcastState } from './broadcast.mjs';
import { phrases } from './fixtures.mjs';

const modes = ['captions', 'context', 'describe', 'chorus', 'chaos'];
const blankCaption = () => ({ id: '', source: '', translation: '', final: false, origin: 'microphone' });

/** One owner/session. No module-global state, credentials, timers or provider instances. */
export class StreamSession {
  constructor({ streamerId, provider, settings = {}, now = Date.now, onChange = () => {}, createLane = options => new WorkLane(options) }) {
    this.streamerId = streamerId; this.provider = provider; this.now = now; this.onChange = onChange;
    this.base = sanitizeSettings(settings, structuredClone(defaults)); this.effect = null;
    this.events = []; this.seenActions = new Set(); this.lastAction = -Infinity;
    this.chat = new ChatWindow(now); this.twitch = { status: 'disconnected', channel: '', error: '' };
    this.available = { openai: false, twitch: false, twitchApp: false };
    this.usage = { requests: 0, inputTokens: 0, outputTokens: 0 };
    this.lanes = Object.fromEntries(['translation', 'audio', 'vision', 'chorus', 'chaos'].map(name => [name,
      createLane({ concurrency: name === 'translation' ? 2 : 1, capacity: name === 'translation' ? 4 : 1, now, onChange })]));
    this.voice = new BroadcastState({ now });
    this.begin('demo');
  }
  context() { return { streamerId: this.streamerId, sessionId: this.sessionId }; }
  settings() {
    if (!this.effect || this.effect.until <= this.now()) return this.base;
    return { ...this.base, [this.effect.kind === 'mode' ? 'preset' : this.effect.kind]: this.effect.value };
  }
  cancelLanes() { for (const lane of Object.values(this.lanes)) lane.cancel(); }
  begin(mode, provider = 'browser') {
    this.voice.reset(); this.cancelLanes(); this.sessionId = randomUUID(); this.captureId = mode === 'live' ? randomUUID() : '';
    this.effect = null; const connected = this.chat.connected; this.chat.reset(); this.chat.connected = connected;
    this.mode = mode; this.captureActive = mode === 'live'; this.captureHeartbeat = this.now(); this.started = this.now(); this.playing = mode === 'demo'; this.phrase = 0;
    this.segments = new Map(); this.display = null; this.draft = null; this.translationGeneration = 0; this.processorGeneration = 0;
    this.secondary = null; this.candidates = []; this.recentObservations = []; this.recentCues = []; this.lastSecondary = -Infinity;
    this.lastChorus = -Infinity; this.lastChaos = -Infinity; this.chat.lastFingerprint = ''; this.previousFrame = null;
    this.microphone = { status: mode === 'live' ? 'starting' : 'idle', provider, error: '' };
    this.camera = { status: 'idle', error: '' };
    /** @type {Record<string, {status:string,error:string,retryAt?:number}>} */
    this.status = Object.fromEntries(Object.keys(this.lanes).map(name => [name, { status: 'idle', error: '' }]));
    if (mode === 'demo') this.showDemo();
    this.addEvent(mode === 'live' ? 'Live session started' : 'Sample captions loaded', mode === 'live' ? 'system' : 'demo');
    return { ...this.context(), captureId: this.captureId };
  }
  owns(input) { return input.streamerId === this.streamerId && input.sessionId === this.sessionId && input.captureId === this.captureId && this.mode === 'live' && this.captureActive; }
  heartbeat() { this.captureHeartbeat = this.now(); }
  stopCapture() {
    this.voice.reset(); this.captureActive = false; this.cancelLanes(); this.resetOptional(); this.effect = null;
    this.microphone.status = this.microphone.status === 'error' ? 'error' : 'stopped';
    this.camera.status = 'stopped'; this.previousFrame = null; this.onChange();
  }
  addEvent(text, origin = 'system') { this.events.unshift({ id: randomUUID(), text, origin, at: this.now() }); this.events = this.events.slice(0, 30); this.onChange(); }
  setSettings(input) {
    this.voice.cancel();
    const previous = this.settings(); this.effect = null; this.base = sanitizeSettings(input, this.base);
    if (previous.language !== this.base.language) {
      this.translationGeneration++; this.lanes.translation.cancel();
      for (const segment of this.segments.values()) { segment.translation = ''; segment.translationStatus = 'idle'; }
      if (this.display) this.display = this.segments.get(this.display.id) || null;
      const latest = [...this.segments.values()].filter(item => item.final).sort((a, b) => b.sequence - a.sequence)[0];
      if (latest && this.mode === 'live') this.translate(latest);
    }
    if (['preset', 'secondaryLanguage', 'chorusTone', 'cameraEnabled'].some(key => previous[key] !== this.base[key])) this.resetOptional();
    if (this.mode === 'demo') this.showDemo(); this.onChange(); return this.base;
  }
  resetOptional() {
    this.processorGeneration++; this.previousFrame = null; this.recentObservations = []; this.secondary = null; this.candidates = [];
    for (const name of ['audio', 'vision', 'chorus', 'chaos']) { this.lanes[name].cancel(); this.status[name] = { status: 'idle', error: '' }; }
    this.lastChorus = -Infinity; this.lastChaos = -Infinity; this.chat.lastFingerprint = '';
  }
  enabled(lane) {
    const preset = this.settings().preset;
    return lane === 'chorus' ? ['context', 'chorus', 'chaos'].includes(preset)
      : lane === 'chaos' ? preset === 'chaos' : ['context', 'describe', 'chaos'].includes(preset);
  }
  acceptSpeech(input) {
    if (!this.owns(input) || !Number.isInteger(input.sequence) || input.sequence < 0 || !Number.isInteger(input.revision) || input.revision < 0 || typeof input.segmentId !== 'string' || input.segmentId.length > 160) return false;
    const source = String(input.text || '').trim().slice(0, 1000); if (!source) return false;
    const previous = this.segments.get(input.segmentId);
    if (previous && (previous.sequence !== input.sequence || previous.revision >= input.revision || (previous.final && (!input.final || previous.source === source)))) return false;
    const segment = { id: input.segmentId, sequence: input.sequence, revision: input.revision, source, final: input.final === true,
      translation: '', translationStatus: 'idle', at: this.now(), origin: 'microphone', session: this.sessionId, expiresAt: this.now() + (input.final ? this.settings().hold * 1000 : 12000) };
    this.segments.set(segment.id, segment);
    while (this.segments.size > 200) this.segments.delete(this.segments.keys().next().value);
    if (!segment.final) { if (!this.draft || segment.sequence >= this.draft.sequence) this.draft = segment; }
    else {
      if (this.draft?.id === segment.id) this.draft = null;
      if (this.display?.id === segment.id) this.display = segment;
      if (!this.display || this.display.expiresAt <= this.now() || !this.display.translation || this.settings().display === 'source') {
        if (!this.display || segment.sequence >= this.display.sequence) this.display = segment;
      }
      this.translate(segment);
    }
    this.onChange(); return true;
  }
  translate(segment) {
    if (!this.available.openai) { segment.translationStatus = 'unconfigured'; this.status.translation = { status: 'unconfigured', error: 'Connect OpenAI for live translation.' }; return; }
    const context = this.context(), generation = this.translationGeneration, language = this.settings().language;
    const valid = () => this.sessionId === context.sessionId && generation === this.translationGeneration && this.segments.get(segment.id) === segment;
    segment.translationStatus = 'queued';
    this.lanes.translation.enqueue({ id: `${context.sessionId}:${segment.id}:${segment.revision}:${generation}`, at: this.now(),
      run: signal => { if (!valid()) throw new Error('Obsolete translation.'); segment.translationStatus = 'translating'; return this.provider.translate(context, segment.source, language, signal); },
      done: text => {
        if (!valid()) return;
        segment.translation = text; segment.translationStatus = 'ready'; segment.expiresAt = this.now() + this.settings().hold * 1000;
        if (!this.display || segment.sequence >= this.display.sequence) this.display = segment;
        this.status.translation = { status: 'ready', error: '' }; this.onChange();
      }, late: text => { if (valid()) { segment.translation = text; segment.translationStatus = 'ready:history-only'; this.onChange(); } }, discard: reason => { if (valid()) { segment.translationStatus = `skipped:${reason}`; this.onChange(); } },
      error: error => { if (valid()) { segment.translationStatus = 'error'; this.status.translation = { status: 'error', error: error.message }; this.onChange(); } }
    });
  }
  ingestMedia(lane, input) {
    if (!this.owns(input) || !this.enabled(lane) || !this.available.openai) return false;
    if (!['audio', 'vision'].includes(lane)) return false;
    const at = Number.isFinite(input.capturedAt) ? input.capturedAt : this.now();
    if (this.now() - at > 8000 || at > this.now() + 1000) return false;
    const context = this.context(), generation = this.processorGeneration, language = this.settings().secondaryLanguage;
    let payload;
    if (lane === 'vision') {
      if (!this.settings().cameraEnabled || typeof input.image !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.image) || input.image.length > 700000) return false;
      payload = this.previousFrame ? [this.previousFrame, input.image] : [input.image]; this.previousFrame = input.image;
      if (payload.length < 2) return true;
    } else {
      if (typeof input.audio !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(input.audio) || input.audio.length > 500000) return false;
      payload = input.audio;
    }
    this.runOptional(lane, `${at}:${randomUUID()}`, at, signal => this.provider[lane](context, payload, language, signal), context, generation, 'observation');
    return true;
  }
  runOptional(lane, id, at, run, context = this.context(), generation = this.processorGeneration, kind = 'chorus') {
    const valid = () => context.sessionId === this.sessionId && generation === this.processorGeneration && this.mode === 'live' && this.enabled(lane);
    if ((this.status[lane].retryAt || 0) > this.now()) return;
    this.lanes[lane].enqueue({ id, at, run: signal => {
      if (!valid()) throw new Error('Obsolete analysis.');
      this.status[lane] = { status: 'analyzing', error: '' }; return run(signal);
    }, done: result => {
      if (!valid()) return; this.status[lane] = { status: 'ready', error: '' };
      if (result) this.offerCue({ id, kind, text: result.text, event: result.event, evidence: kind === 'observation' ? [id] : result.evidence, observedAt: at,
        expiresAt: at + 8000, language: this.settings().secondaryLanguage, origin: 'live', ...context });
      this.onChange();
    }, error: error => { if (valid()) { this.status[lane] = { status: 'error', error: error.message, retryAt: this.now() + 15000 }; this.onChange(); } } });
  }
  offerCue(cue) {
    if (cue.sessionId !== this.sessionId || cue.streamerId !== this.streamerId || cue.expiresAt <= this.now()) return false;
    if (cue.kind === 'observation') this.recentObservations = [...this.recentObservations.filter(item => item.expiresAt > this.now()), cue].slice(-3);
    const signature = cue.kind === 'observation' ? cue.event : cue.text.toLowerCase();
    if (this.recentCues.some(item => item.signature === signature && this.now() - item.at < 20000)) return false;
    this.candidates = this.candidates.filter(item => item.kind !== cue.kind); this.candidates.push(cue); this.presentCue(); return true;
  }
  presentCue() {
    const now = this.now(), preset = this.settings().preset;
    this.candidates = this.candidates.filter(cue => cue.expiresAt > now && (preset === 'chaos' ? cue.kind === 'fiction' : preset === 'describe' ? cue.kind === 'observation' : preset === 'chorus' ? cue.kind === 'chorus' : preset === 'context'));
    if (now - this.lastSecondary < 6000 || !this.candidates.length) return;
    this.candidates.sort((a, b) => Number(b.kind === 'observation') - Number(a.kind === 'observation') || b.observedAt - a.observedAt);
    this.secondary = { ...this.candidates.shift(), visibleUntil: now + 6000 }; this.lastSecondary = now;
    this.recentCues.push({ signature: this.secondary.kind === 'observation' ? this.secondary.event : this.secondary.text.toLowerCase(), at: now });
    this.recentCues = this.recentCues.filter(item => now - item.at < 20000).slice(-20); this.onChange();
  }
  action(action) {
    if (!action.id || this.seenActions.has(action.id)) return { applied: false, message: 'Duplicate action.' };
    this.seenActions.add(action.id); if (this.seenActions.size > 1000) this.seenActions.delete(this.seenActions.values().next().value);
    if (action.kind === 'reset') {
      if (!action.moderator) return { applied: false, message: 'Moderator permission required.' };
      this.voice.cancel(); this.effect = null; this.resetOptional(); this.onChange(); return { applied: true };
    }
    const settings = this.settings();
    if (action.kind === 'voice') {
      if (!this.base.voiceEnabled || (!action.moderator && !this.base.voiceViewerEnabled)) return { applied: false, message: 'Chinese voice is not enabled for viewers.' };
      if (!this.captureActive || this.microphone.status !== 'listening' || !this.available.openai) return { applied: false, message: 'Start a live microphone with your OpenAI key first.' };
      if (action.value !== 'zh' || !this.voice.connected() || this.voice.effect) return { applied: false, message: 'Chinese voice needs a connected OBS audio source and no active voice effect.' };
    } else if (action.kind === 'language') {
      if (!action.moderator || !translationSupported(action.value)) return { applied: false, message: 'Moderator permission required.' };
    } else if (action.kind === 'mode') {
      if (!modes.includes(action.value) || (!action.moderator && !this.base.allowedModes.includes(action.value))) return { applied: false, message: 'This mode is not enabled for viewers.' };
      if (this.mode === 'live' && action.value !== 'captions' && !this.available.openai) return { applied: false, message: 'This mode needs an OpenAI connection.' };
      if (this.mode === 'live' && action.value === 'chorus' && !this.chat.connected) return { applied: false, message: 'Chat Chorus needs a Twitch connection.' };
    } else if (action.kind !== 'style' || !['spotlight', 'paper', 'comic'].includes(action.value)) return { applied: false, message: 'Unknown effect.' };
    const remaining = settings.cooldown * 1000 - (this.now() - this.lastAction);
    if (remaining > 0) return { applied: false, remaining: Math.ceil(remaining / 1000), message: 'Audience cooldown is active.' };
    this.lastAction = this.now();
    if (action.kind === 'voice') this.voice.start(action.value);
    else if (action.kind === 'language') this.setSettings({ language: action.value });
    else { this.effect = { kind: action.kind, value: action.value, until: this.now() + 20000 }; this.resetOptional(); }
    this.addEvent(`${action.actor || 'Viewer'} activated ${action.value}${action.kind === 'language' ? '' : ' for 20 seconds'}`, action.origin);
    if (this.mode === 'demo') this.showDemo(); return { applied: true };
  }
  showDemo() {
    const phrase = phrases[this.phrase % phrases.length]; const settings = this.settings();
    this.demoCaption = { id: `demo-${this.phrase}`, source: phrase.en, translation: phrase[settings.language] || '', final: true, emphasis: phrase.emphasis, origin: 'demo' };
    const texts = {
      en: { observation: '(laughing)', chorus: 'Chat has seventeen plans. None of them agree.', fiction: '(negotiating with gravity)' },
      zh: { observation: '（正在笑）', chorus: '聊天室有十七个计划，但谁也不同意谁。', fiction: '（正在和重力谈判）' },
      es: { observation: '(riendo)', chorus: 'El chat tiene diecisiete planes. Ninguno coincide.', fiction: '(negociando con la gravedad)' },
      ja: { observation: '（笑っている）', chorus: 'チャットには17の案。でも誰も同意しない。', fiction: '（重力と交渉中）' }
    };
    const kind = settings.preset === 'chaos' ? 'fiction' : settings.preset === 'chorus' || (settings.preset === 'context' && this.phrase % 2) ? 'chorus' : 'observation';
    this.demoCue = settings.preset === 'captions' || !texts[settings.secondaryLanguage] ? null : { id: `sample-${this.phrase}`, kind, text: texts[settings.secondaryLanguage][kind], language: settings.secondaryLanguage, origin: 'demo' };
    this.demoNext = this.now() + settings.hold * 1000; this.onChange();
  }
  tick() {
    const now = this.now(); this.voice.tick();
    if (this.effect && this.effect.until <= now) { this.effect = null; this.resetOptional(); if (this.mode === 'demo') this.showDemo(); this.onChange(); }
    if (this.mode === 'demo') { if (this.playing && now >= this.demoNext) { this.phrase++; this.showDemo(); } return; }
    if (this.captureActive && now - this.captureHeartbeat > 30000) this.stopCapture();
    if (!this.captureActive) return;
    this.presentCue();
    if (!this.available.openai) return;
    const settings = this.settings();
    if (this.enabled('chorus') && this.chat.connected && now - this.lastChorus >= 8000) {
      const evidence = this.chat.evidence(), fingerprint = evidence.map(item => item.id).join(','), quiet = this.chat.quiet();
      if (quiet || (fingerprint !== this.chat.lastFingerprint && new Set(evidence.map(item => item.author)).size >= 3)) {
        this.lastChorus = now; this.chat.lastFingerprint = fingerprint;
        this.runOptional('chorus', `chorus:${now}`, now, signal => this.provider.chorus(this.context(), evidence, settings.secondaryLanguage, settings.chorusTone, signal, quiet));
      }
    }
    if (this.enabled('chaos') && now - this.lastChaos >= 8000) {
      this.lastChaos = now;
      const recent = { speech: [...this.segments.values()].filter(item => item.final).slice(-3).map(item => item.source), chat: this.chat.evidence().slice(-12), observations: this.recentObservations.filter(item => item.expiresAt > now).map(item => item.text) };
      this.runOptional('chaos', `chaos:${now}`, now, signal => this.provider.chaos(this.context(), recent, settings.secondaryLanguage, signal), this.context(), this.processorGeneration, 'fiction');
    }
  }
  overlay() {
    const now = this.now(), settings = this.settings();
    const display = this.display?.expiresAt > now ? this.display : null;
    const draft = this.draft?.expiresAt > now && (!display || this.draft.sequence > display.sequence) ? this.draft : null;
    const caption = this.mode === 'demo' ? this.demoCaption : display || draft || blankCaption();
    return { version: 2, ...this.context(), session: this.sessionId, mode: this.mode, settings: { style: settings.style, display: settings.display, fontSize: settings.fontSize, position: settings.position, backplate: settings.backplate, emphasis: settings.emphasis, reducedMotion: settings.reducedMotion, language: settings.language, preset: settings.preset, secondaryPosition: settings.secondaryPosition, chaosPlacement: settings.chaosPlacement },
      caption, draft: this.mode === 'live' && display && draft ? draft : null,
      secondary: this.mode === 'demo' ? this.demoCue : this.secondary?.visibleUntil > now ? this.secondary : null,
      voice: this.voice.snapshot(), effect: this.effect, microphone: this.microphone };
  }
  processorStatus() {
    return Object.fromEntries(Object.entries(this.status).map(([lane, state]) => {
      if (lane === 'translation') return [lane, state];
      const unavailable = this.mode !== 'live' || !this.captureActive ? 'not running'
        : !this.enabled(lane) ? 'disabled for this mode'
        : !this.available.openai ? 'needs OpenAI key'
        : lane === 'chorus' && !this.chat.connected ? 'needs Twitch connection'
        : lane === 'vision' && !this.settings().cameraEnabled ? 'camera disabled'
        : lane === 'vision' && this.camera.status !== 'listening' ? 'needs camera input'
        : lane === 'audio' && this.microphone.status !== 'listening' ? 'needs microphone input' : '';
      return [lane, unavailable ? { status: unavailable, error: '' } : state];
    }));
  }
  snapshot() {
    return { ...this.overlay(), settings: this.settings(), baseSettings: this.base, available: this.available, started: this.started, playing: this.playing,
      transcript: [...this.segments.values()].filter(item => item.final).sort((a, b) => a.sequence - b.sequence),
      events: this.events, twitch: this.twitch, camera: this.camera, processors: this.processorStatus(),
      translation: { ...this.status.translation, latency: this.lanes.translation.metrics.latency },
      metrics: Object.fromEntries(Object.entries(this.lanes).map(([name, lane]) => [name, lane.snapshot()])), usage: this.usage,
      styleUntil: this.effect?.until || 0 };
  }
  close() { this.voice.reset(); this.cancelLanes(); this.sessionId = randomUUID(); this.captureId = ''; this.mode = 'stopped'; }
}
