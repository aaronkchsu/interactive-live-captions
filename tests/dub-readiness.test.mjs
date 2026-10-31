import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function detector() {
  const messages = []; let Processor;
  const scope = { sampleRate: 48000, currentTime: 0,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: message => messages.push(message) }; } },
    registerProcessor: (_name, value) => { Processor = value; } };
  vm.runInNewContext(readFileSync(new URL('../public/dub-readiness-worklet.js', import.meta.url), 'utf8'), scope);
  const processor = new Processor();
  return { messages, stop() { processor.port.onmessage({ data: 'stop' }); return processor.process([], [[]]); }, block(value, secondChannel) {
    const input = [new Float32Array(128).fill(value)];
    if (secondChannel !== undefined) input.push(new Float32Array(128).fill(secondChannel));
    const output = input.map(() => new Float32Array(128));
    processor.process([input], [output]); scope.currentTime += 128 / scope.sampleRate;
    return output;
  } };
}

test('an open but silent output, codec noise and isolated clicks do not mute original speech', () => {
  const d = detector();
  for (let i = 0; i < 2000; i++) d.block(0);
  for (let i = 0; i < 100; i++) d.block(.0001);
  d.block(.5); d.block(0);
  for (let i = 0; i < 11; i++) d.block(.02);
  assert.equal(d.messages.length, 0);
  d.block(.02);
  assert.equal(d.messages.length, 1);
  assert.equal(d.messages[0].type, 'audible');
  assert.ok(d.messages[0].onset > 5, 'onset follows the initial silence');
  for (let i = 0; i < 100; i++) d.block(.02);
  assert.equal(d.messages.length, 1, 'readiness is latched, not repeated on phrase pauses');
});

test('readiness preserves samples and detects audio on either channel', () => {
  const d = detector();
  for (let i = 0; i < 12; i++) {
    const output = d.block(0, .02);
    assert.equal(output[0][0], 0); assert.ok(Math.abs(output[1][0] - .02) < 1e-6);
  }
  assert.equal(d.messages.length, 1);
  assert.equal(d.stop(), false, 'cleanup releases the audio-thread processor');
});
