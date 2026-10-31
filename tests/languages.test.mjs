import test from 'node:test';
import assert from 'node:assert/strict';
import { captionLanguages, translationLanguages } from '../public/languages.js';
import { sanitizeSettings, parseCommand } from '../src/state.mjs';
import { StreamSession } from '../src/session.mjs';
import { OpenAIProvider } from '../src/providers.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));

test('every translation language reaches provider, overlay and transcript through moderator commands', async () => {
  for (const language of translationLanguages) {
    let prompt;
    const provider = new OpenAIProvider({ credentials: { get: async () => ({ openaiKey: 'test-only' }) }, fetcher: async (_url, options) => {
      prompt = JSON.parse(options.body).instructions;
      return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ translation: `fixture-${language.code}` }) }] }] }) };
    } });
    const session = new StreamSession({ streamerId: 'language-test', provider });
    session.available.openai = true;
    const context = session.begin('live');
    const text = `!captions ${language.code.toUpperCase()}`;
    assert.equal(parseCommand(text, false), null);
    const command = parseCommand(text, true);
    assert.ok(command);
    assert.equal(session.action({ id: 'viewer', ...command, moderator: false }).applied, false);
    assert.equal(session.action({ id: 'moderator', ...command, moderator: true }).applied, true);
    session.acceptSpeech({ ...context, sequence: 1, revision: 1, segmentId: 'one', text: 'Hello everyone.', final: true });
    await flush();
    assert.ok(prompt.includes(`into ${language.name}.`));
    assert.equal(session.overlay().caption.translation, `fixture-${language.code}`);
    assert.equal(session.snapshot().transcript[0].translation, `fixture-${language.code}`);
    session.close();
  }
});
test('new languages work in every demo mode without fabricating samples or making provider calls', () => {
  const session = new StreamSession({ streamerId: 'demo', provider: { translate() { throw new Error('Demo must not call provider'); } } });
  for (const language of captionLanguages) {
    assert.equal(sanitizeSettings({ secondaryLanguage: language.code }).secondaryLanguage, language.code);
    for (const preset of ['captions', 'context', 'describe', 'chorus', 'chaos']) {
      session.setSettings({ language: language.code === 'en' ? 'fr' : language.code, secondaryLanguage: language.code, preset });
      const overlay = session.overlay();
      if (!['zh', 'es', 'ja'].includes(language.code)) assert.equal(overlay.caption.translation, '');
      if (!['en', 'zh', 'es', 'ja'].includes(language.code)) assert.equal(overlay.secondary, null);
    }
  }
  session.close();
});
test('unknown codes cannot enter settings, commands or paid provider prompts', async () => {
  const session = new StreamSession({ streamerId: 'invalid', provider: {} });
  const provider = new OpenAIProvider({ credentials: { get: async () => { throw new Error('Credential access should not happen'); } } });
  for (const code of ['xx', 'constructor', '__proto__', 'fr extra', 'en']) {
    assert.equal(parseCommand(`!captions ${code}`, true), null);
    assert.equal(session.action({ id: code, kind: 'language', value: code, moderator: true }).applied, false);
    assert.equal(sanitizeSettings({ language: code }).language, 'zh');
  }
  await assert.rejects(provider.translate({}, 'Hello', 'constructor'), /Unsupported caption language/);
  session.close();
});
