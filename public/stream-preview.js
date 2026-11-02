import { webcamPreview } from './webcam-preview.js';
import { captureFailure } from './capture-errors.js';
// Studio-only background. Never forwarded to OBS or to an AI processor.
export function streamPreview({ api }) {
  const stage = document.querySelector('#preview-stage');
  const image = document.querySelector('#stream-snapshot');
  const status = document.querySelector('#preview-source-status');
  const video = document.querySelector('#preview-webcam');
  const button = document.querySelector('#preview-webcam-toggle');
  let cameraEnabled = false;
  let epoch = 0, timer, request, busy = false, channel = '';
  const camera = webcamPreview({
    getMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
    changed({ enabled, pending, stream, error }) {
      cameraEnabled = enabled; stop();
      video.srcObject = stream || null; video.hidden = !stream;
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? (pending ? 'Cancel webcam' : 'Hide webcam') : 'Show webcam';
      if (enabled) {
        stage.dataset.backdrop = 'webcam';
        status.textContent = pending ? 'Waiting for camera permission…' : 'Live webcam · local preview only.';
        if (stream) void video.play().catch(() => { if (video.srcObject === stream) camera.stop(new Error('Camera preview could not play. Choose Show webcam to retry.')); });
      } else {
        fallback(channel ? `Loading @${channel} preview…` : 'Demo background · connect Twitch to preview your channel.');
        if (error) {
          const issue = captureFailure(error);
          status.textContent = error.name === 'Error' ? error.message : `${issue.title}. ${issue.message}`.replaceAll('Microphone', 'Camera').replaceAll('microphone', 'camera').replaceAll('audio device', 'camera');
        }
        else if (channel) void refresh();
      }
    },
  });
  button.addEventListener('click', () => camera.toggle());
  function stop() {
    epoch++; clearTimeout(timer); request?.abort(); busy = false;
    image.hidden = true; image.removeAttribute('src');
  }
  function fallback(message) {
    image.hidden = true; image.removeAttribute('src');
    stage.dataset.backdrop = 'sample';
    status.textContent = message;
  }
  async function refresh() {
    if (cameraEnabled || busy || !channel || document.hidden) return;
    clearTimeout(timer); const ticket = epoch; busy = true;
    try {
      request = new AbortController();
      const data = await api('twitch/preview', {}, request.signal);
      if (ticket !== epoch) return;
      if (!data.image) {
        fallback(`@${channel} is offline · demo background.`);
      } else {
        const next = new Image(); next.referrerPolicy = 'no-referrer';
        // Cache-busting does not make a Twitch thumbnail a live video feed.
        const url = new URL(data.image); url.searchParams.set('auramax_preview', String(Math.floor(Date.now() / 30000)));
        next.src = url.href; await next.decode();
        if (ticket !== epoch) return;
        image.src = next.src; image.alt = `${data.status === 'live' ? 'Stream snapshot' : 'Saved broadcast thumbnail'} from ${channel}: ${data.title}`;
        image.hidden = false; stage.dataset.backdrop = 'twitch';
        status.textContent = data.status === 'live'
          ? `@${channel} · snapshot updates every 30s, not synchronized video.`
          : `@${channel} is offline · saved broadcast${data.recordedAt ? ' · ' + new Date(data.recordedAt).toLocaleDateString() : ''}. Not live.`;
      }
    } catch {
      if (ticket === epoch) fallback(`@${channel} preview unavailable · demo background. Retrying automatically.`);
    } finally {
      if (ticket === epoch) {
        busy = false; timer = setTimeout(() => void refresh(), 30000);
      }
    }
  }
  function render(state) {
    camera.setDevice(state.baseSettings?.cameraId || '');
    const next = state.twitch?.status === 'connected' ? state.twitch.channel : '';
    if (next === channel) return;
    stop(); channel = next || '';
    if (cameraEnabled) return;
    fallback(channel ? `Loading @${channel} preview…` : 'Demo background · connect Twitch to preview your channel.');
    if (channel) void refresh();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  window.addEventListener('pagehide', () => { camera.stop(); stop(); });
  return { render, showCamera: stream => camera.setShared(stream) };
}
