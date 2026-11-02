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
test('translation negotiation uses owner credentials, short-lived secret, selected language and no secret output', async () => {
  const credentials = new CredentialProvider(new MemoryStorage()); await credentials.update({ streamerId: 'a' }, { openaiKey: 'owner-key' });
  const calls = []; const provider = new OpenAIProvider({ credentials, fetcher: async (url, request) => {
    calls.push({ url, request }); if (url.endsWith('client_secrets')) return { ok: true, json: async () => ({ value: 'ephemeral-key' }) };
    return { ok: true, text: async () => 'v=0\no=answer' };
  } });
  assert.equal(await provider.negotiateTranslation({ streamerId: 'a', sessionId: 's' }, 'v=0\no=offer', undefined, 'ja'), 'v=0\no=answer');
  assert.equal(calls[0].request.headers.Authorization, 'Bearer owner-key'); assert.equal(calls[1].request.headers.Authorization, 'Bearer ephemeral-key');
  assert.equal(JSON.parse(calls[0].request.body).session.audio.output.language, 'ja');
  await assert.rejects(provider.negotiateTranslation({ streamerId: 'b' }, 'v=0'), /Add your OpenAI key/);
});


test('voice languages validate settings, commands, effects and rewards independently of captions', () => {
  for (const code of ['en', 'zh', 'es', 'ja', 'fr', 'de', 'pt', 'it', 'ko', 'hi', 'ru', 'vi', 'id']) {
    assert.equal(sanitizeSettings({voiceLanguage:code}).voiceLanguage, code);
    assert.deepEqual(parseCommand(`!voice ${code}`), {kind:'voice', value:code});
    assert.equal(sanitizeSettings({rewardMappings:{reward:`voice:${code}`}}).rewardMappings.reward, `voice:${code}`);
    const f = fixture(); f.voice.start(code); assert.equal(f.voice.effect.language, code);
  }
  for (const code of ['tr', 'sk', 'ar', 'invalid']) {
    assert.equal(sanitizeSettings({voiceLanguage:code}).voiceLanguage, 'zh');
    assert.equal(parseCommand(`!voice ${code}`), null);
    assert.deepEqual(sanitizeSettings({rewardMappings:{reward:`voice:${code}`}}).rewardMappings, {});
    assert.throws(() => fixture().voice.start(code), /Unsupported/);
  }
  assert.deepEqual(parseCommand('!voice'), {kind:'voice', value:''});
  const session = new StreamSession({streamerId:'a',provider:{},now:()=>100000});
  session.setSettings({voiceLanguage:'fr',voiceEnabled:true,voiceViewerEnabled:true});
  session.begin('live'); session.microphone.status='listening'; session.available.openai=true;
  const lease=session.voice.claim({clientId:'obs',sdp:'v=0'});session.voice.poll({token:lease.token,ready:true});
  assert.equal(session.action({id:'selected',...parseCommand('!voice'),moderator:false,origin:'twitch'}).applied,true);
  assert.equal(session.voice.effect.language,'fr');
  session.close();
});

test('unsupported speech language is rejected before contacting the provider', async () => {
  let calls=0;
  const provider=new OpenAIProvider({credentials:new CredentialProvider(new MemoryStorage()),fetcher:async()=>{calls++;}});
  await assert.rejects(provider.negotiateTranslation({streamerId:'a'},'v=0',undefined,'sk'),/Unsupported/);
  assert.equal(calls,0);
});

test('continuous translation has no timed cutoff, renews with a new identity and stops safely', () => {
  const f = fixture(); const id = f.voice.start('ko', 'continuous');
  f.voice.status({id, phase:'active'});
  for (let i=0;i<1440;i++) { f.advance(5000); f.heartbeat(); f.voice.tick(); }
  assert.equal(f.voice.effect.phase,'active'); assert.equal(f.voice.effect.until,0); assert.equal(f.voice.effect.finishBy,0);
  assert.equal(f.voice.status({id,phase:'renew'}),true);
  const renewed=f.voice.effect.id; assert.notEqual(renewed,id); assert.equal(f.voice.effect.mode,'continuous'); assert.equal(f.voice.effect.language,'ko');
  assert.equal(f.voice.status({id,phase:'error'}),false);
  assert.equal(f.voice.status({id:renewed,phase:'renew'}),false);
  f.voice.status({id:renewed,phase:'active'}); f.voice.cancel();
  assert.equal(f.voice.status({id:renewed,phase:'renew'}),false); assert.equal(f.voice.effect,null);
  const timed=f.voice.start('es'); f.voice.status({id:timed,phase:'active'});
  assert.equal(f.voice.status({id:timed,phase:'renew'}),false);
});

