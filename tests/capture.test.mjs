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
