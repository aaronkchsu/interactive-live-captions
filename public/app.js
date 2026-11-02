import { fontPicker } from './font-picker.js';
import { captureFailure, microphoneFailure } from './capture-errors.js';
import { voiceStudio } from './voice-studio.js';
import { streamPreview } from '/stream-preview.js';
import { trackEditor, addonEditor } from '/track-editor.js';
import { captionLanguages, translationLanguages, captionLanguage } from '/languages.js';
import { renderCaption, clearCaption } from '/caption-renderer.js';
import { createCapture } from '/microphone.js';
import { createBroadcastAudio } from '/broadcast-audio.js';
import { setupStudio } from '/setup.js';
const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
export const modeNames = { subtitles: 'Subtitles', commentary: 'Commentary' };
const bindings = { 'font-size': 'fontSize', hold: 'hold', backplate: 'backplate', emphasis: 'emphasis', 'reduced-motion': 'reducedMotion', 'safe-area': 'safeArea' };
const designKeys = ['fontSize', 'backplate', 'emphasis', 'style', 'position', 'color', 'accent', 'font'];
let state, capture, captureContext, startEpoch = 0, pendingStart = false, initialized = false, toastTimer, outageTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000); }
async function api(path, data = {}, signal) {
  const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'This action could not be completed.'); return result;
}
async function settings(patch) { try { render(await api('settings', patch)); } catch (error) { toast(error.message); } }
const voiceOutput = createBroadcastAudio({ send: api, notify: toast });
function stopCapture() { voiceOutput.stop(); startEpoch++; capture?.stop(); capture = null; captureContext = null; pendingStart = false; }
function report(kind, status, error = '', failure = null) {
  if (!captureContext) return;
  if (!['camera', 'microphone'].includes(kind)) { if (error) toast(error); return; }
  void api(kind, { ...captureContext, status, error, failure }).catch(() => {});
}
function inputValue(element, value) { if (document.activeElement === element) return; if (element.type === 'checkbox') element.checked = value; else element.value = value; }
const setup = setupStudio({ api, getState: () => state, settings, toast, stopCapture, modeNames });

