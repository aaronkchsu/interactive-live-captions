import { captureFailure, microphoneFailure } from './capture-errors.js';
import { voiceLanguages } from './voice-languages.js';
export function setupStudio({ api, getState, settings, toast, stopCapture, modeNames }) {
  const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
  const order = [1, 0, 2, 3, 4];
  let page = 1, previewEpoch = 0, previewStreams = [], previewContext, frame, liveCamera, twitchBusy = false, lastTwitchError = '';
  function step(index) {
    page = Math.max(0, Math.min(4, index));
    $$('[data-page]').forEach(element => element.hidden = Number(element.dataset.page) !== page);
    $$('[data-step]').forEach(button => { const selected = Number(button.dataset.step) === page; button.classList.toggle('selected', selected); button.setAttribute('aria-current', selected ? 'step' : 'false'); });
    $('#setup-progress').textContent = `Step ${order.indexOf(page) + 1} of 5`; $('#setup-back').disabled = page === order[0]; $('#setup-next').hidden = page === 4;
  }
  async function open(index = 1, { audience = false } = {}) {
    $('#connections-dialog').classList.toggle('audience-setup', audience);
    $('#setup-eyebrow').textContent = audience ? 'AUDIENCE CONTROLS' : 'GET READY TO STREAM';
    $('#setup-title').textContent = audience ? 'Connect Twitch' : 'Connect your studio.';
    $('#setup-lead').textContent = audience ? 'Connect chat commentary and viewer add-ons.' : 'Connect Twitch, add your key, then test your overlay. You can try the sample captions at any time.';
    step(index); if (!$('#connections-dialog').open) $('#connections-dialog').showModal();
    try { const status = await (await fetch('/api/setup')).json(); $('#oauth-callback').textContent = status.callback; $('#twitch-app-details').open = !status.twitchApp; } catch { toast('Could not load connection status.'); }
    await enumerate();
  }
  function stopPreview() {
    previewEpoch++; cancelAnimationFrame(frame); for (const stream of previewStreams) stream.getTracks().forEach(track => track.stop()); previewStreams = [];
    void previewContext?.close(); previewContext = null; $('#input-meter').value = 0;
    if (!liveCamera) $('#camera-preview').srcObject = null;
  }
  function showCamera(stream) { liveCamera = stream; $('#camera-preview').srcObject = stream; if (stream) void $('#camera-preview').play().catch(() => {}); }
  async function enumerate() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const [id, kind, setting] of [['microphone-device', 'audioinput', 'microphoneId'], ['camera-device', 'videoinput', 'cameraId']]) {
        const select = $(`#${id}`), current = getState()?.baseSettings[setting] || select.value;
        select.replaceChildren(new Option('System default', ''), ...devices.filter(item => item.kind === kind).map((item, i) => new Option(item.label || `${kind === 'audioinput' ? 'Microphone' : 'Camera'} ${i + 1}`, item.deviceId)));
        if ([...select.options].some(option => option.value === current)) select.value = current;
      }
    } catch { $('#device-result').textContent = 'Device selection needs Chrome/Edge and permission to access inputs.'; }
  }
  async function busy(button, work, output) {
    button.disabled = true;
    try { await work(); } catch (error) { if (output) { const issue = output.id === 'device-result' ? captureFailure(error, 'microphone') : null; if (issue) stopPreview(); output.textContent = issue ? `${issue.title}. ${issue.message} (${issue.code})${issue.detail ? '\n' + issue.detail : ''}` : error.message; } else toast(error.message); }
    finally { button.disabled = false; }
  }
  function renderTwitch(state) {
    const connected = state.twitch.status === 'connected', connecting = state.twitch.status === 'connecting';
    const configured = state.available.twitchApp, saved = state.available.twitch;
    const label = connected ? `Connected as @${state.twitch.channel}` : connecting ? 'Connecting to chat…' : state.twitch.status === 'error' ? 'Connection needs attention' : 'Not connected';
    $('#twitch-status').textContent = label;
    $('#audience-twitch-status').textContent = connected || connecting ? label : state.twitch.status === 'error' ? 'Reconnect Twitch to restore audience controls.' : 'Connect your channel for chat commands and Channel Points.';
    $('#audience-connect-twitch').textContent = connected ? 'Manage Twitch' : saved || state.twitch.status === 'error' ? 'Reconnect Twitch' : 'Connect Twitch';
    $('#audience-connect-twitch').disabled = twitchBusy;
    $('#connect-twitch').disabled = twitchBusy || !configured || connecting;
    $('#connect-twitch').textContent = twitchBusy ? 'Please wait…' : connected ? 'Switch Twitch account' : saved ? 'Authorize again on Twitch' : 'Connect Twitch';
    $('#reconnect-twitch').hidden = !saved || connected;
    $('#reconnect-twitch').disabled = twitchBusy || connecting;
    $('#disconnect-twitch').hidden = !saved;
    $('#disconnect-twitch').disabled = twitchBusy;
    $('#save-twitch-app').disabled = twitchBusy;
    $('#load-rewards').disabled = twitchBusy || !connected;
    $('#twitch-live-notice').hidden = state.mode !== 'live';
    const needsSubscriptions = state.baseSettings.addons.some(a => a.enabled && a.trigger === 'subscription');
    $('#twitch-permissions').textContent = 'Approve access to read chat and Channel Points redemptions' + (needsSubscriptions ? ', plus new subscriptions' : '') + '. AuraMax cannot post chat messages.';
    if (needsSubscriptions && connected && !state.twitch.subscriptionAccess) $('#twitch-permissions').textContent += ' Authorize again on Twitch to enable subscription add-ons.';
    if (connected && needsSubscriptions && !state.twitch.subscriptionAccess) $('#connect-twitch').textContent = 'Authorize subscription access';
    $('#twitch-setup-hint').textContent = !configured ? 'Add the application details below once, then connect your Twitch account.' : connected ? 'Your chat is connected. Configure viewer add-ons in the studio and map rewards below.' : connecting ? 'Authorization received. Waiting for the chat connection.' : 'You will return here after approving access on Twitch.';
  }
  async function twitchAction(work) {
    if (twitchBusy) return;
    twitchBusy = true; $('#twitch-error').textContent = ''; renderTwitch(getState());
    try { await work(); } catch (error) { $('#twitch-error').textContent = error.message; }
    finally { twitchBusy = false; renderTwitch(getState()); }
  }
  $('#audience-connect-twitch').addEventListener('click', () => open(1, { audience: true }));
  $('#copy-twitch-callback').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#oauth-callback').textContent); toast('Callback URL copied. Add it to your Twitch application.'); }
    catch { toast('Copy the callback URL shown in the setup panel.'); }
  });
  $('#connections-dialog').addEventListener('close', stopPreview);
  $$('[data-step]').forEach(button => button.addEventListener('click', () => step(Number(button.dataset.step))));
  $('#setup-next').addEventListener('click', () => step(order[Math.min(4, order.indexOf(page) + 1)])); $('#setup-back').addEventListener('click', () => step(order[Math.max(0, order.indexOf(page) - 1)]));
  $('#openai-form').addEventListener('submit', event => {
    event.preventDefault(); const key = $('#openai-key').value; $('#openai-key').value = '';
    void busy(event.submitter, async () => { stopCapture(); await api('setup/openai', { key }); $('#openai-result').textContent = 'Key saved locally. Check the connection, then try the translation test.'; }, $('#openai-result'));
  });
  $('#validate-openai').addEventListener('click', event => busy(event.currentTarget, async () => {
    $('#openai-result').textContent = 'Checking your account…'; const result = await api('setup/validate');
    $('#openai-result').textContent = 'Key accepted. Model listing is not a live capability test.\n' + Object.entries(result.models).map(([name, value]) => `${name}: ${value.model} · ${value.listed ? 'listed' : 'not listed for this account'}`).join('\n');
  }, $('#openai-result')));
  $('#test-translation').addEventListener('click', event => busy(event.currentTarget, async () => {
    $('#openai-result').textContent = 'Translating a short test phrase…'; const result = await api('setup/test'); $('#openai-result').textContent = `${result.source}\n${result.translation}\n${(result.latency / 1000).toFixed(1)} seconds for this request. Microphone and camera still need a live test.`;
  }, $('#openai-result')));
  $('#twitch-app-form').addEventListener('submit', event => {
    event.preventDefault(); const clientId = $('#twitch-client').value.trim(), clientSecret = $('#twitch-secret').value; $('#twitch-secret').value = '';
    void twitchAction(async () => { await api('setup/twitch', { clientId, clientSecret }); $('#twitch-error').textContent = 'Application saved. Connect your Twitch account next.'; $('#twitch-app-details').open = false; });
  });
  $('#connect-twitch').addEventListener('click', () => twitchAction(async () => { const result = await api('twitch/oauth'); stopCapture(); stopPreview(); location.assign(result.url); }));
  $('#reconnect-twitch').addEventListener('click', () => twitchAction(() => api('twitch/connect')));
  $('#disconnect-twitch').addEventListener('click', () => twitchAction(async () => { await api('twitch/disconnect'); $('#reward-mappings').replaceChildren(); $('#twitch-error').textContent = 'Twitch disconnected. You can still use captions.'; }));
  $('#load-rewards').addEventListener('click', event => busy(event.currentTarget, async () => {
    const { rewards } = await api('twitch/rewards'); $('#reward-mappings').replaceChildren();
    if (!rewards.length) $('#reward-mappings').textContent = 'No custom rewards found. Create one in Twitch first.';
    for (const reward of rewards) {
      const row = document.createElement('label'); row.className = 'reward-row';
      const title = document.createElement('span'); title.textContent = `${reward.title} · ${reward.cost} points`;
      const select = document.createElement('select'); select.setAttribute('aria-label', `Effect for ${reward.title}`);
      select.append(new Option('No effect', ''), ...Object.entries({ ...modeNames, ...Object.fromEntries(getState().baseSettings.addons.map(a => [`addon:${a.id}`, a.name])), ...Object.fromEntries(voiceLanguages.map(item => [`voice:${item.code}`, `Voice: ${item.name} · ${getState().baseSettings.voiceViewerDuration} seconds`])) }).map(([id, name]) => new Option(name, id)));
      select.value = getState().baseSettings.rewardMappings[reward.id] || '';
      select.addEventListener('change', () => { const mappings = { ...getState().baseSettings.rewardMappings }; if (select.value) mappings[reward.id] = select.value; else delete mappings[reward.id]; void settings({ rewardMappings: mappings }); });
      row.append(title, select); $('#reward-mappings').append(row);
    }
  }, $('#twitch-error')));
  for (const [id, key] of [['microphone-device', 'microphoneId'], ['camera-device', 'cameraId'], ['camera-enabled', 'cameraEnabled']]) $(`#${id}`).addEventListener('change', event => { void settings({ [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }); if (getState()?.mode === 'live') toast('Applying input changes.'); });
  for (const key of ['x', 'y', 'width', 'height']) $(`#crop-${key}`).addEventListener('input', event => settings({ crop: { ...getState().baseSettings.crop, [key]: Number(event.target.value) } }));
  $('#test-devices').addEventListener('click', event => busy(event.currentTarget, async () => {
    if (getState()?.mode === 'live') { $('#device-result').textContent = 'A live session is using your inputs. Stop it before running this local preview.'; return; }
    stopPreview(); const epoch = previewEpoch, config = getState().baseSettings;
    const keep = stream => { if (epoch !== previewEpoch) { stream.getTracks().forEach(track => track.stop()); return false; } previewStreams.push(stream); return true; };
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser does not expose microphone capture.'), {name:'UnsupportedCapture'});
    const audio = await navigator.mediaDevices.getUserMedia({ audio: config.microphoneId ? { deviceId: { exact: config.microphoneId } } : true, video: false }); if (!keep(audio)) return;
    previewContext = new AudioContext(); const analyser = previewContext.createAnalyser(); analyser.fftSize = 256; previewContext.createMediaStreamSource(audio).connect(analyser);
    const values = new Uint8Array(analyser.fftSize);
    const meter = () => { if (epoch !== previewEpoch) return; analyser.getByteTimeDomainData(values); const level = Math.sqrt(values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / values.length); $('#input-meter').value = Math.min(1, level * 4); frame = requestAnimationFrame(meter); }; meter();
    $('#device-result').textContent = 'Microphone preview active. No media is sent to an AI provider.';
    if (config.cameraEnabled) {
      try { const video = await navigator.mediaDevices.getUserMedia({ video: config.cameraId ? { deviceId: { exact: config.cameraId } } : true, audio: false }); if (!keep(video)) return; $('#camera-preview').srcObject = video; await $('#camera-preview').play(); }
      catch { $('#device-result').textContent += ' Camera unavailable; check permission or try OBS Virtual Camera.'; }
    }
    await enumerate();
  }, $('#device-result')));
  $('#stop-device-test').addEventListener('click', () => { stopPreview(); $('#device-result').textContent = 'Input preview stopped.'; });
  for (const [value, name] of Object.entries(modeNames)) { const button = document.createElement('button'); button.textContent = name; button.addEventListener('click', async () => { await settings({ tracks: { primary: { mode: value } } }); toast(`${name} selected.`); }); $('#setup-mode-options').append(button); }
  $('#setup-show-studio').addEventListener('click', () => $('#connections-dialog').close());
  $('#setup-demo').addEventListener('click', async () => { stopCapture(); stopPreview(); await api('session', { mode: 'demo' }); $('#connections-dialog').close(); toast('Labeled sample captions are playing in the overlay.'); });
  $('#finish-setup').addEventListener('click', async () => { await settings({ setupComplete: true }); $('#connections-dialog').close(); toast('Setup saved. Start a live session when ready.'); });
  return { open, stopPreview, showCamera, render(state) {
    for (const option of $$('#reward-mappings option[value^="voice:"]')) {
      const language = voiceLanguages.find(item => `voice:${item.code}` === option.value);
      if (language) option.textContent = `Voice: ${language.name} · ${state.baseSettings.voiceViewerDuration} seconds`;
    }
    $('#openai-status').textContent = state.available.openai ? 'KEY CONFIGURED' : 'NO API KEY';
    renderTwitch(state);
    if (!twitchBusy && state.twitch.error !== lastTwitchError) {
      lastTwitchError = state.twitch.error;
      $('#twitch-error').textContent = state.twitch.error || '';
    }
    $('#microphone-status').textContent = state.microphone.status === 'error' ? microphoneFailure(state.microphone).message : state.microphone.error || `${state.microphone.status} · ${state.microphone.provider || 'no provider'}`;
    $('#camera-enabled').checked = state.baseSettings.cameraEnabled;
    const crop = state.baseSettings.crop;
    for (const key of ['x', 'y', 'width', 'height']) if (document.activeElement !== $(`#crop-${key}`)) $(`#crop-${key}`).value = crop[key];
    Object.assign($('#crop-outline').style, { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%`, right: 'auto', bottom: 'auto' });
  } };
}
