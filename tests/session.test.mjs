import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamSession } from '../src/session.mjs';
import { WorkLane } from '../src/scheduler.mjs';
import { ChatWindow } from '../src/chat.mjs';
import { MemoryStorage, CredentialProvider } from '../src/storage.mjs';
import { OpenAIProvider } from '../src/providers.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture(owner = 'alice', overrides = {}) {
  let now = 100000; const requests = [];
  const provider = { translate: (...args) => { const value = deferred(); requests.push({ ...value, args }); return value.promise; }, audio: async () => null, vision: async () => null, chorus: async () => null, chaos: async () => null, commentary: async () => null, ...overrides };
  const session = new StreamSession({ streamerId: owner, provider, settings: { language: 'zh', display: 'both' }, now: () => now }); session.available.openai = true;
  const context = session.begin('live');
  const speech = (sequence, final = true, revision = 1, text = `phrase ${sequence}`) => session.acceptSpeech({ ...context, sequence, segmentId: `s${sequence}`, revision, text, final });
  return { session, context, requests, speech, advance: ms => { now += ms; }, now: () => now };
}

test('a new draft preserves its preceding translated pair and a full reading lifetime', async () => {
  const f = fixture(); f.speech(0); await flush(); f.advance(4500); f.requests[0].resolve('你好'); await flush();
  f.speech(1, false); assert.equal(f.session.overlay().caption.translation, '你好'); assert.equal(f.session.overlay().draft.source, 'phrase 1');
  f.advance(4000); assert.equal(f.session.overlay().caption.translation, '你好'); f.advance(1001); assert.equal(f.session.overlay().caption.translation, '');
});
test('out-of-order finals enrich history; revisions cannot regress and duplicates are idempotent', async () => {
  const f = fixture(); f.speech(1, false, 2); assert.equal(f.speech(1, false, 1), false);
  assert.equal(f.speech(0), true); assert.equal(f.speech(0), false); await flush();
  f.requests[0].resolve('earlier translation'); await flush(); assert.equal(f.session.snapshot().transcript.length, 1); assert.equal(f.session.overlay().draft.sequence, 1);
  assert.equal(f.session.acceptSpeech({ ...f.context, streamerId: 'other', sequence: 2, segmentId: 'x', revision: 1, text: 'intrusion', final: true }), false);
});
test('language away-and-back and session changes reject even uncancellable provider results', async () => {
  const f = fixture(); f.speech(0); await flush();
  f.session.setSettings({ language: 'es' }); await flush(); f.session.setSettings({ language: 'zh' });
  f.requests[0].resolve('old zh'); f.requests[1].resolve('old es'); await flush();
  assert.notEqual(f.session.overlay().caption.translation, 'old zh'); await flush();
  f.requests[2].resolve('new zh'); await flush(); assert.equal(f.session.overlay().caption.translation, 'new zh');
  const old = f.context; f.session.begin('demo'); assert.equal(f.session.owns(old), false); f.session.close();
});
test('overlapping effects always restore the saved baseline; manual changes cancel overrides', () => {
  const f = fixture(); const action = (id, value) => f.session.action({ id, kind: 'style', value, moderator: false, origin: 'twitch' });
  assert.equal(action('a', 'paper').applied, true); f.advance(12000); assert.equal(action('b', 'comic').applied, true);
  f.advance(20001); f.session.tick(); assert.equal(f.session.settings().style, 'spotlight');
  f.advance(12000); action('c', 'paper'); f.session.setSettings({ style: 'comic' }); f.advance(20001); f.session.tick(); assert.equal(f.session.settings().style, 'comic');
});
test('community authority, cooldown, allowed modes and duplicate rewards use the same rules', () => {
  const f = fixture(); f.session.setSettings({ allowedModes: ['chaos'] });
  assert.equal(f.session.action({ id: 'no', kind: 'mode', value: 'describe', moderator: false }).applied, false);
  assert.equal(f.session.action({ id: 'lang', kind: 'language', value: 'es', moderator: false }).applied, false);
  assert.equal(f.session.action({ id: 'reward', kind: 'addon', value: 'commentary', origin: 'reward', moderator: false }).applied, true);
  assert.equal(f.session.action({ id: 'chat', kind: 'addon', value: 'commentary', origin: 'twitch', moderator: false }).applied, false);
  f.advance(13000); assert.equal(f.session.action({ id: 'reward', kind: 'addon', value: 'commentary', moderator: false }).applied, false);
  assert.equal(f.session.action({ id: 'reset', kind: 'reset', moderator: true }).applied, true); assert.equal(f.session.settings().preset, 'captions');
});
test('commentary uses its own track and never enters the speech transcript', async () => {
  const f = fixture('alice', { commentary: async () => ({ text: 'A bold plan.', evidence: ['s0'] }) });
  f.session.setSettings({ tracks: { primary: { mode: 'commentary', language: 'en' }, secondary: { enabled: false } } });
  f.speech(0); f.session.tick(); await flush();
  assert.equal(f.session.overlay().tracks[0].text, 'A bold plan.');
  assert.equal(f.session.snapshot().transcript[0].source, 'phrase 0');
  assert.ok(!JSON.stringify(f.session.snapshot().transcript).includes('bold plan'));
  f.advance(6001); assert.equal(f.session.overlay().tracks[0].text, '');
});
test('optional work cannot block speech, and disabling a mode rejects its late cue', async () => {
  const slow = deferred(), f = fixture('alice', { audio: () => slow.promise }); f.session.setSettings({ tracks: { primary: { mode: 'commentary' }, secondary: { enabled: true, mode: 'subtitles', language: 'zh' } } });
  f.session.ingestMedia('audio', { ...f.context, audio: 'AAAA' }); f.speech(0); await flush();
  assert.equal(f.requests.length, 1); f.requests[0].resolve('hello'); await flush(); assert.equal(f.session.snapshot().transcript[0].translation, 'hello');
  f.session.setSettings({ preset: 'captions' }); slow.resolve({ text: '(laughing)', event: 'laughter', evidence: [] }); await flush(); assert.equal(f.session.overlay().secondary, null);
});
test('work lanes bound pending and active jobs and expire delayed completions', async () => {
  let now = 0; const lane = new WorkLane({ concurrency: 2, capacity: 4, now: () => now }); const tasks = [];
  for (let i = 0; i < 20; i++) { const d = deferred(); tasks.push(d); lane.enqueue({ id: i, at: 0, run: () => d.promise }); }
  assert.equal(lane.snapshot().active, 2); assert.equal(lane.snapshot().queued, 4); assert.equal(lane.snapshot().discarded, 14);
  now = 9000; tasks[0].resolve('late'); tasks[1].resolve('late'); await flush(); assert.equal(lane.snapshot().active, 0); assert.equal(lane.snapshot().queued, 0); assert.equal(lane.snapshot().completed, 0);
});
test('chat caps individual contributions and requires a warmed active baseline for quiet', () => {
  let now = 100000; const chat = new ChatWindow(() => now); chat.connected = true;
  for (let i = 0; i < 30; i++) chat.add({ id: String(i), author: 'one', text: `message ${i}` });
  assert.equal(chat.evidence().length, 3); assert.equal(chat.quiet(), false);
  for (let i = 0; i < 120; i++) { now += 1000; chat.add({ id: `baseline-${i}`, author: `user-${i % 5}`, text: `message ${i}` }); chat.quiet(); }
  let detected = false; for (let i = 0; i < 80; i++) { now += 1000; detected ||= chat.quiet(); }
  assert.equal(detected, true); chat.connected = false; assert.equal(chat.quiet(), false); chat.reset(); assert.equal(chat.quiet(), false);
});
test('two owners isolate state, chat, actions and provider credential routing', async () => {
  const store = new MemoryStorage(), credentials = new CredentialProvider(store), routed = [];
  await credentials.update({ streamerId: 'alice' }, { openaiKey: 'test-alice' }); await credentials.update({ streamerId: 'bob' }, { openaiKey: 'test-bob' });
  const provider = new OpenAIProvider({ credentials, fetcher: async (_url, options) => { routed.push(options.headers.Authorization); return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ translation: 'translation' }) }] }] }) }; } });
  const a = fixture('alice', provider), b = fixture('bob', provider);
  // Use explicit provider methods rather than spreading prototype methods.
  a.session.provider = b.session.provider = provider;
  a.speech(0); b.speech(0); a.session.chat.add({ id: 'a', author: 'one', text: 'private chat' }); await flush();
  assert.deepEqual(routed.sort(), ['Bearer test-alice', 'Bearer test-bob']); assert.equal(b.session.chat.evidence().length, 0);
  a.session.setSettings({ style: 'paper' }); assert.equal(b.session.settings().style, 'spotlight');
  await assert.rejects(provider.translate({ streamerId: 'missing' }, 'hi', 'zh'), /Add your OpenAI key/);
  assert.ok(!JSON.stringify(a.session.snapshot()).includes('test-alice'));
});
test('chorus validates distinct authors and cannot invent supporting message ids', async () => {
  const credentials = new CredentialProvider(new MemoryStorage()); await credentials.update({ streamerId: 'a' }, { openaiKey: 'test' });
  let output = { text: 'Everyone agrees', event: 'none', evidence: ['invented', '2', '3'] };
  const p = new OpenAIProvider({ credentials, fetcher: async () => ({ ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }) }) });
  const messages = [1, 2, 3].map(id => ({ id: String(id), author: String(id), text: 'hello' }));
  assert.equal(await p.chorus({ streamerId: 'a' }, messages, 'en', 'literal'), null);
  output.evidence = ['1', '2', '3']; assert.equal((await p.chorus({ streamerId: 'a' }, messages, 'en', 'literal')).text, 'Everyone agrees');
});
test('a translation too late for display still enriches its exact retained history', async () => {
  const f = fixture(); f.speech(0); await flush(); f.advance(9000); f.requests[0].resolve('迟来的翻译'); await flush();
  assert.equal(f.session.snapshot().transcript[0].translation, '迟来的翻译');
  assert.equal(f.session.snapshot().transcript[0].translationStatus, 'ready:history-only');
  assert.equal(f.session.overlay().caption.source, '');
});
test('commentary receives fresh enabled evidence and capture loss stops its lane', async () => {
  let recent, calls = 0; const f = fixture('alice', { commentary: async (_context, input) => { recent = input; calls++; return { text: 'A bold plan.', evidence: ['s0'] }; } });
  f.session.setSettings({ tracks: { primary: { mode: 'commentary', inputs: { camera: true } }, secondary: { enabled: false } } });
  f.session.trackRuntime.observe({ text: '(standing)', event: 'standing' }, 'obs', f.now(), 'vision');
  f.speech(0); f.session.tick(); await flush();
  assert.equal(recent.observations[0].text, '(standing)'); assert.equal(calls, 1);
  f.advance(31000); f.session.tick(); await flush(); assert.equal(calls, 1); assert.equal(f.session.owns(f.context), false);
});
test('correcting a finalized phrase never pairs its old translation with the new revision', async () => {
  const f = fixture(); f.speech(0); await flush(); f.requests[0].resolve('old translated meaning'); await flush();
  f.speech(0, true, 2, 'corrected meaning'); assert.equal(f.session.overlay().caption.translation, ''); assert.equal(f.session.overlay().caption.source, 'corrected meaning');
  await flush(); f.session.setSettings({ language: 'es' }); await flush(); f.requests[1].resolve('obsolete correction'); await flush();
  assert.equal(f.session.overlay().caption.translation, ''); f.requests[2].resolve('significado corregido'); await flush(); assert.equal(f.session.overlay().caption.translation, 'significado corregido');
});

