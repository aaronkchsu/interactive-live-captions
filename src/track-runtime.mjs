import { WorkLane } from './scheduler.mjs';
import { inputPlan, trackIds } from '../public/track-model.js';
import { phrases } from './fixtures.mjs';

/** Owns track output; raw speech remains in the session transcript. */
export class TrackRuntime {
  constructor(session) {
    this.session = session;
    this.lanes = Object.fromEntries(trackIds.map(id => [id, new WorkLane({ concurrency: 1, capacity: 1, now: session.now })]));
    this.reset();
  }
  reset() {
    this.generation = (this.generation || 0) + 1;
    for (const lane of Object.values(this.lanes)) lane.cancel();
    this.cues = {}; this.last = {}; this.fingerprints = {}; this.recent = {}; this.status = {}; this.observations = [];
  }
  requirements() { return inputPlan(this.session.settings()); }
  translate(segment) {
    const s = this.session, languages = this.requirements().languages;
    segment.translations ||= {};
    for (const language of languages) {
      if (segment.translations[language]) continue;
      const generation = s.translationGeneration, context = s.context();
      const valid = () => generation === s.translationGeneration && s.sessionId === context.sessionId && s.segments.get(segment.id) === segment;
      const result = segment.translations[language] = { status: s.available.openai ? 'queued' : 'unconfigured', text: '', visibleUntil: 0 };
      if (!s.available.openai) { segment.translationStatus = 'unconfigured'; s.status.translation = { status: 'unconfigured', error: 'Connect OpenAI for translation.' }; continue; }
      s.lanes.translation.enqueue({ id: `${context.sessionId}:${segment.id}:${segment.revision}:${language}:${generation}`, at: s.now(),
        run: signal => { if (!valid()) throw new Error('Obsolete translation'); result.status = 'translating'; return s.provider.translate(context, segment.source, language, signal); },
        done: text => {
          if (!valid()) return;
          const newer = [...s.segments.values()].some(item => item.sequence > segment.sequence && item.translations?.[language]?.text);
          if (newer) {
            Object.assign(result, { status: 'ready:history-only', text });
            segment.translation = text; segment.translationStatus = result.status; s.onChange(); return;
          }
          Object.assign(result, { status: 'ready', text, visibleUntil: s.now() + s.settings().hold * 1000 });
          segment.translation = text; segment.translationStatus = 'ready'; segment.expiresAt = result.visibleUntil;
          if (!s.display || segment.sequence >= s.display.sequence) s.display = segment;
          s.status.translation = { status: 'ready', error: '' }; s.onChange();
        }, late: text => { if (valid()) { Object.assign(result, { status: 'ready:history-only', text }); segment.translation = text; segment.translationStatus = result.status; s.onChange(); } },
        discard: reason => { if (valid()) { result.status = `skipped:${reason}`; segment.translationStatus = result.status; } },
        error: error => { if (valid()) { result.status = 'error'; segment.translationStatus = 'error'; s.status.translation = { status: 'error', error: error.message }; s.onChange(); } }
      });
    }
    if (!languages.length) segment.translationStatus = 'not requested';
  }
  observe(result, id, at, source) {
    if (!result) return;
    this.observations = [...this.observations.filter(o => o.at > this.session.now() - 8000), { id, text: result.text, event: result.event, source, at }].slice(-8);
  }
  tick() {
    const s = this.session, now = s.now();
    if (!s.captureActive || !s.available.openai) return;
    for (const id of trackIds) {
      const track = s.settings().tracks[id];
      if (!track.enabled || track.mode !== 'commentary' || now - (this.last[id] ?? -Infinity) < 8000) continue;
      const chat = track.inputs.chat && s.chat.connected ? s.chat.evidence() : [];
      const messages = new Set(chat.map(m => m.author)).size >= 3 ? chat : [];
      const speech = track.inputs.mic ? [...s.segments.values()].filter(x => x.final && now - x.at < 12000).slice(-3).map(x => ({ id: x.id, text: x.source })) : [];
      const observations = this.observations.filter(o => now - o.at < 8000 && (o.source === 'audio' ? track.inputs.mic : track.inputs.camera));
      const quiet = track.inputs.chat && s.chat.connected && s.chat.quiet();
      const evidence = { speech, messages, observations, quiet };
      const fingerprint = JSON.stringify(evidence);
      if ((!speech.length && !messages.length && !observations.length && !quiet) || fingerprint === this.fingerprints[id]) continue;
      this.last[id] = now; this.fingerprints[id] = fingerprint;
      const generation = this.generation, context = s.context();
      const valid = () => generation === this.generation && context.sessionId === s.sessionId && s.captureActive;
      this.status[id] = { status: 'analyzing', error: '' };
      this.lanes[id].enqueue({ id: `${id}:${now}:${generation}`, at: now,
        run: signal => s.provider.commentary(context, evidence, track.language, track.troll, signal),
        done: result => {
          if (!valid()) return;
          this.status[id] = { status: 'ready', error: '' };
          if (!result || (this.recent[id]?.text === result.text && now - this.recent[id].at < 20000)) return;
          this.cues[id] = { id: `${id}:${now}`, text: result.text, language: track.language, kind: track.troll > 0 ? 'fiction' : 'observation', evidence: result.evidence, origin: 'live', expiresAt: s.now() + 6000 };
          this.recent[id] = { text: result.text, at: s.now() }; s.onChange();
        }, discard: () => { if (valid()) this.status[id] = { status: 'waiting for fresh input', error: '' }; }, error: error => { if (valid()) { this.status[id] = { status: 'error', error: error.message }; s.onChange(); } }
      });
    }
  }
  present() {
    const s = this.session, now = s.now(), settings = s.settings();
    const segments = [...s.segments.values()].sort((a, b) => b.sequence - a.sequence);
    const translated = language => {
      // Choose the newest completed translation before checking expiry. An older
      // still-readable result must never reappear after newer speech disappears.
      const segment = segments.find(item => item.translations?.[language]?.status === 'ready');
      return segment?.translations[language].visibleUntil > now ? segment : null;
    };
    return trackIds.map(id => {
      const track = settings.tracks[id]; let text = '', pending = false, phraseId = '', source = '', emphasis = '', kind = 'speech';
      if (track.enabled && s.mode === 'demo') {
        const phrase = phrases[s.phrase % phrases.length]; phraseId = `demo-${s.phrase}`;
        if (track.mode === 'subtitles') { text = phrase[track.language] || ''; emphasis = phrase.emphasis || ''; }
        else {
          const samples = { en: ['(laughing)', 'Chat has seventeen plans. None of them agree.'], zh: ['（正在笑）', '聊天室有十七个计划，但谁也不同意谁。'], es: ['(riendo)', 'El chat tiene diecisiete planes. Ninguno coincide.'], ja: ['（笑っている）', 'チャットには17の案。でも誰も同意しない。'] };
          text = samples[track.language]?.[track.troll ? 1 : 0] || ''; kind = track.troll ? 'fiction' : 'observation';
        }
      } else if (track.enabled && track.mode === 'commentary') {
        const cue = this.cues[id]; if (cue?.expiresAt > now) { text = cue.text; kind = cue.kind; phraseId = cue.id; }
      } else if (track.enabled) {
        if (track.language === 'en') {
          const language = this.requirements().languages[0];
          const paired = language && translated(language);
          const segment = paired || segments[0];
          if (segment?.expiresAt > now) { text = segment.source; phraseId = segment.id; pending = !segment.final; }
        } else {
          const segment = translated(track.language);
          if (segment) { text = segment.translations[track.language].text; phraseId = segment.id; source = segment.source; }
        }
      }
      return { id, enabled: track.enabled, mode: track.mode, language: track.language, design: track.design, text, source, emphasis, phraseId, pending, kind,
        label: track.mode === 'commentary' ? track.troll > 0 ? 'AI COMMENTARY · COMEDY' : 'AI COMMENTARY' : '', origin: s.mode === 'demo' ? 'demo' : 'live' };
    });
  }
}
