import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapture } from '../public/microphone.js';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const flush = () => new Promise(r => setImmediate(r));
function install(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
}
const options = { context: { streamerId: 'a', sessionId: 's', captureId: 'c' }, getSettings: () => ({ preset: 'captions' }), report: () => {} };
test('stop during microphone permission releases a late stream without connecting', async t => {
  const media = deferred(); let stops = 0, requests = 0;
  install(t, 'navigator', { mediaDevices: { getUserMedia: () => media.promise } });
  const capture = createCapture({ ...options, provider: 'openai', send: async () => requests++ }); capture.stop();
  media.resolve({ getTracks: () => [{ stop: () => stops++ }] }); await capture.ready;
  assert.equal(stops, 1); assert.equal(requests, 0);
});
test('stop during connection aborts SDP and never accepts a late answer', async t => {
  const answer = deferred(); let stops = 0, closed = 0, remote = 0, signal;
  install(t, 'navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stops++ }], getAudioTracks: () => [] }) } });
  // Optional analysis failure must not prevent starting the speech connection.
  install(t, 'AudioContext', class { constructor() { throw new Error('worklet unavailable'); } });
  install(t, 'RTCPeerConnection', class { addTrack() {} createDataChannel() { return {}; } async createOffer() { return { sdp: 'offer' }; } async setLocalDescription() {} async setRemoteDescription() { remote++; } close() { closed++; } });
  const capture = createCapture({ ...options, provider: 'openai', send: (_path, _data, abort) => { signal = abort; return answer.promise; } });
  await flush(); assert.ok(signal); capture.stop(); assert.equal(signal.aborted, true); answer.resolve({ sdp: 'late answer' }); await capture.ready;
  assert.equal(stops, 1); assert.equal(closed, 1); assert.equal(remote, 0);
});
test('denied microphone reports an error and does not negotiate', async t => {
  install(t, 'navigator', { mediaDevices: { getUserMedia: async () => { throw new Error('Permission denied'); } } });
  const errors = []; let requests = 0;
  const capture = createCapture({ ...options, provider: 'openai', report: (...args) => errors.push(args), send: async () => requests++ });
  await assert.rejects(capture.ready, /Permission denied/); assert.equal(requests, 0); assert.equal(errors[0][1], 'error'); capture.stop();
});

test('chat-only commentary never opens a microphone or an audio peer', async t => {
  let opens = 0;
  install(t, 'navigator', { mediaDevices: { getUserMedia: async () => { opens++; throw new Error('Unexpected device'); } } });
  const capture = createCapture({ ...options, getSettings: () => ({ tracks: { primary: { enabled:true, mode:'commentary', inputs:{mic:false,chat:true,camera:false} }, secondary:{enabled:false} } }), provider:'openai', send:async()=>{} });
  await capture.ready; assert.equal(opens,0); capture.stop();
});
test('changing to chat-only while microphone permission is pending releases the late device', async t => {
  const media = deferred(); let stops=0, opens=0;
  let config = { tracks: { primary:{enabled:true,mode:'subtitles',language:'en',inputs:{mic:true}},secondary:{enabled:false} } };
  install(t,'navigator',{mediaDevices:{getUserMedia:()=>{opens++;return media.promise;}}});
  const capture=createCapture({...options,getSettings:()=>config,provider:'openai',send:async()=>{throw new Error('Unexpected request');}});
  config={tracks:{primary:{enabled:true,mode:'commentary',inputs:{mic:false,chat:true,camera:false}},secondary:{enabled:false}}};
  await capture.update(); media.resolve({getTracks:()=>[{stop:()=>stops++}]}); await capture.ready;
  assert.equal(opens,1);assert.equal(stops,1);capture.stop();
});

test('empty DOM permission errors retain their name and recovery steps', async t => {
  install(t, 'navigator', {mediaDevices:{getUserMedia:async()=>{throw new DOMException('', 'NotAllowedError');}}});
  const reports=[];
  const capture=createCapture({...options,provider:'openai',report:(...args)=>reports.push(args),send:async()=>assert.fail('Must not call provider')});
  await assert.rejects(capture.ready,{name:'NotAllowedError'});
  assert.equal(reports[0][3].code,'NotAllowedError');
  assert.equal(reports[0][3].stage,'microphone');
  assert.match(reports[0][2],/Allow microphone access/);
  capture.stop();
});
test('missing capture API explains supported-browser recovery',async t=>{
  install(t,'navigator',{}); const reports=[];
  const capture=createCapture({...options,provider:'openai',report:(...args)=>reports.push(args),send:async()=>{}});
  await assert.rejects(capture.ready,{name:'UnsupportedCapture'});
  assert.match(reports[0][2],/Chrome or Edge/);
});
test('permission rejection after cancellation does not report a false microphone failure',async t=>{
  let reject; const media=new Promise((_resolve,no)=>reject=no), reports=[];
  install(t,'navigator',{mediaDevices:{getUserMedia:()=>media}});
  const capture=createCapture({...options,provider:'openai',report:(...args)=>reports.push(args),send:async()=>{}});
  capture.stop();reject(new DOMException('', 'NotAllowedError'));await capture.ready;
  assert.deepEqual(reports,[]);
});

function speechConnection(t) {
  let channel, peer, stops = 0;
  const reports = [];
  install(t, 'navigator', {mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stops++}],getAudioTracks:()=>[]})}});
  install(t, 'RTCPeerConnection', class {
    constructor(){peer=this;this.connectionState='new';}
    addTrack(){} createDataChannel(){return channel={readyState:'connecting',send(){}};}
    async createOffer(){return {sdp:'offer'};} async setLocalDescription(){} async setRemoteDescription(){}
    close(){this.connectionState='closed';channel.onclose?.();}
  });
  const capture=createCapture({...options,provider:'openai',send:async()=>({sdp:'answer'}),report:(...args)=>reports.push(args)});
  t.after(()=>capture.stop());
  return {capture,reports,get channel(){return channel;},get peer(){return peer;},get stops(){return stops;}};
}
test('speech setup times out instead of leaving the microphone starting indefinitely',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=speechConnection(t);await f.capture.ready;
  t.mock.timers.tick(20001);
  assert.equal(f.reports.at(-1)[1],'error');assert.equal(f.reports.at(-1)[3].code,'ConnectionError');assert.equal(f.stops,1);
});
test('speech disconnect can recover, but a closed data channel releases the microphone',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=speechConnection(t);await f.capture.ready;f.channel.readyState='open';f.channel.onopen();
  f.peer.connectionState='disconnected';f.peer.onconnectionstatechange();t.mock.timers.tick(1000);
  f.peer.connectionState='connected';f.peer.onconnectionstatechange();t.mock.timers.tick(21000);
  assert.equal(f.reports.at(-1)[1],'listening');assert.equal(f.stops,0);
  f.channel.onclose();assert.equal(f.reports.at(-1)[1],'error');assert.equal(f.stops,1);
});
test('provider transcription failure gives recovery details instead of silently dropping speech',async t=>{
  const f=speechConnection(t);await f.capture.ready;
  f.channel.onmessage({data:JSON.stringify({type:'conversation.item.input_audio_transcription.failed',error:{code:'rate_limit_exceeded'}})});
  assert.equal(f.reports.at(-1)[3].code,'RateLimitError');assert.equal(f.stops,1);
});
