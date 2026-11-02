import { gatherIce } from './rtc-utils.js';
const audio = document.querySelector('#audio'), status = document.querySelector('#status');
const inOBS = !!window.obsstudio; document.body.classList.toggle('obs', inOBS);
const clientId = crypto.randomUUID(); let peer, token, timer, busy = false, ready = false, closed = false, toneId, toneContext, answered = false, answerAt = 0;
async function api(path, body) { const response = await fetch(`/api/voice/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }); const value = await response.json(); if (!response.ok) throw new Error(value.error); return value; }
async function play() {
  try { await audio.play(); ready = peer?.connectionState === 'connected'; status.textContent = ready ? 'Audio connected · check the OBS mixer and stream audio track.' : 'Waiting for the live microphone…'; }
  catch { ready = false; status.textContent = 'Playback blocked. In OBS, use Interact → Enable browser playback.'; }
}
function reset() { const old = peer; peer = null; old?.close(); audio.srcObject = null; ready = false; token = null; answered = false; answerAt = 0; }
async function tone() {
  toneContext ||= new AudioContext(); await toneContext.resume(); const oscillator = toneContext.createOscillator(), volume = toneContext.createGain();
  oscillator.frequency.value = 440; volume.gain.value = .05; oscillator.connect(volume).connect(toneContext.destination); oscillator.start(); oscillator.stop(toneContext.currentTime + .35); oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
}
document.querySelector('#enable').addEventListener('click', async () => { await play(); if (toneContext) await toneContext.resume(); });
async function tick() {
  if (closed || busy) return; busy = true;
  try {
    if (answered && peer?.connectionState !== 'connected' && Date.now() - answerAt > 15000) {
      reset(); status.textContent = 'Audio connection timed out. Reconnecting…';
    }
    if (!peer) {
      const current = new RTCPeerConnection(); peer = current; current.addTransceiver('audio', { direction: 'recvonly' });
      current.ontrack = event => { if (peer !== current) return; audio.srcObject = event.streams[0] || new MediaStream([event.track]); void play(); };
      current.onconnectionstatechange = () => { if (peer !== current) return; if (current.connectionState === 'connected') void play(); else if (['failed', 'disconnected'].includes(current.connectionState)) { reset(); status.textContent = 'Reconnecting. If the stream is silent, unmute your original OBS microphone.'; } };
      await current.setLocalDescription(await current.createOffer()); await gatherIce(current);
      if (closed || peer !== current) return;
      const claim = await api('receiver/start', { clientId, sdp: current.localDescription.sdp }); token = claim.token;
      status.textContent = 'Source registered. Start the studio microphone and enable OBS routing.';
    }
    const current = peer, result = await api('receiver/poll', { token, ready });
    if (closed || current !== peer) return;
    if (result.answer && !answered) { answered = true; answerAt = Date.now(); await current.setRemoteDescription({ type: 'answer', sdp: result.answer }); }
    if (result.tone && result.tone !== toneId) { toneId = result.tone; await tone(); }
  } catch (error) { reset(); status.textContent = error.message || 'Audio source reconnecting…'; }
  finally { busy = false; if (!closed) timer = setTimeout(tick, 1500); }
}
window.addEventListener('beforeunload', () => { closed = true; clearTimeout(timer); if (token) navigator.sendBeacon('/api/voice/receiver/stop', new Blob([JSON.stringify({ token })], { type: 'application/json' })); reset(); void toneContext?.close(); });
void tick();