test('freeze holds the exact presentation while speech and translations continue in history', async () => {
  const f = fixture(); f.speech(0); await flush(); f.requests[0].resolve('first translation'); await flush();
  f.session.setOutput('frozen'); const frozen = f.session.overlay();
  f.advance(7000); f.speech(1); await flush(); f.requests[1].resolve('second translation'); await flush();
  assert.deepEqual(f.session.overlay().caption, frozen.caption);
  assert.equal(f.session.snapshot().transcript.at(-1).translation, 'second translation');
  f.session.setSettings({ language: 'fr' }); await flush();
  assert.equal(f.session.overlay().presentationSettings.language, 'zh');
  assert.equal(f.session.overlay().presentationSettings.preset, 'captions');
  f.requests[2].resolve('traduction'); await flush();
  f.session.setOutput('running');
  assert.equal(f.session.overlay().caption.translation, 'traduction');
  assert.equal(f.session.overlay().presentationSettings.language, 'fr'); f.session.close();
});
test('hide overrides freeze; resume never revives expired captions, and reconnect carries output state', () => {
  const f = fixture(); f.session.available.openai = false; f.speech(0);
  f.session.setOutput('frozen'); f.session.setOutput('hidden');
  assert.equal(f.session.overlay().output.state, 'hidden');
  assert.equal(f.session.snapshot().output.state, 'hidden');
  f.advance(15000); f.session.setOutput('running'); assert.equal(f.session.overlay().caption.source, '');
  assert.throws(() => f.session.setOutput('invalid'), /Choose running/);
  f.session.setOutput('frozen'); f.session.begin('demo'); assert.equal(f.session.overlay().output.state, 'running');
  f.session.setOutput('hidden'); f.session.stopCapture(); assert.equal(f.session.overlay().output.state, 'running'); f.session.close();
});
test('viewer actions cannot resume or reveal a streamer-hidden output', () => {
  const f = fixture(); f.session.setOutput('hidden');
  assert.equal(f.session.action({ id: 'show', kind: 'output', value: 'running', moderator: true }).applied, false);
  f.session.action({ id: 'chaos', kind: 'mode', value: 'chaos', moderator: true });
  assert.equal(f.session.overlay().output.state, 'hidden'); f.session.close();
});

test('one prolific chatter cannot establish a collective quiet-chat baseline',()=>{
  let now=100000;const chat=new ChatWindow(()=>now);chat.connected=true;
  for(let i=0;i<180;i++){now+=1000;chat.add({id:String(i),author:'one-viewer',text:'message '+i});chat.quiet();}
  for(let i=0;i<90;i++){now+=1000;assert.equal(chat.quiet(),false);}
});
