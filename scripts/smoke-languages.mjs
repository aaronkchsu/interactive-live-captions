// Explicit opt-in, synthetic text only. Never reads captured stream content.
import { FileStorage, CredentialProvider } from '../src/storage.mjs';
import { OpenAIProvider } from '../src/providers.mjs';
import { translationLanguages } from '../public/languages.js';
import { writeFile, mkdir } from 'node:fs/promises';
if (!process.argv.includes('--paid-synthetic-test')) throw new Error('Opt in with --paid-synthetic-test to use API credits.');
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const credentials = new CredentialProvider(new FileStorage(new URL('../.local', import.meta.url).pathname));
const context = { streamerId: 'local-owner', sessionId: 'synthetic-language-check' }, usage = [];
const provider = new OpenAIProvider({ credentials, models: process.env.TRANSLATION_MODEL ? { translation: process.env.TRANSLATION_MODEL } : {}, onUsage: (_context, value) => usage.push(value) });
const source = 'Hello, chat! We have 3 lives left. Do not open the red door.';
const results = [];
// Sequential requests keep this small smoke test away from rate limits.
for (const language of translationLanguages) {
  const start = performance.now();
  try { results.push({ code: language.code, ok: true, output: await provider.translate(context, source, language.code), latencyMs: Math.round(performance.now() - start) }); }
  catch (error) { results.push({ code: language.code, ok: false, error: error.message }); }
  console.log(`${language.code}: ${results.at(-1).ok ? 'received translation' : 'failed'}`);
}
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/language-smoke-result.json', JSON.stringify({ testedAt: new Date().toISOString(), kind: 'Real API, synthetic English input; no microphone or fluent-reader validation', model: provider.models.translation, source, results, usage }, null, 2));
console.log(JSON.stringify({ passed: results.filter(item => item.ok).length, total: results.length }));
process.exitCode = results.every(item => item.ok) ? 0 : 1;
