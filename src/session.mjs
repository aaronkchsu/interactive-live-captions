import { voiceSupported } from '../public/voice-languages.js';
import { TrackRuntime } from './track-runtime.mjs';
import { inputPlan, addonPatch } from '../public/track-model.js';
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
    this.lanes = Object.fromEntries(['translation', 'audio', 'vision'].map(name => [name,
      createLane({ concurrency: name === 'translation' ? 2 : 1, capacity: name === 'translation' ? 4 : 1, now, onChange })]));
    this.voice = new BroadcastState({ now });
    this.trackRuntime = new TrackRuntime(this);
    this.begin('demo');
  }
  context() { return { streamerId: this.streamerId, sessionId: this.sessionId }; }
  settings() {
    if (!this.effect || this.effect.until <= this.now()) return this.base;
    return sanitizeSettings(this.effect.patch || { [this.effect.kind === 'mode' ? 'preset' : this.effect.kind]: this.effect.value }, this.base);
  }
  cancelLanes() { for (const lane of Object.values(this.lanes)) lane.cancel(); }
  begin(mode, provider = 'browser') {
    this.voice.reset(); this.cancelLanes(); this.trackRuntime.reset(); this.sessionId = randomUUID(); this.captureId = mode === 'live' ? randomUUID() : '';
    this.effect = null; const connected = this.chat.connected; this.chat.reset(); this.chat.connected = connected;
    this.outputMode = 'running'; this.frozenPresentation = null; this.outputChangedAt = this.now();
    this.mode = mode; this.captureActive = mode === 'live'; this.captureHeartbeat = this.now(); this.started = this.now(); this.playing = mode === 'demo'; this.phrase = 0;
    this.segments = new Map(); this.display = null; this.draft = null; this.translationGeneration = 0; this.processorGeneration = 0;
    this.secondary = null; this.candidates = []; this.recentObservations = []; this.recentCues = []; this.lastSecondary = -Infinity;
    this.lastChorus = -Infinity; this.lastChaos = -Infinity; this.chat.lastFingerprint = ''; this.previousFrame = null;
    this.microphone = { status: mode === 'live' ? 'starting' : 'idle', provider, error: '', failure: null };
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
    this.outputMode = 'running'; this.frozenPresentation = null; this.outputChangedAt = this.now();
    this.voice.reset(); this.captureActive = false; this.cancelLanes(); this.resetOptional(); this.effect = null;
    this.microphone.status = this.microphone.status === 'error' ? 'error' : 'stopped';
    this.camera.status = 'stopped'; this.previousFrame = null; this.onChange();
  }
  addEvent(text, origin = 'system') { this.events.unshift({ id: randomUUID(), text, origin, at: this.now() }); this.events = this.events.slice(0, 30); this.onChange(); }
  setSettings(input) {
    const previous = this.settings(); this.effect = null; this.base = sanitizeSettings(input, this.base);
    // Caption/design edits must not switch off the streamer's ongoing audio.
    if (this.voice.effect?.mode !== 'continuous' || !this.base.voiceEnabled || previous.voiceLanguage !== this.base.voiceLanguage) this.voice.cancel();
    this.reconcileWork(previous);
    if (this.mode === 'demo') this.showDemo(); this.onChange(); return this.base;
  }
  reconcileWork(previous) {
    const next = this.settings(), before = inputPlan(previous), after = inputPlan(next);
    if (JSON.stringify(before.languages) !== JSON.stringify(after.languages)) {
      this.translationGeneration++; this.lanes.translation.cancel();
      for (const segment of this.segments.values()) { segment.translation = ''; segment.translations = {}; segment.translationStatus = 'idle'; }
      const latest = [...this.segments.values()].filter(item => item.final).sort((a,b) => b.sequence - a.sequence)[0];
      if (latest && this.mode === 'live' && this.now() - latest.at < 8000) this.translate(latest);
    }
    const content = settings => JSON.stringify(Object.values(settings.tracks).map(({ design, ...track }) => track));
    if (content(previous) !== content(next)) this.resetOptional();
    if (before.chat !== after.chat) { const connected = this.chat.connected; this.chat.reset(); this.chat.connected = connected; }
  }
  clearEffect() {
    const previous = this.effect ? sanitizeSettings(this.effect.patch || { [this.effect.kind === 'mode' ? 'preset' : this.effect.kind]: this.effect.value }, this.base) : this.base;
    this.effect = null; this.reconcileWork(previous); if (this.mode === 'demo') this.showDemo(); this.onChange();
  }
  resetOptional() {
    this.trackRuntime.reset();
    this.processorGeneration++; this.previousFrame = null; this.recentObservations = []; this.secondary = null; this.candidates = [];
    for (const name of ['audio', 'vision']) { this.lanes[name].cancel(); this.status[name] = { status: 'idle', error: '' }; }
    this.lastChorus = -Infinity; this.lastChaos = -Infinity; this.chat.lastFingerprint = '';
  }
  removeChat(id) {
    if (id) this.chat.remove(id);
    else { const connected = this.chat.connected; this.chat.reset(); this.chat.connected = connected; }
    // A pending summary must not publish evidence that a moderator removed.
    if (inputPlan(this.settings()).chat) this.trackRuntime.reset();
    this.onChange();
  }
  enabled(lane) {
    const plan = inputPlan(this.settings());
    return lane === 'vision' ? plan.camera : lane === 'audio' ? plan.audio : lane === 'chorus' ? plan.chat : false;
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
  translate(segment) { this.trackRuntime.translate(segment); }
  ingestMedia(lane, input) {
    if (!this.owns(input) || !this.enabled(lane) || !this.available.openai) return false;
    if (!['audio', 'vision'].includes(lane)) return false;
    const at = Number.isFinite(input.capturedAt) ? input.capturedAt : this.now();
    if (this.now() - at > 8000 || at > this.now() + 1000) return false;
    const context = this.context(), generation = this.processorGeneration, language = 'en';
    let payload;
    if (lane === 'vision') {
      if (typeof input.image !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.image) || input.image.length > 700000) return false;
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
      if (result) this.trackRuntime.observe(result, id, at, lane);
      this.onChange();
    }, error: error => { if (valid()) { this.status[lane] = { status: 'error', error: error.message, retryAt: this.now() + 15000 }; this.onChange(); } } });
  }
  action(action) {
    if (!action.id || this.seenActions.has(action.id)) return { applied: false, message: 'Duplicate action.' };
    this.seenActions.add(action.id); if (this.seenActions.size > 1000) this.seenActions.delete(this.seenActions.values().next().value);
    if (action.kind === 'reset') {
      if (!action.moderator) return { applied: false, message: 'Moderator permission required.' };
      if (this.voice.effect?.mode !== 'continuous') this.voice.cancel(); this.clearEffect(); return { applied: true };
    }
    const settings = this.settings();
    if (action.kind === 'addon') {
      const addon = this.base.addons.find(a => a.id === action.value);
      if (!addon?.enabled || (!action.moderator && addon.trigger === 'subscription' && action.origin !== 'subscription')) return { applied: false, message: 'This add-on is not enabled for this trigger.' };
      if (!this.base.tracks[addon.target].enabled) return { applied: false, message: 'Enable the target track first.' };
      if (this.now() - this.lastAction < settings.cooldown * 1000) return { applied: false, message: 'Audience cooldown is active.' };
      this.lastAction = this.now(); const patch = addonPatch(addon);
      if (addon.persistent) this.setSettings(patch);
      else { this.effect = { kind: 'addon', value: addon.name, patch, until: this.now() + addon.duration * 1000 }; this.reconcileWork(settings); }
      this.addEvent(`${action.actor || 'Viewer'} activated ${addon.name}${addon.persistent ? ' · saved' : ` for ${addon.duration} seconds`}`, action.origin);
      return { applied: true, persisted: addon.persistent };
    }
    if (action.kind === 'style' && !action.moderator && !this.base.viewerStyles) return { applied: false, message: 'Viewer style commands are disabled.' };
    if (action.kind === 'voice') {
      action = { ...action, value: action.value || this.base.voiceLanguage };
      if (!this.base.voiceEnabled || (!action.moderator && !this.base.voiceViewerEnabled)) return { applied: false, message: 'Voice translation is not enabled for viewers.' };
      if (!this.captureActive || this.microphone.status !== 'listening' || !this.available.openai) return { applied: false, message: 'Start a live microphone with your OpenAI key first.' };
      if (!voiceSupported(action.value) || !this.voice.connected() || this.voice.effect) return { applied: false, message: 'Voice translation needs a connected OBS audio source and no active voice effect.' };
    } else if (action.kind === 'language') {
      if (!action.moderator || !translationSupported(action.value)) return { applied: false, message: 'Moderator permission required.' };
    } else if (action.kind === 'mode') {
      if (!modes.includes(action.value) || !action.moderator) return { applied: false, message: 'This mode is not enabled for viewers.' };
      if (this.mode === 'live' && action.value !== 'captions' && !this.available.openai) return { applied: false, message: 'This mode needs an OpenAI connection.' };
      if (this.mode === 'live' && action.value === 'chorus' && !this.chat.connected) return { applied: false, message: 'Chat Chorus needs a Twitch connection.' };
    } else if (action.kind !== 'style' || !['spotlight', 'paper', 'comic'].includes(action.value)) return { applied: false, message: 'Unknown effect.' };
    const remaining = settings.cooldown * 1000 - (this.now() - this.lastAction);
    if (remaining > 0) return { applied: false, remaining: Math.ceil(remaining / 1000), message: 'Audience cooldown is active.' };
    this.lastAction = this.now();
    if (action.kind === 'voice') this.voice.start(action.value, 'timed', this.base.voiceViewerDuration);
    else if (action.kind === 'language') this.setSettings({ tracks: { primary: { language: action.value } } });
    else { this.effect = { kind: action.kind, value: action.value, until: this.now() + 20000 }; this.reconcileWork(settings); }
    this.addEvent(`${action.actor || 'Viewer'} activated ${action.value}${action.kind === 'language' ? '' : ` for ${action.kind === 'voice' ? this.base.voiceViewerDuration : 20} seconds`}`, action.origin);
    if (this.mode === 'demo') this.showDemo(); return { applied: true };
  }
  startVoice() {
    if (!this.base.voiceEnabled) return { applied: false, message: 'Enable microphone routing in audio setup.' };
    if (!this.captureActive || this.microphone.status !== 'listening' || !this.available.openai) return { applied: false, message: 'Start a live microphone with your OpenAI key first.' };
    if (!this.voice.connected()) return { applied: false, message: 'Connect the OBS audio source first.' };
    if (this.voice.effect?.mode === 'continuous') return { applied: false, message: 'Voice translation is already on.' };
    // Streamer controls take precedence over a viewer effect and its cooldown.
    this.voice.cancel(); this.voice.start(this.base.voiceLanguage, 'continuous');
    this.addEvent('Voice translation on · until you stop it', 'studio');
    return { applied: true };
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
    if (this.effect && this.effect.until <= now) this.clearEffect();
    if (this.mode === 'demo') { if (this.playing && now >= this.demoNext) { this.phrase++; this.showDemo(); } return; }
    if (this.captureActive && now - this.captureHeartbeat > 30000) this.stopCapture();
    if (!this.captureActive) return;
    this.trackRuntime.tick();
  }

  setOutput(state) {
    if (!['running', 'frozen', 'hidden'].includes(state)) throw new Error('Choose running, frozen, or hidden captions.');
    if (state === this.outputMode) return;
    this.frozenPresentation = state === 'frozen' ? structuredClone(this.currentPresentation()) : null;
    this.outputMode = state; this.outputChangedAt = this.now(); this.onChange();
  }
  overlay() {
    const current = this.currentPresentation();
    const shown = this.outputMode === 'frozen' && this.frozenPresentation ? this.frozenPresentation : current;
    return { ...current, caption: shown.caption, draft: shown.draft, secondary: shown.secondary, tracks: shown.tracks,
      presentationSettings: shown.settings, captionVoice: shown.voice,
      output: { state: this.outputMode, changedAt: this.outputChangedAt } };
  }
  currentPresentation() {
    const now = this.now(), settings = this.settings();
    const display = this.display?.expiresAt > now ? this.display : null;
    const draft = this.draft?.expiresAt > now && (!display || this.draft.sequence > display.sequence) ? this.draft : null;
    const caption = this.mode === 'demo' ? this.demoCaption : display || draft || blankCaption();
    return { version: 3, tracks: this.trackRuntime.present(), ...this.context(), session: this.sessionId, mode: this.mode, settings: { style: settings.style, display: settings.display, fontSize: settings.fontSize, position: settings.position, backplate: settings.backplate, emphasis: settings.emphasis, reducedMotion: settings.reducedMotion, language: settings.language, preset: settings.preset, secondaryPosition: settings.secondaryPosition, chaosPlacement: settings.chaosPlacement },
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
        : lane === 'vision' && !inputPlan(this.settings()).camera ? 'camera disabled'
        : lane === 'vision' && this.camera.status !== 'listening' ? 'needs camera input'
        : lane === 'audio' && this.microphone.status !== 'listening' ? 'needs microphone input' : '';
      return [lane, unavailable ? { status: unavailable, error: '' } : state];
    }));
  }
  snapshot() {
    return { ...this.overlay(), settings: this.settings(), baseSettings: this.base, available: this.available, started: this.started, playing: this.playing,
      currentDraft: this.draft?.expiresAt > this.now() ? this.draft : null,
      transcript: [...this.segments.values()].filter(item => item.final).sort((a, b) => a.sequence - b.sequence),
      requirements: inputPlan(this.settings()), commentary: this.trackRuntime.status, events: this.events, twitch: this.twitch, camera: this.camera, processors: this.processorStatus(),
      translation: { ...this.status.translation, latency: this.lanes.translation.metrics.latency },
      metrics: Object.fromEntries(Object.entries({ ...this.lanes, ...Object.fromEntries(Object.entries(this.trackRuntime.lanes).map(([id, lane]) => [`commentary:${id}`, lane])) }).map(([name, lane]) => [name, lane.snapshot()])), usage: this.usage,
      styleUntil: this.effect?.until || 0 };
  }
  close() { this.voice.reset(); this.cancelLanes(); this.trackRuntime.reset(); this.sessionId = randomUUID(); this.captureId = ''; this.mode = 'stopped'; }
}
