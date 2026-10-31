import { captionLanguages, translationLanguages, captionLanguage } from '/languages.js';
import { renderCaption, clearCaption } from '/caption-renderer.js';
import { createCapture } from '/microphone.js';
import { createBroadcastAudio } from '/broadcast-audio.js';
import { setupStudio } from '/setup.js';
const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
export const modeNames = { captions: 'Captions', context: 'Full Context', describe: 'Description Only', chorus: 'Chat Chorus', chaos: 'Chaos' };
const descriptions = { captions: 'Your words, with room for another language.', context: 'Observed streamer moments and a collective chat voice, one readable line at a time.', describe: 'Only observed sounds and actions. Real speech stays in your transcript.', chorus: 'A collective voice for your community. Needs at least three participating viewers.', chaos: 'Playful fiction, clearly labeled. Choose whether to keep speech alongside it.' };
const bindings = { 'font-size': 'fontSize', hold: 'hold', backplate: 'backplate', emphasis: 'emphasis', 'reduced-motion': 'reducedMotion', 'safe-area': 'safeArea', language: 'language', preset: 'preset', 'secondary-language': 'secondaryLanguage', 'secondary-position': 'secondaryPosition', 'chaos-placement': 'chaosPlacement', 'chorus-tone': 'chorusTone' };
let state, capture, captureContext, startEpoch = 0, pendingStart = false, initialized = false, toastTimer, backdropUrl, outageTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000); }
async function api(path, data = {}, signal) {
  const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'This action could not be completed.'); return result;
}
async function settings(patch) { try { render(await api('settings', patch)); } catch (error) { toast(error.message); } }
for (const [id, items] of [['language', translationLanguages], ['secondary-language', captionLanguages]]) {
  $(`#${id}`).replaceChildren(...items.map(item => { const option = document.createElement('option'); option.value = item.code; option.textContent = `${item.name} · ${item.native}`; return option; }));
}
const voiceOutput = createBroadcastAudio({ send: api, notify: toast });
function stopCapture() { voiceOutput.stop(); startEpoch++; capture?.stop(); capture = null; captureContext = null; pendingStart = false; }
function report(kind, status, error = '') {
  if (!captureContext) return;
  if (!['camera', 'microphone'].includes(kind)) { if (error) toast(error); return; }
  void api(kind, { ...captureContext, status, error }).catch(() => {});
}
function inputValue(element, value) { if (document.activeElement === element) return; if (element.type === 'checkbox') element.checked = value; else element.value = value; }
const setup = setupStudio({ api, getState: () => state, settings, toast, stopCapture, modeNames });

