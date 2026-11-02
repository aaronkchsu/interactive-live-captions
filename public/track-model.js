import { fontIds, sanitizeFontName } from './fonts.js';
import { captionLanguage } from './languages.js';
export const trackIds = ['primary', 'secondary'];
export const toneNames = ['Factual', 'Playful', 'Cheeky', 'Roast'];
export const designDefaults = Object.freeze({ style: 'spotlight', fontSize: 42, backplate: 76, emphasis: true, color: '#ffffff', accent: '#f4e83d', font: 'sans', customFont: '', position: 'bottom' });
export function newTrack(id = 'primary') {
  return { enabled: id === 'primary', mode: 'subtitles', language: id === 'primary' ? 'en' : 'zh', troll: 1,
    inputs: { mic: true, chat: true, camera: false }, design: { ...designDefaults, fontSize: id === 'primary' ? 42 : 34 } };
}
/** @param {any} input @param {any} current */
export function sanitizeDesign(input = {}, current = designDefaults) {
  const next = { ...current };
  for (const [key, values] of Object.entries({ style: ['spotlight', 'paper', 'comic'], position: ['top', 'center', 'bottom'], font: fontIds })) if (values.includes(input[key])) next[key] = input[key];
  for (const [key, min, max] of [['fontSize', 24, 80], ['backplate', 0, 100]]) if (Number.isFinite(input[key])) next[key] = Math.min(Number(max), Math.max(Number(min), input[key]));
  for (const key of ['color', 'accent']) if (/^#[\da-f]{6}$/i.test(input[key])) next[key] = input[key];
  if (typeof input.customFont === 'string') next.customFont = sanitizeFontName(input.customFont);
  if (typeof input.emphasis === 'boolean') next.emphasis = input.emphasis;
  return next;
}
export function sanitizeTrack(input = {}, current = newTrack()) {
  const next = { ...current, inputs: { ...current.inputs }, design: sanitizeDesign(input.design, current.design) };
  if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
  if (['subtitles', 'commentary'].includes(input.mode)) next.mode = input.mode;
  if (captionLanguage(input.language)) next.language = input.language;
  if (Number.isFinite(input.troll)) next.troll = Math.max(0, Math.min(3, Math.round(input.troll)));
  for (const key of ['mic', 'chat', 'camera']) if (typeof input.inputs?.[key] === 'boolean') next.inputs[key] = input.inputs[key];
  return next;
}
// One boundary for old saved presets; new clients only edit tracks.
export function migrateTracks(settings = {}) {
  const primary = newTrack(), secondary = newTrack('secondary');
  const legacy = ['preset', 'display', 'language', 'secondaryLanguage'].some(key => Object.hasOwn(settings, key));
  if (legacy) {
    primary.design = sanitizeDesign(settings); secondary.design = { ...primary.design, fontSize: Math.max(24, primary.design.fontSize - 8) };
    if (settings.display === 'translation') primary.language = settings.language || 'zh';
    else if (settings.display !== 'source') { secondary.enabled = true; secondary.language = settings.language || 'zh'; }
    if (settings.preset && settings.preset !== 'captions') {
      const target = settings.preset === 'describe' || (settings.preset === 'chaos' && settings.chaosPlacement === 'replace') ? primary : secondary;
      if (target === primary) secondary.enabled = false;
      Object.assign(target, { enabled: true, mode: 'commentary', language: settings.secondaryLanguage || settings.language || 'en', troll: settings.preset === 'chaos' ? 3 : settings.chorusTone === 'literal' || settings.preset === 'describe' ? 0 : 1,
        inputs: { mic: settings.preset !== 'chorus', chat: settings.preset !== 'describe', camera: settings.preset !== 'chorus' && !!settings.cameraEnabled } });
    }
  }
  if (settings.tracks) for (const id of trackIds) Object.assign(id === 'primary' ? primary : secondary, sanitizeTrack(settings.tracks[id], id === 'primary' ? primary : secondary));
  primary.enabled = true;
  return { primary, secondary };
}
export function inputPlan(settings) {
  const tracks = settings.tracks || migrateTracks(settings), active = trackIds.map(id => tracks[id]).filter(t => t.enabled);
  const comment = active.filter(t => t.mode === 'commentary');
  return { microphone: !!settings.voiceEnabled || active.some(t => t.mode === 'subtitles' || t.inputs.mic),
    speech: active.some(t => t.mode === 'subtitles' || t.inputs.mic), audio: comment.some(t => t.inputs.mic),
    camera: comment.some(t => t.inputs.camera), chat: comment.some(t => t.inputs.chat), commentary: comment.length > 0,
    languages: [...new Set(active.filter(t => t.mode === 'subtitles' && t.language !== 'en').map(t => t.language))] };
}
export const addonDefaults = [
  { id: 'commentary', name: 'Switch to commentary', enabled: true, trigger: 'command', target: 'primary', kind: 'mode', value: 'commentary', duration: 20, persistent: false },
  { id: 'subtitles', name: 'Switch to subtitles', enabled: true, trigger: 'command', target: 'primary', kind: 'mode', value: 'subtitles', duration: 20, persistent: false },
  { id: 'roast', name: 'Turn up the roast', enabled: false, trigger: 'command', target: 'primary', kind: 'troll', value: '3', duration: 20, persistent: false },
  { id: 'red', name: 'Bright red', enabled: true, trigger: 'command', target: 'primary', kind: 'design', value: 'red', duration: 20, persistent: false }
];
export function sanitizeAddons(input, current = addonDefaults) {
  if (!Array.isArray(input)) return structuredClone(current);
  const ids = new Set();
  return input.slice(0, 20).flatMap(item => {
    if (!item || !/^[a-z][a-z0-9-]{0,30}$/.test(item.id) || ids.has(item.id)) return [];
    ids.add(item.id);
    const kind = ['mode', 'troll', 'design', 'language'].includes(item.kind) ? item.kind : 'mode';
    const value = String(item.value ?? '');
    if (!(kind === 'mode' ? ['subtitles', 'commentary'].includes(value) : kind === 'troll' ? /^[0-3]$/.test(value) : kind === 'design' ? ['red', 'spotlight', 'paper', 'comic'].includes(value) : !!captionLanguage(value))) return [];
    return [{ id: item.id, name: String(item.name || item.id).slice(0, 60), enabled: item.enabled === true,
      trigger: ['command', 'subscription'].includes(item.trigger) ? item.trigger : 'command', target: item.target === 'secondary' ? 'secondary' : 'primary', kind, value,
      duration: Math.max(5, Math.min(120, Number(item.duration) || 20)), persistent: item.persistent === true }];
  });
}
export function addonPatch(addon) {
  const patch = addon.kind === 'mode' ? { mode: addon.value } : addon.kind === 'language' ? { language: addon.value } : addon.kind === 'troll' ? { troll: Number(addon.value) } : { design: addon.value === 'red' ? { color: '#ffffff', accent: '#ff3838', style: 'comic' } : { style: addon.value } };
  return { tracks: { [addon.target]: patch } };
}
