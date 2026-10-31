/** Shared caption-language catalog. Input speech remains English; dubbing has its own capabilities. */
export const captionLanguages = Object.freeze([
  { code: 'en', name: 'English', native: 'English', tag: 'en', dir: 'ltr' },
  { code: 'zh', name: 'Simplified Chinese', native: '简体中文', tag: 'zh-Hans', dir: 'ltr' },
  { code: 'es', name: 'Spanish', native: 'Español', tag: 'es', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', native: '日本語', tag: 'ja', dir: 'ltr' },
  { code: 'fr', name: 'French', native: 'Français', tag: 'fr', dir: 'ltr' },
  { code: 'de', name: 'German', native: 'Deutsch', tag: 'de', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', native: 'Português', tag: 'pt', dir: 'ltr' },
  { code: 'it', name: 'Italian', native: 'Italiano', tag: 'it', dir: 'ltr' },
  { code: 'ko', name: 'Korean', native: '한국어', tag: 'ko', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', tag: 'hi', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', native: 'العربية', tag: 'ar', dir: 'rtl' },
  { code: 'ru', name: 'Russian', native: 'Русский', tag: 'ru', dir: 'ltr' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', tag: 'uk', dir: 'ltr' },
  { code: 'pl', name: 'Polish', native: 'Polski', tag: 'pl', dir: 'ltr' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', tag: 'nl', dir: 'ltr' },
  { code: 'sk', name: 'Slovak', native: 'Slovenčina', tag: 'sk', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', tag: 'tr', dir: 'ltr' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', tag: 'vi', dir: 'ltr' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', tag: 'id', dir: 'ltr' },
  { code: 'th', name: 'Thai', native: 'ไทย', tag: 'th', dir: 'ltr' },
  { code: 'he', name: 'Hebrew', native: 'עברית', tag: 'he', dir: 'rtl' }
].map(item => Object.freeze(item)));
export const translationLanguages = Object.freeze(captionLanguages.filter(item => item.code !== 'en'));
export const languageByCode = Object.freeze(Object.fromEntries(captionLanguages.map(item => [item.code, item])));
export function captionLanguage(code) { return Object.hasOwn(languageByCode, code) ? languageByCode[code] : undefined; }
export function translationSupported(code) { return code !== 'en' && !!captionLanguage(code); }
export function languageName(code) {
  const language = captionLanguage(code);
  if (!language) throw new Error('Unsupported caption language.');
  return language.name;
}