function render(next) {
  state = next;
  if (captureContext && (state.sessionId !== captureContext.sessionId || ['stopped', 'error'].includes(state.microphone.status))) stopCapture();
  voiceOutput.update(state);
  renderVoice(state);
  renderCaption($('#preview-caption'), state);
  const outputMode = state.output?.state || 'running';
  $('.output-controls').dataset.state = outputMode;
  $('#output-status').textContent = { running: 'Captions on', frozen: 'Captions frozen', hidden: 'Captions hidden' }[outputMode];
  $('#output-help').textContent = { running: state.mode === 'demo' ? 'Sample captions are showing. Start a live session when ready.' : 'New captions appear as you speak.', frozen: 'Viewers see the held captions. Your transcript keeps updating.', hidden: 'No caption text is visible in OBS. Your transcript keeps updating.' }[outputMode];
  $('#freeze-captions').setAttribute('aria-pressed', String(outputMode === 'frozen'));
  $('#hide-captions').setAttribute('aria-pressed', String(outputMode === 'hidden'));
  $('#freeze-captions').disabled = outputMode !== 'running';
  $('#hide-captions').disabled = outputMode === 'hidden';
  $('#resume-captions').disabled = outputMode === 'running';
  $('#quick-twitch').textContent = state.twitch.status === 'connected' ? `@${state.twitch.channel}` : state.twitch.status === 'disconnected' ? 'Connect your channel' : state.twitch.status;
  $('#quick-openai').textContent = state.available.openai ? 'Key configured' : 'Add your API key';
  $('#preview-stage').classList.toggle('portrait', state.settings.format === 'portrait'); $('#safe-guide').hidden = !state.settings.safeArea;
  const hiddenSpeech = state.settings.preset === 'describe' || (state.settings.preset === 'chaos' && state.settings.chaosPlacement === 'replace');
  $('#empty-caption').hidden = outputMode !== 'running' || hiddenSpeech || !!state.caption?.source || !!state.secondary;
  $('#empty-caption small').textContent = state.microphone.status === 'error' ? 'Check Setup to try again' : 'Listening for English speech';
  const live = state.mode === 'live', listening = live && state.microphone.status === 'listening';
  $('#return-demo').hidden = !live;
  $('#mode-pill').classList.toggle('live', listening); $('#mode-pill').textContent = live ? (listening ? 'Microphone live' : `Microphone ${state.microphone.status}`) : 'Demo preview';
  $('#start-microphone span').textContent = captureContext || pendingStart ? 'Stop session' : 'Start live session';
  $('#playback').disabled = live; $('#restart-demo').disabled = live;
  $('#playback').setAttribute('aria-label', state.playing ? 'Pause demo' : 'Play demo'); $('#playback use').setAttribute('href', state.playing ? '#i-pause' : '#i-play');
  $('.waveform').classList.toggle('active', (listening || (!live && state.playing)) && !state.settings.reducedMotion);
  $('#audio-label').textContent = live ? `${state.microphone.provider === 'openai' ? 'OpenAI' : 'Browser'} speech · English` : 'Sample captions · no audio';
  const transcriptCaption = state.currentDraft || state.transcript.at(-1) || state.caption;
  $('#source-transcript').textContent = transcriptCaption?.source || 'Your next words will appear here.';
  $('#translation-transcript').textContent = transcriptCaption?.translation || (live && !state.available.openai ? 'Connect OpenAI for live translation.' : '');
  $('#translation-transcript').lang = captionLanguage(state.settings.language)?.tag || 'en';
  $('#translation-transcript').dir = captionLanguage(state.settings.language)?.dir || 'ltr';
  $('#language-badge').textContent = captionLanguage(state.settings.language)?.native || state.settings.language; $('#caption-origin').textContent = live ? 'LIVE SPEECH' : 'SAMPLE';
  $('#translation-status').textContent = !live ? (state.caption?.translation ? 'Pretranslated demo phrases' : 'No recorded sample for this language. Start a live session for translation.') : state.translation.error || (state.translation.latency ? `Last translation: ${(state.translation.latency / 1000).toFixed(1)}s after request` : 'Translation follows completed phrases');
  for (const [id, key] of Object.entries(bindings)) {
    const element = $(`#${id}`); inputValue(element, state.settings[key]);
    if (element.type === 'range') element.style.setProperty('--range-fill', `${100 * (Number(element.value) - Number(element.min)) / (Number(element.max) - Number(element.min))}%`);
  }
  $('#font-size-value').textContent = `${state.settings.fontSize}`; $('#hold-value').textContent = `${state.settings.hold} seconds`; $('#backplate-value').textContent = `${state.settings.backplate}%`;
  for (const field of ['style', 'format', 'display', 'position']) $$(`button[data-${field}]`).forEach(button => { const active = button.dataset[field] === state.settings[field]; button.classList.toggle(field === 'style' ? 'selected' : 'active', active); button.setAttribute('aria-pressed', String(active)); });
  $('#sidebar-connection').textContent = state.twitch.status === 'connected' ? `@${state.twitch.channel} connected` : 'Twitch not connected';
  $('#mode-description').textContent = descriptions[state.settings.preset];
  $('#secondary-preview-text').textContent = state.secondary?.text || (live ? 'Waiting for a meaningful moment.' : 'Recorded secondary samples: English, Chinese, Spanish, Japanese. Other languages need a live session.');
  $('#active-effect').hidden = !state.effect;
  $('#effect-countdown').textContent = state.effect ? `${state.effect.value} · ${Math.max(0, Math.ceil((state.effect.until - Date.now()) / 1000))}s remaining` : '';
  $('#audience-footnote').textContent = `Commands + rewards · ${state.settings.cooldown}s cooldown · 20s effects`;
  const event = state.events[0]; $('#audience-event').textContent = event ? `${event.origin === 'demo' ? 'PREVIEW · ' : ''}${event.text}` : 'Connect Twitch to hear from your community.';
  $$('#allowed-modes input').forEach(input => input.checked = state.baseSettings.allowedModes.includes(input.value));
  const health = [ ['Microphone', state.microphone], ['Camera', state.camera], ['Twitch', state.twitch], ['Audio cues', state.processors.audio], ['Camera cues', state.processors.vision], ['Chat Chorus', state.processors.chorus], ['Chaos', state.processors.chaos] ];
  for (const [name, value] of health) {
    const card = $(`[data-health="${name}"]`); card.dataset.status = value.status; card.querySelector('span').textContent = value.error || value.status;
  }
  $('#readiness-summary').textContent = state.available.openai ? 'Your key is configured. Test sources in Setup before streaming.' : 'Browser speech is available. Connect OpenAI for translation and commentary.';
  $('#diagnostics').textContent = Object.entries(state.metrics).map(([name, value]) => `${name}: ${value.active} active · ${value.queued} queued · ${value.discarded} skipped · ${value.errors} errors · ${value.latency} ms last`).join('\n') + `\nReported AI usage: ${state.usage.inputTokens} input / ${state.usage.outputTokens} output tokens (${state.usage.requests} completed requests). Audio streaming usage is not included.`;
  setup.render(state);
  if (!initialized) { initialized = true; $('#speech-provider').value = state.available.openai ? 'openai' : 'browser'; if (!state.baseSettings.setupComplete) toast('Start with Setup to connect your sources, or explore the labeled demo.'); }
}

