import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCaption, clearCaption } from '../public/caption-renderer.js';
import { defaults } from '../src/state.mjs';
// Small DOM boundary fixture; assertions concern reconnect and hidden-source behavior.
class Element {
  constructor() { this.dataset = {}; this.style = { setProperty() {} }; this.childNodes = []; this.className = ''; this.textContent = ''; this.classList = { add: name => this.className += ` ${name}` }; }
  append(...nodes) { this.childNodes.push(...nodes); }
  replaceChildren(...nodes) { this.childNodes = nodes; }
  querySelector(selector) { for (const node of this.childNodes) { if (node.className?.split(' ').includes(selector.slice(1))) return node; const nested = node.querySelector?.(selector); if (nested) return nested; } return null; }
}
test('an unchanged overlay snapshot repaints after reconnect clears the DOM', t => {
  const previous = globalThis.document; globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const target = new Element(), state = { sessionId: 's', settings: { ...defaults }, caption: { id: 'a', source: 'hello', translation: '你好' } };
  renderCaption(target, state); assert.equal(target.querySelector('.caption-translation').textContent, '你好'); clearCaption(target);
  renderCaption(target, state); assert.equal(target.querySelector('.caption-source').textContent, 'hello');
  state.settings.preset = 'describe'; renderCaption(target, state); assert.equal(target.querySelector('.caption-block'), null);
  state.settings.preset = 'chaos'; state.settings.chaosPlacement = 'replace'; renderCaption(target, state);
  assert.equal(target.querySelector('.caption-block'), null); assert.match(target.querySelector('.chaos-badge').textContent, /FICTION/);
  state.settings.chaosPlacement = 'alongside'; renderCaption(target, state); assert.equal(target.querySelector('.caption-source').textContent, 'hello');
});
test('dub captions are labeled and restore speech after the effect without changing its transcript', t => {
  const previous = globalThis.document; globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const target = new Element(), caption = { id: 'speech', source: 'Hello everyone', translation: '大家好' };
  const state = { sessionId: 's', settings: { ...defaults }, caption, voice: { effect: { id: 'dub', phase: 'active', text: '大家好' } } };
  renderCaption(target, state); assert.equal(target.querySelector('.caption-block'), null); assert.equal(target.querySelector('.dub-caption').textContent, '大家好'); assert.match(target.querySelector('.dub-badge').textContent, /AI DUB/);
  state.voice.effect = null; renderCaption(target, state); assert.equal(target.querySelector('.caption-source').textContent, 'Hello everyone'); assert.equal(caption.source, 'Hello everyone');
});

test('Arabic and Hebrew preserve RTL text while English speech and secondary labels remain LTR', t => {
  const previous = globalThis.document; globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const target = new Element();
  for (const [language, text] of [['ar', 'مرحبًا بالجميع'], ['he', 'שלום לכולם'], ['fr', 'Bonjour à tous']]) {
    renderCaption(target, { sessionId: 'rtl', settings: { ...defaults, language, preset: 'context' }, caption: { id: 'a', source: 'Hello everyone', translation: text }, secondary: { kind: 'chorus', language, text, origin: 'live' } });
    const translation = target.querySelector('.caption-translation'), cue = target.querySelector('.secondary-caption');
    assert.equal(translation.lang, language); assert.equal(translation.dir, language === 'fr' ? 'ltr' : 'rtl');
    assert.equal(cue.childNodes[0].dir, 'ltr'); assert.equal(cue.childNodes[1].dir, translation.dir);
    assert.equal(target.querySelector('.caption-source').lang, 'en');
  }
});

test('hidden output clears speech, secondary cues and dub labels, then repaints on resume', t => {
  const previous = globalThis.document; globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const target = new Element(), state = { sessionId: 'hidden', settings: { ...defaults }, caption: { id: 'a', source: 'hello', translation: '你好' }, output: { state: 'running' } };
  renderCaption(target, state); assert.ok(target.childNodes.length);
  state.output.state = 'hidden'; renderCaption(target, state); assert.equal(target.childNodes.length, 0);
  state.voice = { effect: { id: 'dub', phase: 'active', text: '大家好' } }; renderCaption(target, state); assert.equal(target.childNodes.length, 0);
  state.output.state = 'running'; renderCaption(target, state); assert.equal(target.querySelector('.dub-caption').textContent, '大家好');
});
