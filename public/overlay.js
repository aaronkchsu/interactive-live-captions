import { renderCaption, clearCaption } from '/caption-renderer.js';
const target = document.querySelector('#overlay-caption'), label = document.querySelector('#overlay-sample');
const events = new EventSource('/api/overlay/events');
events.onmessage = event => { const state = JSON.parse(event.data); renderCaption(target, state); label.hidden = state.mode !== 'demo'; label.textContent = 'STREAMER VOICE BOX · SAMPLE CAPTIONS'; };
events.onerror = () => { clearCaption(target); label.hidden = false; label.textContent = 'STREAMER VOICE BOX · RECONNECTING'; };