const voiceControls = voiceStudio({ api, settings, getState: () => state, voiceOutput, setup, toast });
const tracks = trackEditor({ settings, getState: () => state, api, toast, onSelect: () => render(state) });
const fontControls = fontPicker({patch:value=>tracks.patch(value)});
const addons = addonEditor({ settings, getState: () => state, api, toast });
const preview = streamPreview({ api });
function render(next) {
  state = next; tracks.render(state); addons.render(state); preview.render(state);
  if (capture) void capture.update().catch(error => toast(captureFailure(error).message));
  const design = state.settings.tracks[tracks.selected()].design;
  fontControls.render(design);
  if (captureContext && (state.sessionId !== captureContext.sessionId || ['stopped', 'error'].includes(state.microphone.status))) stopCapture();
  voiceOutput.update(state);
  voiceControls.render(state);
  renderCaption($('#preview-caption'), state);
  renderMicrophoneFailure(state);
  const outputMode = state.output?.state || 'running';
  $('.output-controls').dataset.state = outputMode;
  $('#output-status').textContent = { running: 'Captions on', frozen: 'Captions frozen', hidden: 'Captions hidden' }[outputMode];
  $('#output-help').textContent = { running: state.mode === 'demo' ? 'Sample captions are showing. Start a live session when ready.' : (state.microphone.status === 'error' ? 'Microphone unavailable. Follow the recovery steps below.' : 'New captions appear as you speak.'), frozen: 'Viewers see the held captions. Your transcript keeps updating.', hidden: 'No caption text is visible in OBS. Your transcript keeps updating.' }[outputMode];
  $('#freeze-captions').setAttribute('aria-pressed', String(outputMode === 'frozen'));
  $('#hide-captions').setAttribute('aria-pressed', String(outputMode === 'hidden'));
  $('#freeze-captions').disabled = outputMode !== 'running';
  $('#hide-captions').disabled = outputMode === 'hidden';
  $('#resume-captions').disabled = outputMode === 'running';
  $('#quick-twitch').textContent = state.twitch.status === 'connected' ? `@${state.twitch.channel}` : state.twitch.status === 'disconnected' ? 'Connect your channel' : state.twitch.status;
  $('#quick-openai').textContent = state.available.openai ? 'Key configured' : 'Add your API key';
  $('#preview-stage').classList.toggle('portrait', state.settings.format === 'portrait'); $('#safe-guide').hidden = !state.settings.safeArea;
  const hiddenSpeech = state.settings.tracks.primary.mode === 'commentary';
  $('#empty-caption').hidden = outputMode !== 'running' || hiddenSpeech || !!state.caption?.source || !!state.secondary;
  $('#empty-caption small').textContent = state.microphone.status === 'error' ? 'Check Setup to try again' : 'Listening for English speech';
  const live = state.mode === 'live', listening = live && state.microphone.status === 'listening';
  $('#return-demo').hidden = !live;
  $('#mode-pill').classList.toggle('live', listening); $('#mode-pill').textContent = live ? (state.microphone.status === 'error' ? 'Microphone unavailable' : state.requirements.speech ? (listening ? 'Microphone live' : `Microphone ${state.microphone.status}`) : 'Commentary live') : 'Demo preview';
  $('#start-microphone span').textContent = captureContext || pendingStart ? 'Stop session' : 'Start live session';
  $('#playback').disabled = live; $('#restart-demo').disabled = live;
  $('#playback').setAttribute('aria-label', state.playing ? 'Pause demo' : 'Play demo'); $('#playback use').setAttribute('href', state.playing ? '#i-pause' : '#i-play');
  $('.waveform').classList.toggle('active', (listening || (!live && state.playing)) && !state.settings.reducedMotion);
  $('#audio-label').textContent = live ? (state.requirements.speech ? `${state.microphone.provider === 'openai' ? 'OpenAI' : 'Browser'} speech · English` : 'Commentary · selected inputs') : 'Sample captions · no audio';
  const transcriptCaption = state.currentDraft || state.transcript.at(-1) || state.caption;
  const transcriptLanguage = state.requirements.languages[0] || 'en';
  $('#source-transcript').textContent = transcriptCaption?.source || 'Your next words will appear here.';
  const transcriptTranslation = live ? transcriptCaption?.translations?.[transcriptLanguage]?.text : state.tracks.find(t => t.enabled && t.mode === 'subtitles' && t.language === transcriptLanguage)?.text;
  $('#translation-transcript').textContent = transcriptLanguage === 'en' ? '' : transcriptTranslation || (live && !state.available.openai ? 'Connect OpenAI for live translation.' : '');
  $('#translation-transcript').lang = captionLanguage(transcriptLanguage)?.tag || 'en';
  $('#translation-transcript').dir = captionLanguage(transcriptLanguage)?.dir || 'ltr';
  $('#language-badge').textContent = captionLanguage(transcriptLanguage)?.native || state.settings.language; $('#caption-origin').textContent = live ? 'LIVE SPEECH' : 'SAMPLE';
  $('#translation-status').textContent = !state.requirements.languages.length ? 'Original speech · no translation requested' : !live ? (transcriptTranslation ? 'Pretranslated demo phrases' : 'No recorded sample for this language. Start a live session for translation.') : state.translation.error || (state.translation.latency ? `Last translation: ${(state.translation.latency / 1000).toFixed(1)}s after request` : 'Translation follows completed phrases');
  for (const [id, key] of Object.entries(bindings)) {
    const element = $(`#${id}`); inputValue(element, designKeys.includes(key) ? design[key] : state.settings[key]);
    if (element.type === 'range') element.style.setProperty('--range-fill', `${100 * (Number(element.value) - Number(element.min)) / (Number(element.max) - Number(element.min))}%`);
  }
  $('#font-size-value').textContent = `${design.fontSize}`; $('#hold-value').textContent = `${state.settings.hold} seconds`; $('#backplate-value').textContent = `${design.backplate}%`;
  for (const field of ['style', 'format', 'display', 'position']) $$(`button[data-${field}]`).forEach(button => { const active = button.dataset[field] === (designKeys.includes(field) ? design[field] : state.settings[field]); button.classList.toggle(field === 'style' ? 'selected' : 'active', active); button.setAttribute('aria-pressed', String(active)); });
  $('#sidebar-connection').textContent = state.twitch.status === 'connected' ? `@${state.twitch.channel} connected` : 'Twitch not connected';
  for (const key of ['color','accent']) inputValue($(`#design-${key}`), design[key]);
  $('#viewer-styles').checked = state.baseSettings.viewerStyles;
  $('#active-effect').hidden = !state.effect;
  $('#effect-countdown').textContent = state.effect ? `${state.effect.value} · ${Math.max(0, Math.ceil((state.effect.until - Date.now()) / 1000))}s remaining` : '';
  $('#audience-footnote').textContent = `Commands + rewards · ${state.settings.cooldown}s cooldown · creator-defined effects`;
  const event = state.events[0]; $('#audience-event').textContent = event ? `${event.origin === 'demo' ? 'PREVIEW · ' : ''}${event.text}` : state.twitch.status === 'connected' ? 'Waiting for a chat command or reward.' : 'Connect Twitch to hear from your community.';
  const health = [ ['Microphone', state.microphone], ['Camera', state.camera], ['Twitch', state.twitch], ['Audio cues', state.processors.audio], ['Camera cues', state.processors.vision], ['Primary commentary', state.commentary?.primary || { status: state.settings.tracks.primary.mode === 'commentary' ? (state.mode === 'demo' ? 'not running' : 'waiting for input') : 'off' }], ['Secondary commentary', state.commentary?.secondary || { status: state.settings.tracks.secondary.enabled && state.settings.tracks.secondary.mode === 'commentary' ? (state.mode === 'demo' ? 'not running' : 'waiting for input') : 'off' }] ];
  for (const [name, value] of health) {
    const card = $(`[data-health="${name}"]`); card.dataset.status = value.status; card.querySelector('span').textContent = name === 'Microphone' && value.status === 'error' ? microphoneFailure(value).title : value.error || value.status;
  }
  $('#readiness-summary').textContent = state.available.openai ? 'Your key is configured. Test sources in Setup before streaming.' : 'Browser speech is available. Connect OpenAI for translation and commentary.';
  $('#diagnostics').textContent = Object.entries(state.metrics).map(([name, value]) => `${name}: ${value.active} active · ${value.queued} queued · ${value.discarded} skipped · ${value.errors} errors · ${value.latency} ms last`).join('\n') + `\nReported AI usage: ${state.usage.inputTokens} input / ${state.usage.outputTokens} output tokens (${state.usage.requests} completed requests). Audio streaming usage is not included.`;
  setup.render(state);
  if (!initialized) {
    initialized = true; $('#speech-provider').value = state.available.openai ? 'openai' : 'browser';
    const returned = new URL(location.href), outcome = returned.searchParams.get('twitch');
    if (outcome === 'connected' || outcome === 'error') {
      returned.searchParams.delete('twitch'); history.replaceState(null, '', returned.pathname + returned.search + returned.hash);
      void setup.open(1, { audience: true });
      $('#twitch-error').textContent = outcome === 'error' ? 'Twitch connection was not completed. If you cancelled, you can try again when ready. Check your application callback URL if the problem continues.' : 'Twitch authorized. Connection status is shown above. Restart your live session when ready.';
    } else if (!state.baseSettings.setupComplete) toast('Start with Setup to connect your sources, or explore the labeled demo.');
  }
}

