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
  const studio = await fetch(base); assert.equal(studio.status, 200); assert.match(await studio.text(), /Streamer Voice Box/);
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
    if (path.includes('/overlay/')) { assert.equal(data.version, 2); assert.equal(Object.hasOwn(data, 'transcript'), false); assert.equal(Object.hasOwn(data, 'metrics'), false); }
  }
  await post('setup/openai', { key: '' });
});
