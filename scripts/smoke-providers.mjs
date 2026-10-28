// Explicit opt-in: five small, paid requests using synthetic inputs, never real captured media.
import { FileStorage, CredentialProvider } from '../src/storage.mjs';
import { OpenAIProvider } from '../src/providers.mjs';
import { encodeWav } from '../public/microphone.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
if (!process.argv.includes('--paid-synthetic-test')) throw new Error('Opt in with --paid-synthetic-test. This uses your saved key and API credits.');
const credentials = new CredentialProvider(new FileStorage(new URL('../.local', import.meta.url).pathname));
const usage = [], provider = new OpenAIProvider({ credentials, onUsage: (_context, value) => usage.push(value) });
const context = { streamerId: 'local-owner', sessionId: 'synthetic-provider-check' };
function crc(bytes) { let c = 0xffffffff; for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, bytes) { const name = Buffer.from(type), header = Buffer.alloc(4), checksum = Buffer.alloc(4); header.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc(Buffer.concat([name, bytes]))); return Buffer.concat([header, name, bytes, checksum]); }
const header = Buffer.alloc(13); header.writeUInt32BE(32, 0); header.writeUInt32BE(32, 4); header[8] = 8; header[9] = 2;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(32 * (1 + 32 * 3)))), chunk('IEND', Buffer.alloc(0))]);
const image = `data:image/png;base64,${png.toString('base64')}`;
const messages = [1,2,3].map(n => ({ id: String(n), author: `synthetic-viewer-${n}`, text: ['That jump was so close!', 'Almost made the jump!', 'One more try at that jump!'][n-1] }));
const checks = {
  translation: () => provider.translate(context, 'Hello everyone. Welcome to the stream.', 'zh'),
  audio: () => provider.audio(context, encodeWav(new Float32Array(24000 * 3), 24000), 'en'),
  vision: () => provider.vision(context, [image, image], 'en'),
  chorus: () => provider.chorus(context, messages, 'en', 'playful'),
  chaos: () => provider.chaos(context, { speech: ['A synthetic stream test.'], chat: [] }, 'en')
};
const results = {};
for (const [name, run] of Object.entries(checks)) {
  const started = performance.now();
  try { const output = await run(); results[name] = { ok: true, latencyMs: Math.round(performance.now() - started), output }; }
  catch (error) { results[name] = { ok: false, latencyMs: Math.round(performance.now() - started), error: error.message }; }
}
const report = { testedAt: new Date().toISOString(), kind: 'Real API calls with synthetic inputs; not live microphone/camera/Twitch validation', models: provider.models, results, usage };
await mkdir('artifacts', { recursive: true }); await writeFile('artifacts/provider-smoke-result.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