for (const name of ['Microphone', 'Camera', 'Twitch', 'Audio cues', 'Camera cues', 'Primary commentary', 'Secondary commentary']) { const card = document.createElement('div'); card.className = 'health-card'; card.dataset.health = name; const title = document.createElement('strong'); title.textContent = name; card.append(title, document.createElement('span')); $('#health-grid').append(card); }
const changeOutput = value => api('output', { state: value }).then(render).catch(error => toast(error.message));
$('#freeze-captions').addEventListener('click', () => changeOutput('frozen'));
$('#hide-captions').addEventListener('click', () => changeOutput('hidden'));
$('#resume-captions').addEventListener('click', () => changeOutput('running'));
$$('[data-setup]').forEach(button => button.addEventListener('click', () => setup.open(Number(button.dataset.setup))));
document.addEventListener('keydown', event => {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.repeat || !state || $('#connections-dialog').open || event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
  const mode = { KeyF: 'frozen', KeyH: 'hidden', KeyR: 'running' }[event.code];
  if (!mode || (mode === 'frozen' && state.output?.state !== 'running')) return;
  event.preventDefault(); void changeOutput(mode);
});
const eventStream = new EventSource('/api/events');
eventStream.onmessage = event => { clearTimeout(outageTimer); outageTimer = null; render(JSON.parse(event.data)); };
eventStream.onerror = () => { $('#mode-pill').textContent = 'Studio reconnecting…'; clearCaption($('#preview-caption')); if (!outageTimer) outageTimer = setTimeout(() => { stopCapture(); toast('The studio connection was lost. Restart the live session when reconnected.'); }, 15000); };
for (const [id, key] of Object.entries(bindings)) {
  const element = $(`#${id}`);
  element.addEventListener(element.type === 'range' ? 'input' : 'change', () => { const value = element.type === 'checkbox' ? element.checked : element.type === 'range' ? Number(element.value) : element.value; return designKeys.includes(key) ? tracks.patch({ design: { [key]: value } }) : settings({ [key]: value }); });
}
for (const field of ['style', 'format', 'display', 'position']) $$(`button[data-${field}]`).forEach(button => button.addEventListener('click', () => designKeys.includes(field) ? tracks.patch({ design: { [field]: button.dataset[field] } }) : settings({ [field]: button.dataset[field] })));
$$('[data-view]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.view; $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  $('#breadcrumb').textContent = { studio: 'Studio', appearance: 'Appearance', audience: 'Audience' }[view];
  if (view === 'appearance' || view === 'audience') $(`#${view}-section`).scrollIntoView({ behavior: state?.settings.reducedMotion ? 'instant' : 'smooth' });
}));
$$('[data-action]').forEach(button => button.addEventListener('click', async () => { try { const result = await api('action', { kind: 'style', value: button.dataset.action }); toast(result.applied ? 'Labeled studio preview effect applied.' : result.message); } catch (error) { toast(error.message); } }));
for (const id of ['connections-button', 'connections-sidebar', 'setup-shortcut']) $(`#${id}`).addEventListener('click', () => setup.open());
$('#reward-setup').addEventListener('click', () => setup.open(1));
$('#clear-effect').addEventListener('click', () => api('effects/reset').then(render).catch(error => toast(error.message)));
$('#playback').addEventListener('click', () => api('playback').then(render).catch(error => toast(error.message)));
const demo = async () => { stopCapture(); render(await api('session', { mode: 'demo' })); };
for (const id of ['restart-demo', 'return-demo', 'preview-mode']) $(`#${id}`).addEventListener('click', () => demo().catch(error => toast(error.message)));
$('#reset-settings').addEventListener('click', () => api('reset').then(render).catch(error => toast(error.message)));
const overlayAddress = `${location.origin}/overlay`; $('#overlay-address').textContent = overlayAddress;
for (const id of ['copy-overlay', 'copy-overlay-modal']) $(`#${id}`).addEventListener('click', async () => { try { await navigator.clipboard.writeText(overlayAddress); toast('OBS link copied. Add a Browser Source at 1920 × 1080.'); } catch { setup.open(4); } });
function renderMicrophoneFailure(next) {
  const failed = next.microphone.status === 'error';
  $('#microphone-recovery').hidden = !failed;
  if (!failed) return;
  const issue = microphoneFailure(next.microphone);
  $('#microphone-error-title').textContent = issue.title;
  $('#microphone-error-help').textContent = issue.message;
  $('#microphone-error-details').textContent = `${issue.code} · ${issue.stage}${issue.detail ? '\n' + issue.detail : '\nNo additional details were reported.'}`;
  $('#microphone-fix').textContent = issue.action;
  $('#microphone-retry').disabled = pendingStart;
}
$('#microphone-fix').onclick = () => setup.open(microphoneFailure(state.microphone).step);
$('#microphone-retry').onclick = () => { stopCapture(); $('#start-microphone').click(); };
$('#start-microphone').addEventListener('click', async () => {
  if (captureContext || pendingStart) { await demo().catch(error => toast(error.message)); return; }
  setup.stopPreview(); const epoch = ++startEpoch; pendingStart = true; if (state) render(state);
  try {
    const provider = $('#speech-provider').value;
    if (provider === 'openai' && !state.available.openai) { setup.open(0); throw new Error('Connect OpenAI first, or choose browser speech.'); }
    const next = await api('session', { mode: 'live', provider });
    if (epoch !== startEpoch) return;
    captureContext = { streamerId: next.streamerId, sessionId: next.sessionId, captureId: next.captureId }; render(next);
    capture = createCapture({ context: captureContext, provider, getSettings: () => state.settings, send: api, report, onMicrophone: stream => stream ? voiceOutput.attach(stream, captureContext) : voiceOutput.stop(), onCamera: stream => { setup.showCamera(stream); preview.showCamera(stream); } });
    await capture.ready;
  } catch (error) { if (epoch === startEpoch) { toast(captureFailure(error).message); stopCapture(); } }
  finally { if (epoch === startEpoch) { pendingStart = false; if (state) render(state); } }
});
$('#export-transcript').addEventListener('click', () => {
  if (!state) return;
  const text = `AuraMax Captions — speech transcript\n${new Date().toISOString()}\nFiction and commentary are excluded.\n\n` + state.transcript.map(item => `${item.source}\n${Object.entries(item.translations || {}).map(([language, result]) => `${language}: ${result.text || `[${result.status}]`}`).join('\n')}`).join('\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'auramax-captions-transcript.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
setInterval(() => { if (!state) return; const seconds = Math.floor((Date.now() - state.started) / 1000); $('#playback-time').textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; if (state.effect) $('#effect-countdown').textContent = `${state.effect.value} · ${Math.max(0, Math.ceil((state.effect.until - Date.now()) / 1000))}s remaining`; }, 500);
setInterval(() => { if (captureContext) void api('capture/heartbeat', captureContext).catch(() => {}); }, 5000);
window.addEventListener('beforeunload', () => { if (captureContext) navigator.sendBeacon('/api/microphone', new Blob([JSON.stringify({ ...captureContext, status: 'stopped' })], { type: 'application/json' })); stopCapture(); setup.stopPreview(); });

for (const key of ['color','accent']) $(`#design-${key}`).addEventListener('change', e => tracks.patch({ design: { [key]: e.target.value } }));
$('#viewer-styles').addEventListener('change', e => settings({ viewerStyles: e.target.checked }));
