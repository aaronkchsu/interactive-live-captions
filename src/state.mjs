import { voiceLanguages, voiceSupported } from '../public/voice-languages.js';
import { migrateTracks, sanitizeTrack, sanitizeAddons, addonDefaults, trackIds } from '../public/track-model.js';
import { captionLanguages, translationLanguages, translationSupported } from '../public/languages.js';
/** @type {Readonly<import('./contracts.js').Settings>} */
export const defaults = Object.freeze({
  schemaVersion: 3, tracks: migrateTracks(), addons: structuredClone(addonDefaults), viewerStyles: true,
  style: "spotlight", language: "zh", display: "both", fontSize: 42,
  position: "bottom", hold: 5, backplate: 76, emphasis: true,
  reducedMotion: false, safeArea: true, format: "landscape", cooldown: 12,
  preset: 'captions', secondaryLanguage: 'zh', secondaryPosition: 'above', chaosPlacement: 'alongside',
  chorusTone: 'playful', allowedModes: ['captions', 'context', 'describe', 'chorus', 'chaos'],
  microphoneId: '', cameraId: '', cameraEnabled: false, crop: { x: 0, y: 0, width: 1, height: 1 },
  voiceLanguage: 'zh', voiceEnabled: false, voiceViewerEnabled: false, voiceViewerDuration: 20, rewardMappings: {}, setupComplete: false
});
const choices = {
  voiceLanguage: voiceLanguages.map(item => item.code),
  style: ["spotlight", "paper", "comic"], language: translationLanguages.map(item => item.code),
  display: ["both", "source", "translation"], position: ["bottom", "center", "top"],
  format: ["landscape", "portrait"], preset: ['captions', 'context', 'describe', 'chorus', 'chaos'],
  secondaryLanguage: captionLanguages.map(item => item.code), secondaryPosition: ['above', 'below'],
  chaosPlacement: ['alongside', 'replace'], chorusTone: ['literal', 'playful']
};
const numbers = { fontSize: [28, 64], hold: [3, 10], backplate: [45, 100], cooldown: [5, 60], voiceViewerDuration: [5, 120] };
export function sanitizeSettings(input, current = defaults) {
  const next = { ...current };
  next.tracks = structuredClone(current.tracks || migrateTracks(current));
  if (!input.tracks && ['preset', 'display', 'language', 'secondaryLanguage', 'chaosPlacement', 'chorusTone'].some(key => Object.hasOwn(input, key))) next.tracks = migrateTracks({ ...current, ...input, tracks: undefined });
  if (input.tracks) for (const id of trackIds) next.tracks[id] = sanitizeTrack(input.tracks[id], next.tracks[id]);
  next.tracks.primary.enabled = true;
  if (!input.tracks && ['style', 'fontSize', 'backplate', 'emphasis', 'position'].some(key => Object.hasOwn(input, key))) next.tracks.primary = sanitizeTrack({ design: input }, next.tracks.primary);
  next.addons = sanitizeAddons(input.addons, current.addons);
  next.schemaVersion = 3;
  for (const [key, allowed] of Object.entries(choices)) if (allowed.includes(input[key])) next[key] = input[key];
  for (const [key, [min, max]] of Object.entries(numbers)) if (typeof input[key] === "number" && Number.isFinite(input[key])) next[key] = Math.min(max, Math.max(min, input[key]));
  for (const key of ["emphasis", "reducedMotion", "safeArea", 'cameraEnabled', 'setupComplete', 'voiceEnabled', 'voiceViewerEnabled', 'viewerStyles']) if (typeof input[key] === "boolean") next[key] = input[key];
  for (const key of ['microphoneId', 'cameraId']) if (typeof input[key] === 'string') next[key] = input[key].slice(0, 300);
  if (Array.isArray(input.allowedModes)) next.allowedModes = [...new Set(input.allowedModes.filter(value => choices.preset.includes(value)))];
  if (input.crop && typeof input.crop === 'object') {
    const crop = { ...next.crop };
    for (const key of ['x', 'y', 'width', 'height']) if (Number.isFinite(input.crop[key])) crop[key] = Math.max(0, Math.min(1, input.crop[key]));
    crop.x = Math.min(.9, crop.x); crop.y = Math.min(.9, crop.y);
    crop.width = Math.max(.1, Math.min(1 - crop.x, crop.width)); crop.height = Math.max(.1, Math.min(1 - crop.y, crop.height)); next.crop = crop;
  }
  if (input.rewardMappings && typeof input.rewardMappings === 'object' && !Array.isArray(input.rewardMappings)) {
    const legacyRewards = { captions: 'addon:subtitles', context: 'addon:commentary', describe: 'addon:commentary', chorus: 'addon:commentary', chaos: 'addon:roast' };
    next.rewardMappings = Object.fromEntries(Object.entries(input.rewardMappings).slice(0, 100).map(([id,value]) => [id, legacyRewards[String(value)] || value]).filter(([id, value]) => /^[a-zA-Z0-9-]{1,100}$/.test(id) && ([...choices.preset, 'subtitles', 'commentary', ...voiceLanguages.map(item => `voice:${item.code}`)].includes(String(value)) || next.addons.some(a => `addon:${a.id}` === value))));
  }
  return next;
}

// Session + language + sequence identify the exact text a translation belongs to.
export function isCurrentTranslation(state, ticket) {
  return state.session === ticket.session && state.settings.language === ticket.language &&
    state.caption.id === ticket.id && state.caption.source === ticket.source && state.mode === "live";
}
export function parseCommand(text, isModerator = false) {
  const voice = /^!voice(?:\s+([a-z]{2}))?\s*$/i.exec(text.trim());
  if (voice && (!voice[1] || voiceSupported(voice[1].toLowerCase()))) return { kind: 'voice', value: voice[1]?.toLowerCase() || '' };
  const addon = /^!addon\s+([a-z][a-z0-9-]{0,30})\s*$/i.exec(text.trim());
  if (addon) return { kind: 'addon', value: addon[1].toLowerCase() };
  const modern = /^!mode\s+(subtitles|commentary)\s*$/i.exec(text.trim());
  if (modern) return { kind: 'addon', value: modern[1].toLowerCase() };
  const mode = /^!mode\s+(captions|context|describe|chorus|chaos)\s*$/i.exec(text.trim());
  if (mode && isModerator) return { kind: 'mode', value: mode[1].toLowerCase() };
  if (isModerator && /^!mode\s+reset\s*$/i.test(text.trim())) return { kind: 'reset', value: '' };
  const match = /^!style\s+(spotlight|paper|comic)\s*$/i.exec(text.trim());
  if (match) return { kind: "style", value: match[1].toLowerCase() };
  const language = /^!captions\s+([a-z-]+)\s*$/i.exec(text.trim());
  if (language && isModerator && translationSupported(language[1].toLowerCase())) return { kind: "language", value: language[1].toLowerCase() };
  return null;
}
export function acceptCaption(state, input) {
  if (input.session !== state.session || state.mode !== "live" || !Number.isInteger(input.id) || input.id < state.caption.id) return false;
  if (input.id === state.caption.id && state.caption.final && !input.final) return false;
  const source = String(input.text ?? "").slice(0, 1000).trim();
  if (!source) return false;
  state.caption = { id: input.id, source, translation: "", final: !!input.final, emphasis: "", at: Date.now(), origin: "microphone" };
  return true;
}