test('streamer start bypasses audience cooldown; viewer events cannot replace continuous audio', () => {
  const session = new StreamSession({streamerId:'a',provider:{},now:()=>100000});
  assert.equal(session.startVoice().applied,false);
  session.setSettings({voiceEnabled:true,voiceViewerEnabled:true,voiceLanguage:'ja'});
  session.begin('live'); session.microphone.status='listening'; session.available.openai=true;
  const lease=session.voice.claim({clientId:'obs',sdp:'v=0'}); session.voice.poll({token:lease.token,ready:true});
  assert.equal(session.action({id:'viewer',kind:'voice',value:'zh',origin:'twitch',moderator:false}).applied,true);
  assert.equal(session.voice.effect.mode,'timed'); const timed=session.voice.effect.id;
  assert.equal(session.startVoice().applied,true); assert.equal(session.voice.effect.mode,'continuous');
  assert.equal(session.voice.effect.language,'ja'); assert.notEqual(session.voice.effect.id,timed);
  const continuous=session.voice.effect.id;
  assert.equal(session.startVoice().applied,false); assert.equal(session.voice.effect.id,continuous);
  assert.equal(session.action({id:'interrupt',kind:'voice',value:'fr',origin:'reward',moderator:false}).applied,false);
  session.action({id:'reset',kind:'reset',moderator:true,origin:'twitch'});
  assert.equal(session.voice.effect.id,continuous);
  session.setSettings({style:'paper',voiceViewerEnabled:false}); assert.equal(session.voice.effect.id,continuous);
  session.setSettings({voiceEnabled:false}); assert.equal(session.voice.effect,null);
  session.close();
});

test('viewer duration is saved, bounded, used by commands and captured per effect', () => {
  assert.equal(sanitizeSettings({}).voiceViewerDuration,20);
  assert.equal(sanitizeSettings({voiceViewerDuration:0}).voiceViewerDuration,5);
  assert.equal(sanitizeSettings({voiceViewerDuration:999}).voiceViewerDuration,120);
  assert.equal(sanitizeSettings({voiceViewerDuration:NaN}).voiceViewerDuration,20);
  const f=fixture(), id=f.voice.start('fr','timed',7);
  f.voice.status({id,phase:'active'}); const snapshot=f.voice.snapshot().effect;
  assert.equal(snapshot.durationMs,7000); assert.equal(snapshot.finishBy-snapshot.until,5000);
  f.advance(6000);f.heartbeat();f.voice.tick();assert.equal(f.voice.effect.phase,'active');
  f.advance(1000);f.voice.tick();assert.equal(f.voice.effect.phase,'draining');
  f.advance(5000);f.heartbeat();f.voice.tick();assert.equal(f.voice.effect,null);
  const session=new StreamSession({streamerId:'a',provider:{},now:()=>100000});
  session.setSettings({voiceEnabled:true,voiceViewerEnabled:true,voiceViewerDuration:45});
  session.begin('live');session.microphone.status='listening';session.available.openai=true;
  const lease=session.voice.claim({clientId:'obs',sdp:'v=0'});session.voice.poll({token:lease.token,ready:true});
  session.action({id:'reward',kind:'voice',value:'es',origin:'reward',moderator:false,durationMs:999999});
  assert.equal(session.voice.effect.durationMs,45000);assert.match(session.events[0].text,/45 seconds/);
  session.startVoice();assert.equal(session.voice.effect.durationMs,0);
  session.setSettings({voiceViewerDuration:10});assert.equal(session.voice.effect.mode,'continuous');
  session.stopCapture();assert.equal(session.voice.effect,null);session.close();
});
