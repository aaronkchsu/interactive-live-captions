import { captureFailure, speechFailure } from './capture-errors.js';
import { inputPlan } from './track-model.js';
// A capture handle exists before permissions resolve. Late streams are always released.
function createCaptureCore({ context, provider, getSettings, send, report, onMicrophone = () => {}, onCamera = () => {} }) {
  const abort = new AbortController();
  let failureStage = 'microphone';
  let stopped = false, stream, camera, peer, recognition, audioContext, audioNode, muteGain;
  let commitTimer, cameraTimer, retryTimer, draftTimer, connectionTimer, pendingDraft, lastDraft = 0, sequence = Date.now();
  let audioBusy = false, visionBusy = false, cameraVideo;
  const tracks = new Set();
  const stoppedCheck = media => { if (stopped) { media.getTracks().forEach(track => track.stop()); throw new DOMException('Stopped', 'AbortError'); } media.getTracks().forEach(track => tracks.add(track)); return media; };
  const status = (kind, value, error = '', failure = null) => { if (!stopped) report(kind, value, error, failure); };
  const fail = failure => { status('microphone', 'error', failure.message, failure); stop(); };
  const capturePrefix = crypto.randomUUID();
  const emit = data => { if (!stopped) void send('caption', { ...context, ...data, segmentId: `${capturePrefix}:${data.segmentId}` }).catch(error => { if (!stopped) fail(captureFailure(error, 'connection')); }); };
  const flush = () => { clearTimeout(draftTimer); draftTimer = null; if (pendingDraft) { const value = pendingDraft; pendingDraft = null; lastDraft = performance.now(); emit(value); } };
  const publish = data => {
    if (data.final) { if (pendingDraft?.segmentId === data.segmentId) pendingDraft = null; emit(data); return; }
    pendingDraft = data;
    const remaining = 90 - (performance.now() - lastDraft);
    if (remaining <= 0) flush(); else if (!draftTimer) draftTimer = setTimeout(() => { draftTimer = null; flush(); }, remaining);
  };
  const stop = () => {
    if (stopped) return; stopped = true; abort.abort();
    clearTimeout(draftTimer); clearTimeout(retryTimer); clearTimeout(connectionTimer); clearInterval(commitTimer); clearInterval(cameraTimer);
    if (recognition) { recognition.onend = null; recognition.abort(); }
    onMicrophone(null); peer?.close(); for (const track of tracks) track.stop(); tracks.clear();
    audioNode?.disconnect(); muteGain?.disconnect(); void audioContext?.close();
    if (cameraVideo) cameraVideo.srcObject = null; onCamera(null);
  };
  const needsObservations = () => inputPlan(getSettings()).audio;
  const ready = (async () => {
    try {
      const settings = getSettings();
      const plan = inputPlan(settings);
      if (plan.microphone) {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser does not expose microphone capture.'), {name:'UnsupportedCapture'});
      stream = stoppedCheck(await navigator.mediaDevices.getUserMedia({ audio: { ...(settings.microphoneId ? { deviceId: { exact: settings.microphoneId } } : {}), echoCancellation: true, noiseSuppression: true }, video: false }));
      if (stopped) return;
      for (const track of stream.getAudioTracks()) track.onended = () => { if (!stopped) fail(captureFailure({name:'DeviceDisconnected'}, 'microphone')); };
      onMicrophone(stream);
      if (!plan.speech) status('microphone', 'listening');
      // One microphone stream feeds transcription and optional observations.
      if (plan.audio) try {
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
      failureStage = 'speech';
      if (plan.speech && provider === 'browser') {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) throw Object.assign(new Error('SpeechRecognition is unavailable in this browser.'), {name:'UnsupportedSpeech'});
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
            fail(speechFailure(event.error));
          }
        };
        recognition.onend = () => { if (!stopped) retryTimer = setTimeout(() => { try { recognition.start(); } catch (error) { fail(captureFailure(error, 'speech')); } }, 300); };
        recognition.start();
      } else if (plan.speech) {
        failureStage = 'connection';
        peer = new RTCPeerConnection(); stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
        const channel = peer.createDataChannel('oai-events'); const items = new Map(); const buffered = new Map();
        const connectionDeadline = () => {
          clearTimeout(connectionTimer);
          connectionTimer = setTimeout(() => { if (!stopped) fail(captureFailure({ name: 'ConnectionError', message: 'Speech connection timed out. Retry the live session.' }, 'connection')); }, 20000);
        };
        connectionDeadline();
        const ingest = message => {
          const item = items.get(message.item_id); if (!item || item.final) return;
          const final = message.type === 'conversation.item.input_audio_transcription.completed';
          item.text = final ? message.transcript : item.text + (message.delta || ''); item.final = final;
          publish({ segmentId: message.item_id, sequence: item.sequence, revision: ++item.revision, text: item.text, final });
        };
        channel.onopen = () => {
          if (stopped) return;
          clearTimeout(connectionTimer);
          status('microphone', 'listening');
          commitTimer = setInterval(() => { if (!stopped && channel.readyState === 'open') channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' })); }, 3000);
        };
        channel.onclose = () => { if (!stopped) fail(captureFailure({ name: 'ConnectionError', message: 'Speech data connection closed. Retry the live session.' }, 'connection')); };
        channel.onerror = () => { if (!stopped) fail(captureFailure({ name: 'ConnectionError', message: 'Speech data connection failed.' }, 'connection')); };
        channel.onmessage = event => {
          if (stopped) return;
          let message; try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === 'input_audio_buffer.committed') {
            if (!items.has(message.item_id)) items.set(message.item_id, { sequence: sequence++, revision: 0, text: '', final: false });
            for (const value of buffered.get(message.item_id) || []) ingest(value); buffered.delete(message.item_id);
            while (items.size > 200) items.delete(items.keys().next().value);
          } else if (message.type === 'error' || message.type === 'conversation.item.input_audio_transcription.failed') {
            const code = message.error?.code || '';
            if (code !== 'input_audio_buffer_commit_empty') fail(captureFailure({name: /rate_limit|quota/.test(code) ? 'RateLimitError' : /auth|permission|api_key/.test(code) ? 'AuthenticationError' : 'ServiceError', message: `Audio service code: ${String(code).replace(/[^a-zA-Z0-9_-]/g, '').slice(0,80) || 'unspecified'}`}, 'connection'));
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
          if (peer.connectionState === 'failed') { fail(captureFailure({name:'ConnectionError',message:'WebRTC connection state: failed'}, 'connection')); }
          else if (peer.connectionState === 'disconnected') { connectionDeadline(); status('microphone', 'starting', 'Audio reconnecting…'); }
          else if (peer.connectionState === 'connected' && channel.readyState === 'open') { clearTimeout(connectionTimer); status('microphone', 'listening'); }
        };
        const offer = await peer.createOffer(); if (stopped) return;
        await peer.setLocalDescription(offer);
        const answer = await send('realtime/sdp', { ...context, sdp: offer.sdp }, abort.signal); if (stopped) return;
        await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      }
      } else status('microphone', 'idle');
      // Camera denial never stops healthy speech.
      if (plan.camera && !stopped) {
        try {
          camera = stoppedCheck(await navigator.mediaDevices.getUserMedia({ video: { ...(settings.cameraId ? { deviceId: { exact: settings.cameraId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }));
          cameraVideo = document.createElement('video'); cameraVideo.muted = true; cameraVideo.playsInline = true; cameraVideo.srcObject = camera; await cameraVideo.play(); if (stopped) return;
          onCamera(camera); status('camera', 'listening');
          const canvas = document.createElement('canvas');
          cameraTimer = setInterval(async () => {
            if (stopped || visionBusy || !inputPlan(getSettings()).camera) return;
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
    } catch (error) { if (!stopped) { fail(captureFailure(error, failureStage)); throw error; } }
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

// Reconcile only when capture requirements change, not on every caption update.
// The old handle aborts permissions/connections before a replacement can own inputs.
export function createCapture(options) {
  let active, key, stopped = false;
  function update() {
    if (stopped) return Promise.resolve();
    const settings = options.getSettings(), plan = inputPlan(settings);
    const next = JSON.stringify([plan.microphone, plan.speech, plan.audio, plan.camera, settings.microphoneId, settings.cameraId]);
    if (next === key) return active?.ready || Promise.resolve();
    key = next; active?.stop();
    active = createCaptureCore(options);
    return active.ready;
  }
  const ready = update();
  return { ready, update, stop() { stopped = true; active?.stop(); } };
}
