// A capture handle exists before permissions resolve. Late streams are always released.
export function createCapture({ context, provider, getSettings, send, report, onMicrophone = () => {}, onCamera = () => {} }) {
  const abort = new AbortController();
  let stopped = false, stream, camera, peer, recognition, audioContext, audioNode, muteGain;
  let commitTimer, cameraTimer, retryTimer, draftTimer, pendingDraft, lastDraft = 0, sequence = 0;
  let audioBusy = false, visionBusy = false, cameraVideo;
  const tracks = new Set();
  const stoppedCheck = media => { if (stopped) { media.getTracks().forEach(track => track.stop()); throw new DOMException('Stopped', 'AbortError'); } media.getTracks().forEach(track => tracks.add(track)); return media; };
  const status = (kind, value, error = '') => { if (!stopped) report(kind, value, error); };
  const emit = data => { if (!stopped) void send('caption', { ...context, ...data }).catch(error => status('microphone', 'error', error.message)); };
  const flush = () => { clearTimeout(draftTimer); draftTimer = null; if (pendingDraft) { const value = pendingDraft; pendingDraft = null; lastDraft = performance.now(); emit(value); } };
  const publish = data => {
    if (data.final) { if (pendingDraft?.segmentId === data.segmentId) pendingDraft = null; emit(data); return; }
    pendingDraft = data;
    const remaining = 90 - (performance.now() - lastDraft);
    if (remaining <= 0) flush(); else if (!draftTimer) draftTimer = setTimeout(() => { draftTimer = null; flush(); }, remaining);
  };
  const stop = () => {
    if (stopped) return; stopped = true; abort.abort();
    clearTimeout(draftTimer); clearTimeout(retryTimer); clearInterval(commitTimer); clearInterval(cameraTimer);
    if (recognition) { recognition.onend = null; recognition.abort(); }
    onMicrophone(null); peer?.close(); for (const track of tracks) track.stop(); tracks.clear();
    audioNode?.disconnect(); muteGain?.disconnect(); void audioContext?.close();
    if (cameraVideo) cameraVideo.srcObject = null; onCamera(null);
  };
  const needsObservations = () => ['context', 'describe', 'chaos'].includes(getSettings().preset);
  const ready = (async () => {
    try {
      const settings = getSettings();
      stream = stoppedCheck(await navigator.mediaDevices.getUserMedia({ audio: { ...(settings.microphoneId ? { deviceId: { exact: settings.microphoneId } } : {}), echoCancellation: true, noiseSuppression: true }, video: false }));
      if (stopped) return;
      onMicrophone(stream);
      // One microphone stream feeds transcription and optional observations.
      try {
      audioContext = new AudioContext({ sampleRate: 24000 });
      await audioContext.audioWorklet.addModule('/audio-worklet.js'); if (stopped) return;
      audioNode = new AudioWorkletNode(audioContext, 'voicebox-buffer');
      muteGain = audioContext.createGain(); muteGain.gain.value = 0;
      audioContext.createMediaStreamSource(stream).connect(audioNode); audioNode.connect(muteGain).connect(audioContext.destination);
      audioNode.port.onmessage = async event => {
        if (stopped || audioBusy || !needsObservations()) return;
        audioBusy = true;
        try { await send('media/audio', { ...context, capturedAt: Date.now() - 3000, audio: encodeWav(event.data, audioContext.sampleRate) }, abort.signal); }
        catch (error) { if (error.name !== 'AbortError') status('audio', 'error', error.message); }
        finally { audioBusy = false; }
      };
      await audioContext.resume();
      } catch (error) {
        audioNode?.disconnect(); muteGain?.disconnect(); void audioContext?.close(); audioContext = null;
        status('audio', 'error', 'Audio descriptions unavailable. Speech can still run.');
      }
      if (stopped) return;
      if (provider === 'browser') {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) throw new Error('Browser speech needs Chrome/Edge. Select OpenAI Realtime in Setup.');
        recognition = new Recognition(); recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true;
        let failures = 0, currentId = null, revision = 0;
        recognition.onstart = () => status('microphone', 'listening');
        recognition.onresult = event => {
          failures = 0;
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (currentId === null) { currentId = sequence++; revision = 0; }
            publish({ segmentId: `browser-${currentId}`, sequence: currentId, revision: ++revision, text: result[0].transcript, final: result.isFinal });
            if (result.isFinal) currentId = null;
          }
        };
        recognition.onerror = event => {
          if (stopped || event.error === 'no-speech') return;
          if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error) || ++failures >= 3) {
            status('microphone', 'error', `Speech recognition stopped (${event.error}). Start again or select OpenAI.`); stop();
          }
        };
        recognition.onend = () => { if (!stopped) retryTimer = setTimeout(() => { try { recognition.start(); } catch { status('microphone', 'error', 'Browser speech ended. Start again.'); stop(); } }, 300); };
        recognition.start();
      } else {
        peer = new RTCPeerConnection(); stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
        const channel = peer.createDataChannel('oai-events'); const items = new Map(); const buffered = new Map();
        const ingest = message => {
          const item = items.get(message.item_id); if (!item || item.final) return;
          const final = message.type === 'conversation.item.input_audio_transcription.completed';
          item.text = final ? message.transcript : item.text + (message.delta || ''); item.final = final;
          publish({ segmentId: message.item_id, sequence: item.sequence, revision: ++item.revision, text: item.text, final });
        };
        channel.onopen = () => {
          status('microphone', 'listening');
          commitTimer = setInterval(() => { if (!stopped && channel.readyState === 'open') channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' })); }, 3000);
        };
        channel.onmessage = event => {
          if (stopped) return;
          let message; try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === 'input_audio_buffer.committed') {
            if (!items.has(message.item_id)) items.set(message.item_id, { sequence: sequence++, revision: 0, text: '', final: false });
            for (const value of buffered.get(message.item_id) || []) ingest(value); buffered.delete(message.item_id);
            while (items.size > 200) items.delete(items.keys().next().value);
          } else if (message.type === 'error') {
            const code = message.error?.code || '';
            if (code !== 'input_audio_buffer_commit_empty') status('microphone', 'error', 'The audio service reported an error. Check your connection and account.');
          } else if (['conversation.item.input_audio_transcription.delta', 'conversation.item.input_audio_transcription.completed'].includes(message.type)) {
            if (items.has(message.item_id)) ingest(message);
            else {
              const events = buffered.get(message.item_id) || []; events.push(message); buffered.set(message.item_id, events.slice(-100));
              while (buffered.size > 20) buffered.delete(buffered.keys().next().value);
            }
          }
        };
        peer.onconnectionstatechange = () => {
          if (stopped) return;
          if (peer.connectionState === 'failed') { status('microphone', 'error', 'Audio connection failed. Start again.'); stop(); }
          else if (peer.connectionState === 'disconnected') status('microphone', 'starting', 'Audio reconnecting…');
          else if (peer.connectionState === 'connected') status('microphone', 'listening');
        };
        const offer = await peer.createOffer(); if (stopped) return;
        await peer.setLocalDescription(offer);
        const answer = await send('realtime/sdp', { ...context, sdp: offer.sdp }, abort.signal); if (stopped) return;
        await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      }
      // Camera denial never stops healthy speech.
      if (getSettings().cameraEnabled && !stopped) {
        try {
          camera = stoppedCheck(await navigator.mediaDevices.getUserMedia({ video: { ...(settings.cameraId ? { deviceId: { exact: settings.cameraId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }));
          cameraVideo = document.createElement('video'); cameraVideo.muted = true; cameraVideo.playsInline = true; cameraVideo.srcObject = camera; await cameraVideo.play(); if (stopped) return;
          onCamera(camera); status('camera', 'listening');
          const canvas = document.createElement('canvas');
          cameraTimer = setInterval(async () => {
            if (stopped || visionBusy || !needsObservations() || !getSettings().cameraEnabled) return;
            const crop = getSettings().crop, width = cameraVideo.videoWidth, height = cameraVideo.videoHeight;
            if (!width || !height) return;
            const cw = width * crop.width, ch = height * crop.height, scale = Math.min(1, 640 / Math.max(cw, ch));
            canvas.width = Math.max(1, Math.round(cw * scale)); canvas.height = Math.max(1, Math.round(ch * scale));
            canvas.getContext('2d').drawImage(cameraVideo, width * crop.x, height * crop.y, cw, ch, 0, 0, canvas.width, canvas.height);
            visionBusy = true;
            try { await send('media/vision', { ...context, capturedAt: Date.now(), image: canvas.toDataURL('image/jpeg', .7) }, abort.signal); }
            catch (error) { if (error.name !== 'AbortError') status('camera', 'error', error.message); }
            finally { visionBusy = false; }
          }, 2000);
        } catch (error) { if (!stopped) status('camera', 'error', 'Camera unavailable. Check permission or select OBS Virtual Camera. Speech is still running.'); }
      }
    } catch (error) { if (!stopped) { status('microphone', 'error', error.message); stop(); throw error; } }
  })();
  return { stop, ready };
}

export function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const text = (at, value) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  const bytes = new Uint8Array(buffer); let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary);
}
