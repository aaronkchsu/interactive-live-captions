export function setupStudio({ api, getState, settings, toast, stopCapture, modeNames }) {
  const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
  let page = 0, previewEpoch = 0, previewStreams = [], previewContext, frame, liveCamera;
  function step(index) {
    page = Math.max(0, Math.min(4, index));
    $$('[data-page]').forEach(element => element.hidden = Number(element.dataset.page) !== page);
    $$('[data-step]').forEach(button => { const selected = Number(button.dataset.step) === page; button.classList.toggle('selected', selected); button.setAttribute('aria-current', selected ? 'step' : 'false'); });
    $('#setup-progress').textContent = `Step ${page + 1} of 5`; $('#setup-back').disabled = page === 0; $('#setup-next').hidden = page === 4;
  }
  async function open(index = 0) {
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
    try { await work(); } catch (error) { if (output) output.textContent = error.message; else toast(error.message); }
    finally { button.disabled = false; }
  }
  $('#connections-dialog').addEventListener('close', stopPreview);
  $$('[data-step]').forEach(button => button.addEventListener('click', () => step(Number(button.dataset.step))));
  $('#setup-next').addEventListener('click', () => step(page + 1)); $('#setup-back').addEventListener('click', () => step(page - 1));
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
    void busy(event.submitter, async () => { await api('setup/twitch', { clientId, clientSecret }); $('#twitch-error').textContent = 'Application saved. Connect your Twitch account next.'; $('#twitch-app-details').open = false; }, $('#twitch-error'));
  });
  $('#connect-twitch').addEventListener('click', event => busy(event.currentTarget, async () => { const result = await api('twitch/oauth'); stopCapture(); stopPreview(); location.assign(result.url); }, $('#twitch-error')));
  $('#reconnect-twitch').addEventListener('click', event => busy(event.currentTarget, () => api('twitch/connect'), $('#twitch-error')));
  $('#disconnect-twitch').addEventListener('click', event => busy(event.currentTarget, () => api('twitch/disconnect'), $('#twitch-error')));
  $('#load-rewards').addEventListener('click', event => busy(event.currentTarget, async () => {
    const { rewards } = await api('twitch/rewards'); $('#reward-mappings').replaceChildren();
    if (!rewards.length) $('#reward-mappings').textContent = 'No custom rewards found. Create one in Twitch first.';
    for (const reward of rewards) {
      const row = document.createElement('label'); row.className = 'reward-row';
      const title = document.createElement('span'); title.textContent = `${reward.title} · ${reward.cost} points`;
      const select = document.createElement('select'); select.setAttribute('aria-label', `Effect for ${reward.title}`);
      select.append(new Option('No effect', ''), ...Object.entries({ ...modeNames, 'voice:zh': 'Speak Chinese · 20 seconds' }).map(([id, name]) => new Option(name, id)));
      select.value = getState().baseSettings.rewardMappings[reward.id] || '';
      select.addEventListener('change', () => { const mappings = { ...getState().baseSettings.rewardMappings }; if (select.value) mappings[reward.id] = select.value; else delete mappings[reward.id]; void settings({ rewardMappings: mappings }); });
      row.append(title, select); $('#reward-mappings').append(row);
    }
  }, $('#twitch-error')));
  for (const [id, key] of [['microphone-device', 'microphoneId'], ['camera-device', 'cameraId'], ['camera-enabled', 'cameraEnabled']]) $(`#${id}`).addEventListener('change', event => { void settings({ [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }); if (getState()?.mode === 'live') toast('Restart the live session to apply device changes.'); });
  for (const key of ['x', 'y', 'width', 'height']) $(`#crop-${key}`).addEventListener('input', event => settings({ crop: { ...getState().baseSettings.crop, [key]: Number(event.target.value) } }));
  $('#test-devices').addEventListener('click', event => busy(event.currentTarget, async () => {
    if (getState()?.mode === 'live') { $('#device-result').textContent = 'A live session is using your inputs. Stop it before running this local preview.'; return; }
    stopPreview(); const epoch = previewEpoch, config = getState().baseSettings;
    const keep = stream => { if (epoch !== previewEpoch) { stream.getTracks().forEach(track => track.stop()); return false; } previewStreams.push(stream); return true; };
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
  for (const [value, name] of Object.entries(modeNames)) { const button = document.createElement('button'); button.textContent = name; button.addEventListener('click', async () => { await settings({ preset: value }); toast(`${name} selected.`); }); $('#setup-mode-options').append(button); }
  $('#setup-show-studio').addEventListener('click', () => $('#connections-dialog').close());
  $('#setup-demo').addEventListener('click', async () => { stopCapture(); stopPreview(); await api('session', { mode: 'demo' }); $('#connections-dialog').close(); toast('Labeled sample captions are playing in the overlay.'); });
  $('#finish-setup').addEventListener('click', async () => { await settings({ setupComplete: true }); $('#connections-dialog').close(); toast('Setup saved. Start a live session when ready.'); });
  return { open, stopPreview, showCamera, render(state) {
    $('#openai-status').textContent = state.available.openai ? 'KEY CONFIGURED' : 'NO API KEY'; $('#twitch-status').textContent = state.twitch.status.toUpperCase();
    if (state.twitch.error) $('#twitch-error').textContent = state.twitch.error;
    $('#microphone-status').textContent = state.microphone.error || `${state.microphone.status} · ${state.microphone.provider || 'no provider'}`;
    $('#camera-enabled').checked = state.baseSettings.cameraEnabled;
    const crop = state.baseSettings.crop;
    for (const key of ['x', 'y', 'width', 'height']) if (document.activeElement !== $(`#crop-${key}`)) $(`#crop-${key}`).value = crop[key];
    Object.assign($('#crop-outline').style, { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%`, right: 'auto', bottom: 'auto' });
  } };
}