for (const name of ['Microphone', 'Camera', 'Twitch', 'Audio cues', 'Camera cues', 'Chat Chorus', 'Chaos']) { const card = document.createElement('div'); card.className = 'health-card'; card.dataset.health = name; const title = document.createElement('strong'); title.textContent = name; card.append(title, document.createElement('span')); $('#health-grid').append(card); }
for (const [value, name] of Object.entries(modeNames)) { const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.value = value; label.append(input, document.createTextNode(name)); $('#allowed-modes').append(label); input.addEventListener('change', () => settings({ allowedModes: $$('#allowed-modes input:checked').map(item => item.value) })); }
fetch('/api/research').then(response => response.json()).then(items => {
  $('#research-cards').replaceChildren(...items.map(item => { const card = document.createElement('article'); card.className = 'research-card'; for (const [tag, className, content] of [['span', 'tag', item.tag], ['h3', '', item.title], ['p', '', item.text], ['p', 'decision', item.decision]]) { const element = document.createElement(tag); element.className = className; element.textContent = content; card.append(element); } const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = `${item.source} ↗`; card.append(link); return card; }));
}).catch(() => {});
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
  element.addEventListener(element.type === 'range' ? 'input' : 'change', () => settings({ [key]: element.type === 'checkbox' ? element.checked : element.type === 'range' ? Number(element.value) : element.value }));
}
for (const field of ['style', 'format', 'display', 'position']) $$(`button[data-${field}]`).forEach(button => button.addEventListener('click', () => settings({ [field]: button.dataset[field] })));
$$('[data-view]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.view; $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  $('#studio-view').hidden = view === 'research'; $('#research-view').hidden = view !== 'research'; $('#breadcrumb').textContent = { studio: 'Studio', appearance: 'Appearance', audience: 'Audience', research: 'Research notes' }[view];
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
$('#start-microphone').addEventListener('click', async () => {
  if (captureContext || pendingStart) { await demo().catch(error => toast(error.message)); return; }
  setup.stopPreview(); const epoch = ++startEpoch; pendingStart = true; if (state) render(state);
  try {
    const provider = $('#speech-provider').value;
    if (provider === 'openai' && !state.available.openai) { setup.open(0); throw new Error('Connect OpenAI first, or choose browser speech.'); }
    const next = await api('session', { mode: 'live', provider });
    if (epoch !== startEpoch) return;
    captureContext = { streamerId: next.streamerId, sessionId: next.sessionId, captureId: next.captureId }; render(next);
    capture = createCapture({ context: captureContext, provider, getSettings: () => state.settings, send: api, report, onMicrophone: stream => stream ? voiceOutput.attach(stream, captureContext) : voiceOutput.stop(), onCamera: stream => setup.showCamera(stream) });
    await capture.ready;
  } catch (error) { if (epoch === startEpoch) { toast(error.message); stopCapture(); } }
  finally { if (epoch === startEpoch) { pendingStart = false; if (state) render(state); } }
});
$('#upload-backdrop').addEventListener('click', () => $('#video-file').click());
$('#video-file').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; if (backdropUrl) URL.revokeObjectURL(backdropUrl); backdropUrl = URL.createObjectURL(file); const video = $('#background-video'); video.src = backdropUrl; video.hidden = false; try { await video.play(); $('.scene-demo').textContent = 'YOUR PREVIEW VIDEO'; } catch { video.hidden = true; toast('Try an MP4 or WebM video.'); } });
$('#export-transcript').addEventListener('click', () => {
  if (!state) return;
  const text = `AuraMax Captions — speech transcript\n${new Date().toISOString()}\nFiction and commentary are excluded.\n\n` + state.transcript.map(item => `${item.source}\n${item.translation || `[Translation ${item.translationStatus}]`}`).join('\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'auramax-captions-transcript.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
setInterval(() => { if (!state) return; const seconds = Math.floor((Date.now() - state.started) / 1000); $('#playback-time').textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; if (state.effect) $('#effect-countdown').textContent = `${state.effect.value} · ${Math.max(0, Math.ceil((state.effect.until - Date.now()) / 1000))}s remaining`; }, 500);
setInterval(() => { if (captureContext) void api('capture/heartbeat', captureContext).catch(() => {}); }, 5000);
window.addEventListener('beforeunload', () => { if (captureContext) navigator.sendBeacon('/api/microphone', new Blob([JSON.stringify({ ...captureContext, status: 'stopped' })], { type: 'application/json' })); stopCapture(); setup.stopPreview(); });

function renderVoice(next) {
  const voice = next.voice, active = voice?.effect;
  inputValue($('#voice-enabled'), next.baseSettings.voiceEnabled);
  inputValue($('#voice-viewers'), next.baseSettings.voiceViewerEnabled);
  $('#voice-route-status').textContent = voice?.error || (voice?.output === 'connected' ? 'Audio receiver connected · verify the OBS mixer' : voice?.output === 'waiting for microphone' ? 'Audio source found · waiting for microphone routing' : 'Add the OBS audio source to connect');
  $('#voice-route-status').dataset.connected = String(voice?.output === 'connected');
  $('#start-voice').disabled = !!active || !next.baseSettings.voiceEnabled || next.mode !== 'live' || next.microphone.status !== 'listening' || !next.available.openai || voice?.output !== 'connected';
  $('#stop-voice').hidden = !active;
  $('#voice-countdown').textContent = active ? active.phase === 'connecting' ? 'Preparing Chinese… your English is still live' : active.phase === 'draining' ? 'Finishing the last phrase…' : `Chinese voice · ${Math.max(0, Math.ceil((active.until - Date.now()) / 1000))}s` : 'Your voice. A different language. For everyone.';
  $('#voice-progress').value = active?.phase === 'active' ? Math.max(0, (active.until - Date.now()) / 1000) : 0;
  $('#voice-output-text').textContent = active?.text || 'Chinese speech appears here during the effect.';
  $('#voice-panel').dataset.active = String(!!active);
}
$('#voice-audio-address').textContent = `${location.origin}/voice`;
$('#copy-voice-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${location.origin}/voice`); toast('Audio source link copied. Add a separate OBS Browser Source.'); } catch { toast(`Audio source: ${location.origin}/voice`); } });
$('#voice-enabled').addEventListener('change', event => settings({ voiceEnabled: event.target.checked }));
$('#voice-viewers').addEventListener('change', event => settings({ voiceViewerEnabled: event.target.checked }));
$('#start-voice').addEventListener('click', async () => { void voiceOutput.resume(); try { const result = await api('voice/start'); if (!result.applied) toast(result.message); } catch (error) { toast(error.message); } });
$('#stop-voice').addEventListener('click', () => { voiceOutput.restore(); void api('voice/stop').catch(error => toast(error.message)); });
$('#voice-test-tone').addEventListener('click', () => api('voice/test-tone').then(() => toast('A short test tone was sent to the audio source. Check its OBS meter.')).catch(error => toast(error.message)));
