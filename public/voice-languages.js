import { captionLanguage } from './languages.js';
// Realtime Translation output languages; independent of the caption catalog.
// https://developers.openai.com/cookbook/examples/voice_solutions/realtime_translation_guide
export const voiceLanguages = Object.freeze(['en', 'zh', 'es', 'ja', 'fr', 'de', 'pt', 'it', 'ko', 'hi', 'ru', 'vi', 'id'].map(code => Object.freeze({ ...captionLanguage(code), name: code === 'zh' ? 'Chinese' : captionLanguage(code).name })));
export const voiceLanguage = code => voiceLanguages.find(item => item.code === code);
export const voiceSupported = code => !!voiceLanguage(code);
