import test from 'node:test';
import assert from 'node:assert/strict';
import { webcamPreview } from '../public/webcam-preview.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fakeStream() {
  const track = new EventTarget(); track.readyState = 'live'; track.stops = 0;
  track.stop = () => { track.stops++; track.readyState = 'ended'; };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
test('cancel during camera permission releases the late device; no microphone requested', async () => {
  let resolve, constraints; const stream = fakeStream(); const states = [];
  const preview = webcamPreview({ getMedia: input => { constraints = input; return new Promise(r => { resolve = r; }); }, changed: state => states.push(state) });
  preview.toggle(); preview.toggle(); resolve(stream); await flush();
  assert.equal(constraints.audio, false); assert.equal(stream.track.stops, 1);
  assert.equal(states.at(-1).enabled, false); assert.ok(!states.some(state => state.stream));
});
test('reuse capture camera without stopping it when preview is hidden', async () => {
  const shared = fakeStream(), owned = fakeStream(); let requests = 0; const states = [];
  const preview = webcamPreview({ getMedia: async () => { requests++; return owned; }, changed: state => states.push(state) });
  preview.toggle(); await flush(); preview.setShared(shared);
  assert.equal(owned.track.stops, 1); assert.equal(states.at(-1).stream, shared);
  preview.toggle(); assert.equal(shared.track.stops, 0); assert.equal(requests, 1);
});
test('camera device switch rejects an obsolete permission result', async () => {
  const pending = [], first = fakeStream(), second = fakeStream(), states = [];
  const preview = webcamPreview({ getMedia: input => new Promise(resolve => pending.push({input, resolve})), changed: state => states.push(state) });
  preview.toggle(); preview.setDevice('new-camera');
  pending[1].resolve(second); await flush(); pending[0].resolve(first); await flush();
  assert.equal(pending[1].input.video.deviceId.exact, 'new-camera');
  assert.equal(first.track.stops, 1); assert.equal(states.at(-1).stream, second);
  preview.stop(); assert.equal(second.track.stops, 1);
});
test('camera denial and hardware disconnection are visible recoverable errors', async () => {
  let state; const denied = new DOMException('Denied', 'NotAllowedError');
  const preview = webcamPreview({ getMedia: async () => { throw denied; }, changed: value => { state = value; } });
  preview.toggle(); await flush(); assert.equal(state.enabled, false); assert.equal(state.error, denied);
  const stream = fakeStream(); preview.setShared(stream); preview.toggle();
  stream.track.dispatchEvent(new Event('ended'));
  assert.equal(state.enabled, false); assert.match(state.error.message, /disconnected/);
});
