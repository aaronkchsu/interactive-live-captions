import { ensureCaptionFont, fontStyle } from './fonts.js';
import { voiceLanguage } from './voice-languages.js';
import { captionLanguage } from './languages.js';
export function clearCaption(target) { target.replaceChildren(); delete target.dataset.renderKey; }
export function renderCaption(target, state) {
  if (state.output?.state === 'hidden') { clearCaption(target); return; }
  const settings = state.presentationSettings || state.settings;
  const voice = (state.captionVoice || state.voice)?.effect;
  if (state.tracks && !voice) { renderTracks(target, state, settings); return; }
  delete target.dataset.tracks;
  target.dataset.style = settings.style; target.dataset.position = settings.position; target.dataset.reduced = String(settings.reducedMotion);
  target.dataset.secondary = settings.secondaryPosition || 'above';
  target.style.setProperty('--caption-size', settings.fontSize); target.style.setProperty('--plate', settings.backplate / 100);
  const dub = (state.captionVoice || state.voice)?.effect, dubbing = dub && ['active', 'draining'].includes(dub.phase);
  const hiddenSpeech = dubbing || settings.preset === 'describe' || (settings.preset === 'chaos' && settings.chaosPlacement === 'replace');
  const key = JSON.stringify([state.sessionId || state.session, state.caption, state.draft, state.secondary, dub?.id, dub?.phase, dub?.text, settings.style, settings.display, settings.emphasis, settings.language, settings.preset, settings.chaosPlacement]);
  if (target.dataset.renderKey === key && target.childNodes.length) return;
  const previous = target.querySelector('.caption-block');
  const samePhrase = previous?.dataset.phrase === String(state.caption?.id) && previous?.dataset.style === settings.style;
  clearCaption(target); target.dataset.renderKey = key;
  const stack = document.createElement('div'); stack.className = 'caption-stack';
  if (dub) {
    const design = state.tracks?.find(track=>track.id==='primary')?.design;
    if(design){const font=fontStyle(design);void ensureCaptionFont(design);stack.style.setProperty('--dub-font',font.family);stack.style.setProperty('--dub-weight',font.weight);}
    const badge = document.createElement('span'); badge.className = 'dub-badge'; badge.textContent = dubbing ? `AI DUB · ${voiceLanguage(dub.language || 'zh')?.name || 'Voice translation'}` : 'VOICE TRANSLATION · CONNECTING'; stack.append(badge);
    if (dubbing && dub.text) { const line = document.createElement('div'); line.className = 'dub-caption'; line.lang = voiceLanguage(dub.language || 'zh')?.tag || 'en'; line.textContent = dub.text.slice(-160); stack.append(line); }
  }
  if (settings.preset === 'chaos') { const badge = document.createElement('span'); badge.className = 'chaos-badge'; badge.textContent = 'CHAOS MODE · FICTION'; stack.append(badge); }
  if (!hiddenSpeech) {
    const { source = '', translation = '', emphasis = '', id } = state.caption || {};
    if (source || translation) {
      const block = document.createElement('div'); block.className = 'caption-block'; block.dataset.phrase = id; block.dataset.style = settings.style;
      if (samePhrase) block.style.animation = 'none';
      if (settings.display !== 'translation' || !translation) {
        const original = document.createElement('div'); original.className = 'caption-source'; original.lang = 'en';
        const index = settings.emphasis && emphasis ? source.toLowerCase().indexOf(emphasis.toLowerCase()) : -1;
        if (index >= 0) { const accent = document.createElement('span'); accent.className = 'accent'; accent.textContent = source.slice(index, index + emphasis.length); original.append(document.createTextNode(source.slice(0, index)), accent, document.createTextNode(source.slice(index + emphasis.length))); }
        else original.textContent = source;
        block.append(original);
      }
      if (settings.display !== 'source' && translation) {
        const translated = document.createElement('div'); translated.className = 'caption-translation'; translated.lang = captionLanguage(settings.language)?.tag || 'en'; translated.dir = captionLanguage(settings.language)?.dir || 'ltr'; translated.textContent = translation;
        if (settings.display === 'translation') block.classList.add('translation-only'); block.append(translated);
      }
      stack.append(block);
    }
    if (state.draft?.source && settings.display !== 'translation') {
      const draft = document.createElement('div'); draft.className = 'caption-draft'; draft.lang = 'en'; draft.textContent = state.draft.source; stack.append(draft);
    }
  }
  if (!dubbing && state.secondary && settings.preset !== 'captions') {
    const cue = document.createElement('div'); cue.className = `secondary-caption ${state.secondary.kind}`; cue.lang = captionLanguage(state.secondary.language)?.tag || 'en';
    const label = document.createElement('span'); label.className = 'secondary-label'; label.lang = 'en'; label.dir = 'ltr'; label.textContent = `${state.secondary.origin === 'demo' ? 'SAMPLE · ' : ''}${({ observation: 'STREAMER', chorus: 'CHAT CHORUS', fiction: 'AI COMEDY' })[state.secondary.kind]}`;
    const text = document.createElement('span'); text.lang = cue.lang; text.dir = captionLanguage(state.secondary.language)?.dir || 'ltr'; text.textContent = state.secondary.text; cue.append(label, text); stack.append(cue);
  }
  target.append(stack);
}

function renderTracks(target, state, settings) {
  const key = JSON.stringify([state.sessionId, state.tracks, settings.reducedMotion]);
  if (target.dataset.renderKey === key && target.childNodes.length) return;
  clearCaption(target); target.dataset.renderKey = key; target.dataset.tracks = 'true';
  target.dataset.reduced = String(settings.reducedMotion);
  for (const position of ['top', 'center', 'bottom']) {
    const group = document.createElement('div'); group.className = 'track-group'; group.dataset.position = position;
    for (const track of state.tracks.filter(t => t.enabled && t.design.position === position)) {
      if (!track.text && track.mode !== 'commentary') continue;
      const block = document.createElement('div'); block.className = 'track-output'; block.dataset.track = track.id; block.dataset.style = track.design.style;
      block.style.setProperty('--caption-size', track.design.fontSize); block.style.setProperty('--plate', track.design.backplate / 100);
      block.style.setProperty('--track-color', track.design.color); block.style.setProperty('--track-accent', track.design.accent);
      const font = fontStyle(track.design); void ensureCaptionFont(track.design);
      block.style.fontFamily = font.family; block.style.setProperty('--track-font-weight', font.weight);
      if (track.label) { const label = document.createElement('span'); label.className = 'track-label'; label.textContent = `${track.origin === 'demo' ? 'SAMPLE · ' : ''}${track.label}`; block.append(label); }
      if (track.text) { const text = document.createElement('div'); text.className = 'track-text'; text.lang = captionLanguage(track.language)?.tag || 'en'; text.dir = captionLanguage(track.language)?.dir || 'ltr'; const at = track.design.emphasis && track.emphasis ? track.text.toLowerCase().indexOf(track.emphasis.toLowerCase()) : -1; if (at >= 0) { const accent = document.createElement('span'); accent.className = 'track-emphasis'; accent.textContent = track.text.slice(at, at + track.emphasis.length); text.append(document.createTextNode(track.text.slice(0,at)), accent, document.createTextNode(track.text.slice(at + track.emphasis.length))); } else text.textContent = track.text; text.dataset.draft = String(track.pending); block.append(text); }
      group.append(block);
    }
    target.append(group);
  }
}
