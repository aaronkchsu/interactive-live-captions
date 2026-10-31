import test from 'node:test';
import assert from 'node:assert/strict';
import { BroadcastState } from '../src/broadcast.mjs';
import { StreamSession } from '../src/session.mjs';
import { sanitizeSettings, parseCommand } from '../src/state.mjs';
import { CredentialProvider, MemoryStorage } from '../src/storage.mjs';
import { OpenAIProvider } from '../src/providers.mjs';
function fixture() { let now = 100000; const voice = new BroadcastState({ now: () => now }); const lease = voice.claim({ clientId: 'obs', sdp: 'v=0\no=offer' }); const heartbeat = () => voice.poll({ token: lease.token, ready: true }); heartbeat(); return { voice, lease, heartbeat, advance: ms => now += ms }; }
test('only one audio receiver owns a lease and public state never includes SDP or tokens', () => {
  const f = fixture(); assert.throws(() => f.voice.claim({ clientId: 'second', sdp: 'v=0' }), /Another audio/);
  assert.throws(() => f.voice.poll({ token: 'wrong', ready: true }), /expired/);
  assert.equal(f.voice.snapshot().output, 'connected'); assert.ok(!JSON.stringify(f.voice.snapshot()).includes(f.lease.token)); assert.ok(!JSON.stringify(f.voice.snapshot()).includes('offer'));
  f.advance(10001); f.voice.tick(); assert.equal(f.voice.snapshot().output, 'disconnected');
});
test('Chinese effect starts its 20 second clock on readiness, drains at most five seconds, then restores', () => {
  const f = fixture(), id = f.voice.start(); assert.equal(f.voice.snapshot().effect.phase, 'connecting');
  f.advance(2000); f.voice.status({ id, phase: 'active' }); const until = f.voice.snapshot().effect.until;
  f.voice.status({ id, phase: 'active' }); assert.equal(f.voice.snapshot().effect.until, until);
  for (let i = 0; i < 4; i++) { f.advance(5000); f.heartbeat(); f.voice.tick(); }
  assert.equal(f.voice.snapshot().effect.phase, 'draining'); f.advance(5000); f.heartbeat(); f.voice.tick(); assert.equal(f.voice.snapshot().effect, null);
  assert.equal(f.voice.status({ id, phase: 'active' }), false);
});
test('connection failure, receiver loss and manual cancellation reject late activation', () => {
  const f = fixture(); let id = f.voice.start(); f.voice.cancel(); assert.equal(f.voice.status({ id, phase: 'active' }), false);
  id = f.voice.start(); f.advance(8000); f.heartbeat(); f.advance(7000); f.heartbeat(); f.voice.tick(); assert.equal(f.voice.effect, null);
  id = f.voice.start(); f.voice.status({ id, phase: 'active' }); f.voice.poll({ token: f.lease.token, ready: false }); assert.equal(f.voice.effect, null); assert.match(f.voice.lastError, /disconnected/);
});
test('voice controls require live input, output, key and explicit viewer opt-in', () => {
  const session = new StreamSession({ streamerId: 'a', provider: {}, now: () => 100000 });
  const trigger = (id, moderator = false) => session.action({ id, kind: 'voice', value: 'zh', moderator, origin: 'twitch' });
  assert.equal(trigger('disabled').applied, false); session.setSettings({ voiceEnabled: true }); session.begin('live'); session.microphone.status = 'listening'; session.available.openai = true;
  const lease = session.voice.claim({ clientId: 'obs', sdp: 'v=0' }); session.voice.poll({ token: lease.token, ready: true });
  assert.equal(trigger('viewer-disabled').applied, false); session.setSettings({ voiceViewerEnabled: true }); assert.equal(trigger('viewer-enabled').applied, true);
  assert.equal(trigger('duplicate').applied, false); session.setSettings({ style: 'paper' }); assert.equal(session.voice.effect, null); assert.equal(trigger('cooldown').applied, false);
  session.stopCapture(); assert.equal(session.voice.connected(), false);
  assert.deepEqual(parseCommand('!voice zh'), { kind: 'voice', value: 'zh' }); assert.equal(parseCommand('!voice pretend'), null);
  assert.equal(sanitizeSettings({ rewardMappings: { reward: 'voice:zh' } }).rewardMappings.reward, 'voice:zh');
});
test('translation negotiation uses owner credentials, short-lived secret, fixed Chinese and no secret output', async () => {
  const credentials = new CredentialProvider(new MemoryStorage()); await credentials.update({ streamerId: 'a' }, { openaiKey: 'owner-key' });
  const calls = []; const provider = new OpenAIProvider({ credentials, fetcher: async (url, request) => {
    calls.push({ url, request }); if (url.endsWith('client_secrets')) return { ok: true, json: async () => ({ value: 'ephemeral-key' }) };
    return { ok: true, text: async () => 'v=0\no=answer' };
  } });
  assert.equal(await provider.negotiateTranslation({ streamerId: 'a', sessionId: 's' }, 'v=0\no=offer'), 'v=0\no=answer');
  assert.equal(calls[0].request.headers.Authorization, 'Bearer owner-key'); assert.equal(calls[1].request.headers.Authorization, 'Bearer ephemeral-key');
  assert.equal(JSON.parse(calls[0].request.body).session.audio.output.language, 'zh');
  await assert.rejects(provider.negotiateTranslation({ streamerId: 'b' }, 'v=0'), /Add your OpenAI key/);
});
