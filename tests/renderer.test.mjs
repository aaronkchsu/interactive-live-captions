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
