import { captionLanguages } from './languages.js';
import { inputPlan, toneNames } from './track-model.js';
export function trackEditor({ settings, getState, api, toast, onSelect }) {
  const root = document.querySelector('#track-editor'); let selected = 'primary';
  root.innerHTML = `<div class="track-tabs" role="group" aria-label="Edit track"><button data-track="primary" aria-pressed="true">Primary</button><button data-track="secondary" aria-pressed="false" hidden>Secondary</button></div>
    <div class="track-mode-options" role="group" aria-label="Track content"><button data-mode="subtitles"><strong>Subtitles</strong><span>Your speech, in their language.</span></button><button data-mode="commentary"><strong>Commentary</strong><span>React to you and your chat.</span></button></div>
    <label for="track-language">Language</label><select id="track-language"></select>
    <div id="commentary-controls" hidden><div class="field-heading"><label for="track-troll">Commentary tone</label><output id="track-tone"></output></div><input id="track-troll" type="range" min="0" max="3" step="1"><p id="tone-help" class="field-help"></p><fieldset class="track-inputs"><legend>Use these inputs</legend><label><input type="checkbox" data-input="mic"> Microphone</label><label><input type="checkbox" data-input="chat"> Twitch chat</label><label><input type="checkbox" data-input="camera"> Camera</label></fieldset></div>
    <p id="input-plan" class="field-help" role="status"></p><p id="track-status" class="field-help" role="status"></p>
    <details class="fine-tune"><summary>Advanced: second track <span>+</span></summary><label class="toggle-row"><span>Show a second track<small>Another language, or commentary alongside subtitles.</small></span><input id="secondary-enabled" type="checkbox"><span class="switch"></span></label></details>`;
  const $ = s => root.querySelector(s);
  $('#track-language').append(...captionLanguages.map(l => new Option(`${l.name} · ${l.native}`, l.code)));
  const patch = value => settings({ tracks: { [selected]: value } });
  root.querySelectorAll('[data-track]').forEach(b => b.onclick = () => { selected = b.dataset.track; render(getState()); onSelect(); });
  root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => patch({ mode: b.dataset.mode }));
  $('#track-language').onchange = e => patch({ language: e.target.value });
  $('#track-troll').onchange = e => patch({ troll: Number(e.target.value) });
  $('#track-troll').oninput = e => $('#track-tone').textContent = toneNames[Number(e.target.value)];
  root.querySelectorAll('[data-input]').forEach(input => input.onchange = () => patch({ inputs: { [input.dataset.input]: input.checked } }));
  $('#secondary-enabled').onchange = async e => { const enabled = e.target.checked; if (!enabled) selected = 'primary'; await settings({ tracks: { secondary: { enabled } } }); if (enabled) selected = 'secondary'; render(getState()); onSelect(); };
  function render(state) {
    if (!state.settings.tracks.secondary.enabled) selected = 'primary';
    const track = state.settings.tracks[selected];
    root.querySelector('[data-track="secondary"]').hidden = !state.settings.tracks.secondary.enabled;
    root.querySelectorAll('[data-track]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.track === selected)));
    root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === track.mode)));
    $('#track-language').value = track.language;
    if (document.activeElement !== $('#track-troll')) $('#track-troll').value = track.troll;
    $('#track-tone').textContent = toneNames[track.troll];
    $('#tone-help').textContent = ['Observed facts only.', 'Light jokes about the moment.', 'More teasing, still about the moment.', 'Sharper comedy. No identity attacks or invented accusations.'][track.troll];
    $('#commentary-controls').hidden = track.mode !== 'commentary';
    root.querySelectorAll('[data-input]').forEach(i => i.checked = track.inputs[i.dataset.input]);
    $('#secondary-enabled').checked = state.settings.tracks.secondary.enabled;
    const plan = inputPlan(state.settings);
    $('#input-plan').textContent = 'Session inputs: ' + ([plan.microphone && 'microphone', plan.camera && 'camera', plan.chat && 'chat'].filter(Boolean).join(', ') || 'none selected') + '.';
    const missing = track.mode === 'commentary' ? [!state.available.openai && 'Add an OpenAI key.', track.inputs.chat && state.twitch.status !== 'connected' && 'Connect Twitch for chat.', !Object.values(track.inputs).some(Boolean) && 'Select at least one commentary input.'].filter(Boolean) : [];
    $('#track-status').textContent = missing.join(' ') || (state.mode === 'demo' ? (state.tracks.find(t => t.id === selected)?.text ? 'Sample preview. Live results start with a live session.' : 'No sample for this language. Start a live session for this output.') : state.commentary?.[selected]?.error || '');
    document.querySelector('#design-track-name').textContent = selected === 'primary' ? 'Primary appearance' : 'Secondary appearance';
  }
  return { render, selected: () => selected, patch };
}

