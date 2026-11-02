// Shared by capture, setup and server ingestion. Never rely on DOMException.message:
// embedded browsers sometimes return an empty message with a useful error name.
const remedies = {
  NotAllowedError: ['Microphone access blocked', 'Allow microphone access in your browser’s site settings and your computer’s privacy settings, then retry.', 'Microphone settings', 2],
  SecurityError: ['Microphone access blocked', 'Open the studio on localhost or HTTPS in Chrome/Edge and allow microphone access.', 'Microphone settings', 2],
  NotFoundError: ['No microphone found', 'Connect a microphone, then choose it in Setup → Inputs.', 'Choose microphone', 2],
  OverconstrainedError: ['Selected microphone unavailable', 'Your saved microphone is no longer available. Choose System default or another microphone.', 'Choose microphone', 2],
  NotReadableError: ['Microphone could not open', 'Another app or the audio device may be blocking access. Check the device, close conflicting capture apps, then retry.', 'Choose microphone', 2],
  AbortError: ['Microphone startup interrupted', 'The browser or device interrupted startup. Check the microphone connection, then retry.', 'Microphone settings', 2],
  DeviceDisconnected: ['Microphone disconnected', 'Reconnect your microphone or choose another device, then retry.', 'Choose microphone', 2],
  UnsupportedCapture: ['Microphone capture unavailable', 'Open this studio URL in Chrome or Edge, then allow microphone access.', 'Microphone settings', 2],
  UnsupportedSpeech: ['Browser speech unavailable', 'Use Chrome/Edge or select OpenAI speech in Setup → Inputs.', 'Speech settings', 2],
  SpeechPermissionError: ['Speech recognition blocked', 'Allow microphone and speech recognition access, or choose OpenAI speech in Setup → Inputs.', 'Speech settings', 2],
  ConnectionError: ['Audio connection failed', 'Check your internet connection and retry. If this continues, check your speech provider in Setup.', 'Speech settings', 2],
  AuthenticationError: ['OpenAI rejected the audio connection', 'Check your OpenAI key and model access in Setup, then retry.', 'OpenAI settings', 0],
  RateLimitError: ['OpenAI audio limit reached', 'Check your account’s credits and usage limits, or wait before retrying.', 'OpenAI settings', 0],
  ServiceError: ['Speech service error', 'Check your provider connection and account in Setup, then retry.', 'OpenAI settings', 0],
  UnknownError: ['Microphone could not start', 'The browser did not report a specific cause. Test the microphone in Setup → Inputs, then retry.', 'Microphone settings', 2]
};
const stages = ['microphone', 'speech', 'connection', 'capture'];
export function safeCaptureDetail(value) {
  return String(value || '').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/\b(?:sk-|ek_)[A-Za-z0-9_-]+/g, '[redacted]').replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)(\s*[=:]\s*)[^\s&,;]+/gi, '$1$2[redacted]').replace(/https?:\/\/\S+/gi, '[URL omitted]').slice(0, 240);
}
export function captureFailure(error, stage = 'capture') {
  let code = error?.name || 'UnknownError';
  const detail = safeCaptureDetail(error?.message);
  if (!Object.hasOwn(remedies, code)) {
    if (stage === 'connection' && /\b(401|403)\b/.test(detail)) code = 'AuthenticationError';
    else if (stage === 'connection' && /\b429\b/.test(detail)) code = 'RateLimitError';
    else if (stage === 'connection' || error?.name === 'NetworkError') code = 'ConnectionError';
    else code = 'UnknownError';
  }
  const [title, message, action, step] = remedies[code];
  return { code, title, message, action, step, stage: stages.includes(stage) ? stage : 'capture', detail };
}
export function microphoneFailure(input) {
  return captureFailure({ name: input?.failure?.code, message: input?.failure?.detail || input?.error }, input?.failure?.stage);
}
export function speechFailure(code) {
  const name = ({ 'not-allowed': 'SpeechPermissionError', 'service-not-allowed': 'SpeechPermissionError', 'audio-capture': 'NotReadableError', network: 'ConnectionError', 'language-not-supported': 'UnsupportedSpeech' })[code] || 'ServiceError';
  return captureFailure({name, message: `Speech recognition reported: ${String(code || 'unspecified').slice(0,80)}`}, 'speech');
}
