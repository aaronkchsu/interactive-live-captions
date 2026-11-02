import { microphoneFailure } from './capture-errors.js';
import { voiceLanguages, voiceLanguage } from './voice-languages.js';

export function voiceReadiness(state) {
  if (state.microphone.status === 'error') return {ready:false, message: `${microphoneFailure(state.microphone).title}. Use the microphone recovery controls above.`};
  if (!state.available.openai) return { ready: false, message: 'Connect your OpenAI key in audio setup.' };
  if (!state.baseSettings.voiceEnabled) return { ready: false, message: 'Enable microphone routing in audio setup.' };
  if (state.mode !== 'live' || state.microphone.status !== 'listening') return { ready: false, message: 'Start a live session to connect your microphone.' };
  if (state.voice?.output !== 'connected') return { ready: false, message: 'Waiting for the OBS audio source.' };
  return { ready: true, message: 'Audio connected · check the OBS mixer before translating.' };
}

export function voiceStudio({ api, settings, getState, voiceOutput, setup, toast }) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#voice-setup-dialog');
  const open = () => { $('#connections-dialog').close(); if (!dialog.open) dialog.showModal(); };
  for (const id of ['voice-setup', 'voice-settings', 'setup-voice']) $(`#${id}`).onclick = open;
  for (const [id, step] of [['voice-key-setup', 0], ['voice-input-setup', 2]]) $(`#${id}`).onclick = () => { dialog.close(); void setup.open(step); };
  $('#voice-language').replaceChildren(...voiceLanguages.map(item => new Option(item.name, item.code)));
  $('#voice-language').onchange = event => settings({ voiceLanguage: event.target.value });
  $('#voice-enabled').onchange = event => settings({ voiceEnabled: event.target.checked });
  $('#voice-viewer-duration').oninput = event => {
    if (event.target.value !== '' && event.target.checkValidity()) settings({ voiceViewerDuration: Number(event.target.value) });
  };
  $('#voice-viewer-duration').onchange = event => { if (!event.target.checkValidity()) event.target.reportValidity(); };
  $('#voice-viewers').onchange = event => settings({ voiceViewerEnabled: event.target.checked });
  $('#voice-audio-address').textContent = `${location.origin}/voice`;
  $('#copy-voice-link').onclick = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/voice`); toast('Audio source link copied.'); }
    catch { toast('Copy the audio URL shown in setup.'); }
  };
  $('#voice-test-tone').onclick = () => api('voice/test-tone').then(() => toast('Test tone sent. Check the OBS audio meter.')).catch(error => toast(error.message));
  let starting = false;
  $('#start-voice').onclick = async () => {
    if (starting) return; starting = true; render(getState()); void voiceOutput.resume();
    try { const result = await api('voice/start'); if (!result.applied) toast(result.message); }
    catch (error) { toast(error.message); }
    finally { starting = false; render(getState()); }
  };
  $('#stop-voice').onclick = () => { voiceOutput.restore(); void api('voice/stop').catch(error => toast(error.message)); };
  function render(state) {
    const voice = state.voice, active = voice?.effect, readiness = voiceReadiness(state);
    const language = voiceLanguage(active?.language || state.baseSettings.voiceLanguage || 'zh');
    $('#voice-enabled').checked = state.baseSettings.voiceEnabled;
    $('#voice-viewers').checked = state.baseSettings.voiceViewerEnabled;
    if (document.activeElement !== $('#voice-viewer-duration')) $('#voice-viewer-duration').value = state.baseSettings.voiceViewerDuration ?? 20;
    if (document.activeElement !== $('#voice-language')) $('#voice-language').value = language.code;
    $('#voice-language').disabled = !!active || starting;
    $('#voice-viewer-help').textContent = `!voice uses ${voiceLanguage(state.baseSettings.voiceLanguage || 'zh').name} · !voice ja selects Japanese · ${state.baseSettings.voiceViewerDuration ?? 20} seconds · shared cooldown`;
    $('#voice-route-status').textContent = voice?.error || (active?.mode === 'continuous' && active.phase === 'active' ? 'Translation on · API usage continues until stopped.' : readiness.message);
    $('#voice-setup').hidden = !!active || readiness.ready;
    $('#voice-settings').hidden = !active && !readiness.ready;
    $('#start-voice').hidden = !!active || !readiness.ready;
    $('#start-voice').disabled = starting;
    $('#stop-voice').hidden = !active;
    $('#voice-active').hidden = !active;
    $('#voice-countdown').textContent = active ? active.phase === 'connecting' ? `Preparing ${language.name}… your normal voice stays on.` : active.phase === 'draining' ? 'Finishing the last phrase…' : active.mode === 'continuous' ? `${language.name} · on until you stop it` : `${language.name} · ${Math.max(0, Math.ceil((active.until - Date.now()) / 1000))}s remaining` : '';
    $('#voice-progress').hidden = active?.phase !== 'active' || active.mode === 'continuous';
    $('#voice-progress').max = (active?.durationMs || 20000) / 1000;
    $('#voice-progress').value = active?.phase === 'active' ? Math.max(0, (active.until - Date.now()) / 1000) : 0;
    $('#voice-output-text').hidden = !active?.text;
    $('#voice-output-text').textContent = active?.text || '';
    $('#voice-output-text').lang = language.tag;
    $('#voice-panel').dataset.active = String(!!active);
    $('#voice-input-status').textContent = `${state.available.openai ? 'Key configured' : 'OpenAI key missing'} · ${state.microphone.status === 'listening' ? 'Microphone listening' : 'Start a live session for microphone audio'}.`;
    $('#voice-receiver-status').textContent = voice?.output === 'connected' ? 'Audio receiver connected.' : voice?.output === 'waiting for microphone' ? 'Source found · waiting for microphone routing.' : 'No audio receiver connected yet.';
    $('#voice-test-tone').disabled = !voice || voice.output === 'disconnected';
  }
  return { render };
}