export function addonEditor({ settings, getState, api, toast }) {
  const root = document.querySelector('#addon-list'); let key = '';
  function render(state) {
    const next = JSON.stringify(state.baseSettings.addons);
    if (key === next) return; key = next; const openIds = new Set([...root.querySelectorAll('details[open]')].map(el=>el.dataset.addon)); root.replaceChildren();
    for (const addon of state.baseSettings.addons) {
      const item = document.createElement('details'); item.className = 'addon-card'; item.dataset.addon = addon.id; item.open = openIds.has(addon.id);
      const summary = document.createElement('summary'); summary.textContent = `${addon.enabled ? '●' : '○'} ${addon.name}`; item.append(summary);
      const command = document.createElement('code'); command.textContent = `!addon ${addon.id}`; item.append(command);
      const edit = patch => settings({ addons: getState().baseSettings.addons.map(a => a.id === addon.id ? { ...a, ...patch } : a) });
      function control(label, element) { const row = document.createElement('label'); row.textContent = label; row.append(element); item.append(row); return element; }
      const name = control('Name', document.createElement('input')); name.value = addon.name; name.maxLength = 60; name.onchange = () => edit({ name: name.value });
      const enabled = control('Enabled', document.createElement('input')); enabled.type = 'checkbox'; enabled.checked = addon.enabled; enabled.onchange = () => edit({ enabled: enabled.checked });
      for (const [field, label, choices] of [['target', 'Track', { primary: 'Primary', secondary: 'Secondary' }], ['trigger', 'Trigger', { command: 'Chat command / Channel Points', subscription: 'New subscription' }], ['kind', 'Change', { mode: 'Content', troll: 'Tone', design: 'Appearance', language: 'Language' }]]) {
        const select = control(label, document.createElement('select')); select.append(...Object.entries(choices).map(([v,n]) => new Option(n,v))); select.value = addon[field];
        select.onchange = () => edit({ [field]: select.value, ...(field === 'kind' ? { value: { mode: 'commentary', troll: '2', design: 'red', language: 'en' }[select.value] } : {}) });
      }
      const values = addon.kind === 'mode' ? [['subtitles','Subtitles'],['commentary','Commentary']] : addon.kind === 'troll' ? toneNames.map((n,i)=>[String(i),n]) : addon.kind === 'design' ? [['red','Bright red'],['spotlight','Spotlight'],['paper','Notebook'],['comic','Sidekick']] : captionLanguages.map(l=>[l.code,l.name]);
      const value = control('Value', document.createElement('select')); value.append(...values.map(([v,n])=>new Option(n,v))); value.value = addon.value; value.onchange = () => edit({ value: value.value });
      const duration = control('Seconds', document.createElement('input')); duration.type = 'number'; duration.min = '5'; duration.max = '120'; duration.value = addon.duration; duration.onchange = () => edit({ duration: Number(duration.value) });
      const persistent = control('Keep change until I edit it', document.createElement('input')); persistent.type = 'checkbox'; persistent.checked = addon.persistent; persistent.onchange = () => edit({ persistent: persistent.checked });
      const note = document.createElement('p'); note.className = 'field-help'; note.textContent = addon.trigger === 'subscription' ? 'Uses the first enabled subscription add-on. New subscriptions only; reconnect Twitch to grant subscription access.' : addon.persistent ? 'This viewer action updates your saved settings.' : 'When it ends, your saved settings return.'; item.append(note);
      const preview = document.createElement('button'); preview.className = 'secondary-btn'; preview.textContent = 'Test add-on'; preview.disabled = !addon.enabled;
      preview.onclick = async () => { try { const result = await api('action', { kind: 'addon', value: addon.id }); toast(result.applied ? 'Add-on applied.' : result.message); } catch(e) { toast(e.message); } }; item.append(preview); root.append(item);
    }
  }
  document.querySelector('#add-addon').onclick = () => { const current = getState().baseSettings.addons; let n = 1; while(current.some(a=>a.id===`effect-${n}`)) n++; settings({ addons: [...current, { id: `effect-${n}`, name: `Effect ${n}`, enabled: false, target: 'primary', trigger: 'command', kind: 'mode', value: 'commentary', duration: 20, persistent: false }] }); };
  return { render };
}
