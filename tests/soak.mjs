// One hour of simulated time; deterministic fixtures, no network, audio or paid AI.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { StreamSession } from '../src/session.mjs';
let now = 100000;
const calls = { translation: 0, commentary: 0, audio: 0, vision: 0 };
const provider = {
  translate: async (_ctx, text) => { calls.translation++; return `翻译 ${text}`; },
  commentary: async (_ctx, evidence) => { calls.commentary++; return { text: `Comment ${calls.commentary}`, evidence: evidence.messages.slice(0, 3).map(m => m.id) }; },
  audio: async () => { calls.audio++; return { text: '(laughing)', evidence: [], event: 'laughter' }; },
  vision: async () => { calls.vision++; return { text: '(waving)', evidence: [], event: 'waving' }; }
};
const sessions = ['alice', 'bob'].map(streamerId => new StreamSession({ streamerId, provider, now: () => now }));
const contexts = sessions.map(s => { s.available.openai = true; const context = s.begin('live'); s.chat.connected = true; s.setSettings({ tracks: { primary: { language: 'zh' }, secondary: { enabled: true, mode: 'commentary', inputs: { camera: true } } } }); return context; });
const samples = [], heap = [], maxima = { segments: 0, messages: 0, activity: 0, queued: 0, active: 0, actions: 0 };
const flush = () => new Promise(resolve => setImmediate(resolve));
for (let tick = 0; tick <= 36000; tick++) {
  now = 100000 + tick * 100;
  const started = performance.now();
  for (let index = 0; index < sessions.length; index++) {
    const s = sessions[index], context = contexts[index]; s.heartbeat();
    if (tick % 300 === 0) s.setSettings({ tracks: { primary: { language: Math.floor(tick / 300) % 2 ? 'ko' : 'zh' }, secondary: { enabled: Math.floor(tick / 300) % 3 !== 0, troll: Math.floor(tick / 300) % 4 } } });
    if (tick % 30 === 0) {
      s.acceptSpeech({ ...context, segmentId: `s${tick}`, sequence: tick, revision: 1, text: `${s.streamerId} phrase ${tick}`, final: true });
      s.ingestMedia('audio', { ...context, audio: 'AAAA' });
    }
    if (tick % 20 === 0) s.ingestMedia('vision', { ...context, image: 'data:image/jpeg;base64,AAAA' });
    if (tick % 10 === 0) for (let viewer = 0; viewer < 6; viewer++) s.chat.add({ id: `${tick}:${viewer}`, author: `user${viewer}`, text: `theme ${Math.floor(tick / 80)} response ${viewer}` });
    if (tick % 150 === 0) s.action({ id: `effect${tick}`, kind: 'style', value: tick % 300 === 0 ? 'paper' : 'comic', origin: 'fixture' });
    s.tick(); JSON.stringify(s.overlay());
    maxima.segments = Math.max(maxima.segments, s.segments.size); maxima.messages = Math.max(maxima.messages, s.chat.messages.length); maxima.activity = Math.max(maxima.activity, s.chat.activity.length); maxima.actions = Math.max(maxima.actions, s.seenActions.size);
    for (const lane of [...Object.values(s.lanes), ...Object.values(s.trackRuntime.lanes)]) { maxima.queued = Math.max(maxima.queued, lane.pending.length); maxima.active = Math.max(maxima.active, lane.active.size); assert.ok(lane.pending.length <= lane.capacity && lane.active.size <= lane.concurrency); }
    assert.ok(s.segments.size <= 200 && s.chat.messages.length <= 200 && s.chat.activity.length <= 10000 && s.trackRuntime.observations.length <= 8 && s.seenActions.size <= 1000);
    assert.ok(!s.snapshot().transcript.some(p => p.source.startsWith(index ? 'alice' : 'bob')));
  }
  samples[tick % 1000] = performance.now() - started; await flush();
  if (tick >= 6000 && tick % 6000 === 0) { global.gc?.(); heap.push({ simulatedMinute: tick / 600, bytes: process.memoryUsage().heapUsed }); }
}
for (const s of sessions) s.close(); await flush();
// Loose deterministic regression threshold, not a guarantee about real provider/OBS memory.
const growth = heap.at(-1).bytes - heap[0].bytes; assert.ok(growth < 8 * 1024 * 1024, `Retained heap grew ${growth} bytes`);
samples.sort((a, b) => a - b);
const report = { kind: 'fixture-only simulated soak', simulatedHours: 1, owners: 2, ticks: 36001, calls, maxima, heap, retainedHeapGrowthBytes: growth, p95CoreProcessingMs: samples[Math.floor(samples.length * .95)], note: 'Core processing timing includes two owners, no HTTP/browser/OBS/provider latency. Not real-time performance acceptance.' };
await mkdir('artifacts', { recursive: true }); await writeFile('artifacts/soak-result.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
