// Local display only. Borrow analysis streams without owning their lifetime.
export function webcamPreview({ getMedia, changed }) {
  let enabled = false, generation = 0, owned = null, shared = null, deviceId = '', unwatch = () => {};
  function release() {
    unwatch(); unwatch = () => {};
    owned?.getTracks().forEach(track => track.stop()); owned = null;
  }
  function show(stream) {
    const track = stream.getVideoTracks()[0];
    const ended = () => { if (enabled) stop(new Error('Camera disconnected. Reconnect it, then choose Show webcam again.')); };
    track.addEventListener('ended', ended);
    unwatch = () => track.removeEventListener('ended', ended);
    changed({ enabled: true, stream });
  }
  async function start() {
    const ticket = ++generation; release();
    if (shared?.getVideoTracks().some(track => track.readyState === 'live')) { show(shared); return; }
    changed({ enabled: true, pending: true });
    try {
      const stream = await getMedia({ audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (ticket !== generation || !enabled) { stream.getTracks().forEach(track => track.stop()); return; }
      owned = stream; show(stream);
    } catch (error) { if (ticket === generation && enabled) stop(error); }
  }
  function stop(error) {
    enabled = false; generation++; release(); changed({ enabled: false, error });
  }
  return {
    toggle() { if (enabled) stop(); else { enabled = true; void start(); } },
    stop,
    setDevice(id = '') { if (id === deviceId) return; deviceId = id; if (enabled) void start(); },
    setShared(stream) { if (stream === shared) return; shared = stream; if (enabled) void start(); },
  };
}
