import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
let child, base;
before(async () => {
  child = spawn(process.execPath, ["server.mjs"], { cwd: new URL("..", import.meta.url), env: {
    ...process.env, PORT: "0", VOICE_BOX_TEST_MODE: "1", OPENAI_API_KEY: "", TWITCH_CLIENT_ID: "", TWITCH_ACCESS_TOKEN: "", TWITCH_CHANNEL: ""
  }, stdio: ["ignore", "pipe", "pipe"] });
  base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Studio did not start.")), 5000);
    child.stdout.on("data", chunk => { const match = /Streamer Voice Box studio: (http:\/\/localhost:\d+)/.exec(String(chunk)); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    child.once("error", reject);
    child.once("exit", code => { clearTimeout(timeout); reject(new Error(`Studio exited with ${code}`)); });
  });
});
after(async () => { if (child && child.exitCode === null) { const exit = once(child, "exit"); child.kill("SIGTERM"); await exit; } });
const post = async (path, data) => {
  const response = await fetch(`${base}/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  return { status: response.status, data: await response.json() };
};

test("studio and OBS routes serve; sample content is clearly labeled", async () => {
  const studio = await fetch(base); assert.equal(studio.status, 200); assert.match(await studio.text(), /AuraMax Captions/);
  const overlay = await fetch(`${base}/overlay`); assert.equal(overlay.status, 200); assert.match(await overlay.text(), /SAMPLE CAPTIONS/);
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.mode, "demo"); assert.equal(state.caption.origin, "demo"); assert.equal(state.available.openai, false);
  assert.equal(Object.hasOwn(state, "token"), false);
});
test("language changes update demo translation and preserve source", async () => {
  await post("playback", {});
  const original = await (await fetch(`${base}/api/state`)).json();
  const { data } = await post("settings", { language: "es" });
  assert.equal(data.caption.source, original.caption.source);
  assert.notEqual(data.caption.translation, original.caption.translation);
  assert.equal(data.settings.language, "es");
});
test("audience commands apply once and repeated triggers respect cooldown", async () => {
  await post("reset", {});
  const first = await post("action", { kind: "style", value: "paper" });
  const second = await post("action", { kind: "style", value: "comic" });
  assert.equal(first.data.applied, true); assert.equal(second.data.applied, false); assert.ok(second.data.remaining > 0);
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.settings.style, "paper"); assert.equal(state.events[0].origin, "demo");
});
test("live captions work without a key and missing translation is explicit", async () => {
  await post("settings", { tracks: { secondary: { enabled: true, language: "zh" } } });
  const live = await post("session", { mode: "live", provider: "browser" });
  await post("caption", { streamerId: live.data.streamerId, sessionId: live.data.sessionId, captureId: live.data.captureId, segmentId: "one", sequence: 0, revision: 1, text: "Hello Twitch", final: true });
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.caption.source, "Hello Twitch"); assert.equal(state.caption.origin, "microphone");
  assert.equal(state.translation.status, "unconfigured"); assert.equal(state.caption.translation, "");
  await post("session", { mode: "demo" });
  await post("caption", { session: live.data.session, id: 20, text: "stale callback", final: true });
  const demo = await (await fetch(`${base}/api/state`)).json(); assert.notEqual(demo.caption.source, "stale callback");
});
test("SSE provides current state for an independently opened overlay", async () => {
  const response = await fetch(`${base}/api/events`);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  const reader = response.body.getReader();
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /"mode":"demo"/);
  await reader.cancel();
});
test("cross-origin mutation and path traversal are rejected", async () => {
  const mutation = await fetch(`${base}/api/settings`, { method: "POST", headers: { Origin: "https://unrelated.example", "Content-Type": "application/json" }, body: '{"style":"comic"}' });
  assert.equal(mutation.status, 403);
  const traversal = await fetch(`${base}/%2e%2e%2f.env`); assert.equal(traversal.status, 403);
});
test('setup stores secrets without exposing them in any public snapshot', async () => {
  await post('setup/openai', { key: 'fake-private-openai-value' });
  await post('setup/twitch', { clientId: 'testclient', clientSecret: 'fake-private-twitch-value' });
  for (const path of ['/api/state', '/api/overlay/state', '/api/setup']) {
    const response = await fetch(`${base}${path}`), data = await response.json();
    assert.equal(response.status, 200); assert.ok(!JSON.stringify(data).includes('fake-private-'));
    assert.equal(Object.hasOwn(data, 'captureId'), false);
    if (path.includes('/overlay/')) { assert.equal(data.version, 3); assert.equal(Object.hasOwn(data, 'transcript'), false); assert.equal(Object.hasOwn(data, 'metrics'), false); }
  }
  await post('setup/openai', { key: '' });
});
test('voice signaling requires the capture owner and never leaks receiver credentials in snapshots', async () => {
  const live = (await post('session', { mode: 'live' })).data;
  const context = { streamerId: live.streamerId, sessionId: live.sessionId, captureId: live.captureId };
  const receiver = await post('voice/receiver/start', { clientId: 'test-obs', sdp: 'v=0\no=offer' }); assert.equal(receiver.status, 200);
  assert.equal((await post('voice/signal', { ...context, captureId: 'wrong' })).status, 400);
  await post('settings', { voiceEnabled: true });
  const signal = await post('voice/signal', context); assert.equal(signal.data.offer.id, receiver.data.id);
  assert.equal((await post('voice/answer', { ...context, id: 'wrong', sdp: 'v=0' })).status, 400);
  assert.equal((await post('voice/answer', { ...context, id: receiver.data.id, sdp: 'v=0\no=answer' })).status, 200);
  const state = await (await fetch(`${base}/api/state`)).json(); assert.ok(!JSON.stringify(state).includes(receiver.data.token));
  await post('session', { mode: 'demo' }); assert.equal((await post('voice/receiver/poll', { token: receiver.data.token, ready: true })).status, 400);
});

test('output controls survive overlay snapshots and reject unsupported states', async () => {
  await post('session', { mode: 'demo' });
  const frozen = await post('output', { state: 'frozen' }); assert.equal(frozen.status, 200); assert.equal(frozen.data.output.state, 'frozen');
  const hidden = await post('output', { state: 'hidden' }); assert.equal(hidden.data.output.state, 'hidden');
  const overlay = await (await fetch(`${base}/api/overlay/state`)).json(); assert.equal(overlay.output.state, 'hidden');
  assert.equal((await post('output', { state: 'invalid' })).status, 400);
  assert.equal((await post('output', { state: 'running' })).data.output.state, 'running');
});

test('microphone diagnostics survive cleanup, ignore late updates and clear on retry', async () => {
 const live=await post('session',{mode:'live',provider:'browser'});
 const identity={streamerId:live.data.streamerId,sessionId:live.data.sessionId,captureId:live.data.captureId};
 await post('microphone',{...identity,status:'error',error:'',failure:{code:'NotAllowedError',stage:'microphone',detail:''}});
 const failed=await (await fetch(`${base}/api/state`)).json();
 assert.equal(failed.microphone.failure.code,'NotAllowedError');assert.match(failed.microphone.error,/Allow microphone access/);
 assert.equal((await post('microphone',{...identity,status:'listening'})).status,400);
 await post('session',{mode:'live',provider:'browser'});
 const next=await (await fetch(`${base}/api/state`)).json();assert.equal(next.microphone.failure,null);assert.equal(next.microphone.error,'');
 await post('session',{mode:'demo'});
});

test('studio voice endpoint starts continuous translation while audience previews stay timed', async () => {
  await post('reset',{});
  await post('setup/openai',{key:'synthetic-never-sent'});
  await post('settings',{voiceEnabled:true,voiceLanguage:'fr'});
  const live=(await post('session',{mode:'live'})).data;
  const context={streamerId:live.streamerId,sessionId:live.sessionId,captureId:live.captureId};
  await post('microphone',{...context,status:'listening'});
  const receiver=(await post('voice/receiver/start',{clientId:'test-obs',sdp:'v=0'})).data;
  await post('voice/receiver/poll',{token:receiver.token,ready:true});
  assert.equal((await post('voice/start',{})).data.applied,true);
  const state=await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.voice.effect.mode,'continuous'); assert.equal(state.voice.effect.language,'fr');
  await post('effects/reset',{});
  assert.equal((await (await fetch(`${base}/api/state`)).json()).voice.effect.id,state.voice.effect.id);
  await post('voice/stop',{});
  assert.equal((await post('voice/status',{...context,id:state.voice.effect.id,phase:'renew'})).data.accepted,false);
  assert.equal((await post('action',{kind:'voice',value:'zh'})).data.applied,true);
  assert.equal((await (await fetch(`${base}/api/state`)).json()).voice.effect.mode,'timed');
  await post('session',{mode:'demo'}); await post('setup/openai',{key:''});
});

test('all advertised languages and font styles survive the studio-to-overlay HTTP boundary',async()=>{
  const {captionLanguages}=await import('../public/languages.js');
  const {captionFonts}=await import('../public/fonts.js');
  await post('reset',{});await post('session',{mode:'demo'});
  for(const language of captionLanguages){
    const changed=await post('settings',{tracks:{primary:{mode:'subtitles',language:language.code},secondary:{enabled:true,mode:'commentary',language:'ko'}}});
    assert.equal(changed.status,200);
    const shown=await(await fetch(base+'/api/overlay/state')).json();
    assert.equal(shown.tracks[0].language,language.code);assert.equal(shown.tracks[1].language,'ko');
    assert.match(shown.tracks[1].label,/COMMENTARY/);
  }
  for(const font of captionFonts){
    await post('settings',{tracks:{primary:{design:{font:font.id}},secondary:{design:{font:'lora'}}}});
    const shown=await(await fetch(base+'/api/overlay/state')).json();
    assert.equal(shown.tracks[0].design.font,font.id);assert.equal(shown.tracks[1].design.font,'lora');
    if(font.file){const r=await fetch(base+font.file);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'font/ttf');assert.ok((await r.arrayBuffer()).byteLength>1000);}
  }
});
test('reconnecting overlay clients receive the frozen snapshot, then hidden and resumed state',async()=>{
  await post('reset',{});await post('session',{mode:'demo'});
  await post('settings',{tracks:{secondary:{enabled:true,language:'zh'}}});
  const frozen=(await post('output',{state:'frozen'})).data;
  await post('settings',{tracks:{primary:{design:{font:'bungee'}}}});
  for(let i=0;i<3;i++){
    const stream=await fetch(base+'/api/overlay/events',{signal:AbortSignal.timeout(3000)});const reader=stream.body.getReader();
    const first=new TextDecoder().decode((await reader.read()).value);await reader.cancel();
    const shown=JSON.parse(first.split('\n').find(line=>line.startsWith('data:')).slice(5));
    assert.equal(shown.output.state,'frozen');assert.deepEqual(shown.tracks,frozen.tracks);
  }
  await post('output',{state:'hidden'});assert.equal((await(await fetch(base+'/api/overlay/state')).json()).output.state,'hidden');
  await post('output',{state:'running'});assert.equal((await(await fetch(base+'/api/overlay/state')).json()).tracks[0].design.font,'bungee');
});
