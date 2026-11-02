import { gatherIce } from './rtc-utils.js';

/** One microphone -> one mixed output -> one OBS receiver. Never plays on studio speakers. */
export function createBroadcastAudio({ send, notify = () => {}, onDiagnostic = () => {} }) {
  let input, context, settings, audio, destination, original, originalGain, peer, receiverId, effect;
  let loopTimer, stopped = true, epoch = 0, connecting = false, bridgeAbort, workletReady;
  const onsetBufferSeconds = .12;
  const gain = (node, value, when = audio?.currentTime) => { if (node && audio && audio.state !== 'closed') { node.gain.cancelScheduledValues(audio.currentTime); node.gain.setTargetAtTime(value, Math.max(audio.currentTime, when), .02); } };
  function finishEffect(report = false) {
    const previous = effect; effect = null; gain(originalGain, 1);
    if (!previous) return;
    previous.abort.abort(); clearTimeout(previous.inputTimer); clearTimeout(previous.endTimer); clearTimeout(previous.connectTimer); clearTimeout(previous.transcriptTimer); clearTimeout(previous.renewTimer);
    if (previous.sink) { previous.sink.pause(); previous.sink.srcObject = null; }
    previous.inputTrack?.stop(); previous.peer?.close(); previous.source?.disconnect(); previous.gain?.disconnect(); previous.delay?.disconnect(); previous.detector?.port.postMessage('stop'); previous.detector?.disconnect(); previous.detector?.port.close();
    if (report && context) void send('voice/status', { ...context, id: previous.id, phase: 'finished' }).catch(() => {});
  }
  function closeBridge() { bridgeAbort?.abort(); peer?.close(); peer = null; receiverId = null; }
  function closeGraph() { finishEffect(); closeBridge(); original?.disconnect(); originalGain?.disconnect(); destination?.stream.getTracks().forEach(t => t.stop()); void audio?.close(); audio = null; destination = null; workletReady = null; }
  function stop() { stopped = true; epoch++; clearTimeout(loopTimer); closeGraph(); input = null; context = null; }
  async function graph() {
    if (audio) return;
    audio = new AudioContext(); destination = audio.createMediaStreamDestination();
    originalGain = audio.createGain(); originalGain.gain.value = 1;
    original = audio.createMediaStreamSource(input); original.connect(originalGain).connect(destination);
    await audio.resume();
  }
  async function poll() {
    const generation = epoch;
    try {
      if (stopped || !settings?.voiceEnabled || connecting) return;
      await graph(); if (stopped || generation !== epoch) return;
      const result = await send('voice/signal', context);
      if (stopped || generation !== epoch) return;
      if (result.offer && result.offer.id !== receiverId) {
        connecting = true; closeBridge(); receiverId = result.offer.id;
        bridgeAbort = new AbortController(); const signal = bridgeAbort.signal;
        const next = new RTCPeerConnection(); peer = next;
        next.onconnectionstatechange = () => { if (next === peer && ['failed', 'disconnected', 'closed'].includes(next.connectionState)) { finishEffect(true); notify('OBS audio connection lost. Check the source; unmute your original OBS mic if needed.'); } };
        destination.stream.getAudioTracks().forEach(track => next.addTrack(track, destination.stream));
        await next.setRemoteDescription({ type: 'offer', sdp: result.offer.sdp });
        await next.setLocalDescription(await next.createAnswer()); await gatherIce(next, signal);
        if (stopped || signal.aborted || generation !== epoch) return;
        await send('voice/answer', { ...context, id: receiverId, sdp: next.localDescription.sdp }, signal);
      }
    } catch (error) { if (!stopped && generation === epoch && error.name !== 'AbortError') { closeBridge(); notify('OBS audio is reconnecting. Check the audio source.'); } }
    finally { connecting = false; if (!stopped && generation === epoch) loopTimer = setTimeout(poll, 1000); }
  }
  async function startEffect(request) {
    if (!audio || !input || peer?.connectionState !== 'connected') return;
    const current = { id: request.id, abort: new AbortController(), active: false, inputTrack: input.getAudioTracks()[0].clone() };
    effect = current;
    const alive = () => effect === current && !current.abort.signal.aborted;
    const fail = (reason = 'Connection lost.') => { if (!alive()) return; const saved = context; finishEffect(); notify(`${typeof reason === 'string' ? reason : 'Connection lost.'} Voice translation stopped. Normal microphone restored.`); void send('voice/status', { ...saved, id: current.id, phase: 'error' }).catch(() => {}); };
    const renew = () => {
      if (!alive()) return;
      const saved = context; finishEffect();
      void send('voice/status', { ...saved, id: current.id, phase: 'renew' }).catch(() => notify('Voice translation could not reconnect. Your normal microphone is restored.'));
    };
    const activate = async () => {
      if (!alive() || current.active || current.channel?.readyState !== 'open' || !current.source || !current.audible) return;
      // The buffer preserves the detected onset; schedule both gains against
      // the same audio clock so Original speech stays audible until translation arrives.
      const switchAt = Math.max(audio.currentTime, current.onset + onsetBufferSeconds);
      current.active = true; clearTimeout(current.connectTimer); gain(originalGain, 0, switchAt); gain(current.gain, 1, switchAt);
      if (request.mode !== 'continuous') {
        const durationMs = Number.isFinite(request.durationMs) ? Math.min(120000, Math.max(5000, request.durationMs)) : 20000;
        current.inputTimer = setTimeout(() => { if (alive()) current.inputTrack.enabled = false; }, durationMs);
        // Viewer effects keep their bounded input window and finishing tail.
        current.endTimer = setTimeout(() => { if (alive()) finishEffect(true); }, durationMs + 5000);
      }
      try { const result = await send('voice/status', { ...context, id: current.id, phase: 'active' }, current.abort.signal); if (!result.accepted && alive()) finishEffect(); } catch { fail(); }
    };
    try {
      workletReady ||= audio.audioWorklet.addModule(new URL('./dub-readiness-worklet.js', import.meta.url));
      await workletReady; if (!alive()) return;
      current.peer = new RTCPeerConnection();
      const translation = current.peer;
      translation.addTrack(current.inputTrack, new MediaStream([current.inputTrack]));
      current.channel = translation.createDataChannel('oai-events');
      current.channel.onopen = activate;
      current.channel.onclose = () => fail('Translation connection closed.');
      let transcript = '', lastUpdate = 0;
      const publishText = () => { clearTimeout(current.transcriptTimer); current.transcriptTimer = null; if (!alive()) return; lastUpdate = Date.now(); void send('voice/status', { ...context, id: current.id, text: transcript }, current.abort.signal).catch(() => {}); };
      current.channel.onmessage = event => {
        if (!alive()) return; let message; try { message = JSON.parse(event.data); } catch { return; }
        // Renew against the provider's actual expiry, not a guessed session limit.
        if (request.mode === 'continuous' && ['session.created', 'session.updated'].includes(message.type)) {
          const expiresAt = message.session?.expires_at;
          if (Number.isFinite(expiresAt) && expiresAt * 1000 > Date.now()) {
            clearTimeout(current.renewTimer);
            current.renewTimer = setTimeout(renew, Math.min(2147483647, Math.max(1000, expiresAt * 1000 - Date.now() - 30000)));
          }
        }
        if (message.type === 'session.closed') { if (request.mode === 'continuous' && current.active) renew(); else finishEffect(true); return; }
        if (message.type === 'error') { fail('Translation provider reported an error.'); return; }
        if (message.type === 'session.output_transcript.delta' && typeof message.delta === 'string') {
          transcript = (transcript + message.delta).slice(-240);
          if (Date.now() - lastUpdate > 250) publishText(); else if (!current.transcriptTimer) current.transcriptTimer = setTimeout(publishText, 250);
        }
      };
      translation.ontrack = event => {
        if (!alive()) return; current.outputTrack = event.track;
        const remote = event.streams[0] || new MediaStream([event.track]);
        // A muted media sink keeps WebRTC decoding active in embedded browsers.
        current.sink = new Audio(); current.sink.muted = true; current.sink.srcObject = remote; void current.sink.play().catch(() => fail('Translated audio playback could not start.'));
        current.source = audio.createMediaStreamSource(remote);
        current.gain = audio.createGain(); current.gain.gain.value = 0;
        current.delay = audio.createDelay(onsetBufferSeconds); current.delay.delayTime.value = onsetBufferSeconds;
        current.detector = new AudioWorkletNode(audio, 'dub-readiness');
        current.detector.port.onmessage = ({ data }) => { if (!alive() || data.type !== 'audible') return; current.audible = true; current.onset = data.onset; void activate(); };
        current.detector.onprocessorerror = () => fail('Audio processor stopped.');
        current.source.connect(current.detector).connect(current.delay).connect(current.gain).connect(destination);
        event.track.onended = () => fail('Translated audio track ended.');
      };
      translation.onconnectionstatechange = () => { if (['failed', 'disconnected'].includes(translation.connectionState)) fail('Translation connection lost.'); };
      current.connectTimer = setTimeout(() => {
        onDiagnostic({ stage: 'translation-timeout', peer: translation.connectionState, channel: current.channel?.readyState, audible: !!current.audible, source: !!current.source, audio: audio?.state, localCandidates: (translation.localDescription?.sdp.match(/a=candidate:/g)||[]).length, remoteCandidates:(translation.remoteDescription?.sdp.match(/a=candidate:/g)||[]).length });
        fail('No translated audio arrived before the connection deadline.');
      }, 14000);
      const offer = await translation.createOffer(); if (!alive()) return;
      await translation.setLocalDescription(offer);
      const answer = await send('voice/sdp', { ...context, id: current.id, sdp: offer.sdp }, current.abort.signal);
      if (!alive()) return; await translation.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
    } catch { fail('Translation setup failed.'); }
  }
  return {
    attach(stream, identity) { stop(); input = stream; context = identity; stopped = false; void poll(); },
    update(state) {
      settings = state.baseSettings;
      if (stopped) return;
      if (!settings.voiceEnabled) { if (audio) closeGraph(); return; }
      const wanted = state.voice?.effect;
      if (!wanted) { finishEffect(); return; }
      if (effect && wanted.id !== effect.id) finishEffect();
      if (!effect && wanted.phase === 'connecting') void startEffect(wanted);
      if (effect && wanted.phase === 'draining') effect.inputTrack.enabled = false;
    },
    resume() { return audio?.resume(); }, restore() { finishEffect(true); }, stop
  };
}
