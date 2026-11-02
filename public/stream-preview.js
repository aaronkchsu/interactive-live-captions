// Studio-only background. Never forwarded to OBS or to an AI processor.
export function streamPreview({ api }) {
  const stage = document.querySelector('#preview-stage');
  const image = document.querySelector('#stream-snapshot');
  const status = document.querySelector('#preview-source-status');
  let epoch = 0, timer, request, busy = false, channel = '';
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
    if (busy || !channel || document.hidden) return;
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
    const next = state.twitch?.status === 'connected' ? state.twitch.channel : '';
    if (next === channel) return;
    stop(); channel = next || '';
    fallback(channel ? `Loading @${channel} preview…` : 'Demo background · connect Twitch to preview your channel.');
    if (channel) void refresh();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  window.addEventListener('pagehide', stop);
  return { render };
}
