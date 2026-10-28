import test from "node:test";
import assert from "node:assert/strict";
import { defaults, sanitizeSettings, isCurrentTranslation, acceptCaption, parseCommand } from "../src/state.mjs";

test("stale translation cannot reappear after a language or session change", () => {
  const ticket = { session: "one", language: "zh", id: 3, source: "hello" };
  const state = { mode: "live", session: "one", settings: { language: "zh" }, caption: { id: 3, source: "hello" } };
  assert.equal(isCurrentTranslation(state, ticket), true);
  state.settings.language = "ja"; assert.equal(isCurrentTranslation(state, ticket), false);
  state.settings.language = "zh"; state.session = "two"; assert.equal(isCurrentTranslation(state, ticket), false);
});
test("translation for previous speech cannot overwrite the current phrase", () => {
  assert.equal(isCurrentTranslation({ mode: "live", session: "one", settings: { language: "zh" }, caption: { id: 4, source: "goodbye" } },
    { session: "one", language: "zh", id: 3, source: "hello" }), false);
});
test("out of order speech and callbacks from stopped microphones are discarded", () => {
  const state = { mode: "live", session: "new", caption: { id: 4, final: false } };
  assert.equal(acceptCaption(state, { session: "old", id: 10, text: "stale" }), false);
  assert.equal(acceptCaption(state, { session: "new", id: 3, text: "late" }), false);
  assert.equal(acceptCaption(state, { session: "new", id: 5, text: "current", final: true }), true);
  assert.equal(acceptCaption(state, { session: "new", id: 5, text: "draft", final: false }), false);
  assert.equal(state.caption.source, "current");
});
test("caption settings reject invalid inputs and bound reading controls", () => {
  const next = sanitizeSettings({ style: "injected", language: "xx", fontSize: 900, hold: -4, backplate: NaN, emphasis: "false", unexpected: true });
  assert.equal(next.style, defaults.style); assert.equal(next.fontSize, 64); assert.equal(next.hold, 3);
  assert.equal(next.backplate, defaults.backplate); assert.equal(next.emphasis, true); assert.equal(Object.hasOwn(next, "unexpected"), false);
});
test("language changes require moderator authority; style commands match exactly", () => {
  assert.deepEqual(parseCommand("!style PAPER"), { kind: "style", value: "paper" });
  assert.equal(parseCommand("!captions zh"), null);
  assert.deepEqual(parseCommand("!captions zh", true), { kind: "language", value: "zh" });
  assert.equal(parseCommand("hello !style paper"), null);
  assert.equal(parseCommand("!style paper extra"), null);
});
