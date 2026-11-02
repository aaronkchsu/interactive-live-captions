import { captureFailure, safeCaptureDetail } from './public/capture-errors.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { StreamSession } from './src/session.mjs';
import { FileStorage, MemoryStorage, CredentialProvider } from './src/storage.mjs';
import { OpenAIProvider } from './src/providers.mjs';
import { TwitchAdapter, TwitchOAuth } from './src/twitch.mjs';
import { StateStreams } from './src/events.mjs';
import { defaults } from './src/state.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const testMode = process.env.VOICE_BOX_TEST_MODE === '1';
if (!testMode) {
  try { process.loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const port = Number(process.env.PORT || 4317);
const storage = testMode ? new MemoryStorage() : new FileStorage(resolve(root, '.local'));
const credentials = new CredentialProvider(storage);
const owner = { streamerId: 'local-owner', sessionId: 'setup' };
if (!testMode) {
  const current = await credentials.get(owner), patch = {};
  for (const [field, variable] of Object.entries({ openaiKey: 'OPENAI_API_KEY', twitchClientId: 'TWITCH_CLIENT_ID', twitchClientSecret: 'TWITCH_CLIENT_SECRET', twitchToken: 'TWITCH_ACCESS_TOKEN' })) {
    if (!Object.hasOwn(current, field) && process.env[variable]) patch[field] = process.env[variable];
  }
  if (Object.keys(patch).length) await credentials.update(owner, patch);
}
const models = Object.fromEntries(Object.entries({ transcription: 'TRANSCRIPTION_MODEL', translation: 'TRANSLATION_MODEL', vision: 'VISION_MODEL', audio: 'AUDIO_OBSERVATION_MODEL', commentary: 'COMMENTARY_MODEL', dubbing: 'DUBBING_MODEL' }).filter(([, key]) => process.env[key]).map(([name, key]) => [name, process.env[key]]));
let session;
const provider = new OpenAIProvider({ credentials, models, onUsage: (context, usage) => {
  if (session && context.streamerId === session.streamerId && context.sessionId === session.sessionId) {
    session.usage.requests++; session.usage.inputTokens += usage.input_tokens || usage.prompt_tokens || 0; session.usage.outputTokens += usage.output_tokens || usage.completion_tokens || 0;
  }
} });
session = new StreamSession({ streamerId: owner.streamerId, provider, settings: await storage.get(owner.streamerId, 'settings') });
session.available = await credentials.status(owner);
const streams = new StateStreams();
let overlayQueued = false;
session.onChange = () => {
  if (overlayQueued) return;
  overlayQueued = true;
  queueMicrotask(() => { overlayQueued = false; streams.publish('overlay', session.overlay()); });
};
const twitch = new TwitchAdapter({ context: owner, credentials,
  onStatus: state => { const wasConnected = session.chat.connected; session.twitch = state; session.chat.connected = state.status === 'connected'; if (!wasConnected && session.chat.connected) { session.chat.reset(); session.chat.connected = true; } },
  onChat: message => { if (session.enabled('chorus')) session.chat.add(message); }, onDelete: id => session.removeChat(id), onClear: () => session.removeChat(),
  onAction: action => { const result = session.action(action); if (!result.applied) session.addEvent(result.message || 'Audience cooldown active.', action.origin); if ((action.kind === 'language' || result.persisted) && result.applied) void persistSettings(); },
  subscriptionAddons: () => session.base.addons.filter(a => a.enabled && a.trigger === 'subscription').slice(0, 1),
  mappings: () => session.base.rewardMappings });
let publicOrigin = `http://localhost:${port}`;
const oauth = new TwitchOAuth({ credentials, callback: `${publicOrigin}/auth/twitch/callback` });
const persistSettings = () => storage.put(owner.streamerId, 'settings', session.base).catch(() => { session.addEvent('Settings could not be saved. Check local disk access.'); });
function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
async function readBody(request, limit = 16000) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw new Error('Request too large.'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
function capture(body) { if (!session.owns(body)) throw new Error('This capture session has expired. Start again.'); }
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = http.createServer(async (request, response) => {
  const hostname = String(request.headers.host || '').split(':')[0];
  if (!['localhost', '127.0.0.1'].includes(hostname)) return json(response, 403, { error: 'Use the local studio address.' });
  const url = new URL(request.url, publicOrigin);
  try {
    if (request.method === 'POST') {
      if ((request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) || request.headers['sec-fetch-site'] === 'cross-site') return json(response, 403, { error: 'Only same-origin studio requests are accepted.' });
    }
    if (request.method === 'GET') {
      if (testMode && url.pathname === '/test/broadcast') { response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); response.end(await readFile(resolve(root, 'tests/browser-broadcast.html'))); return; }
      if (url.pathname === '/api/state') return json(response, 200, session.snapshot());
      if (url.pathname === '/api/overlay/state') return json(response, 200, session.overlay());
      if (url.pathname === '/api/setup') return json(response, 200, { ...await credentials.status(owner), callback: oauth.callback, models: provider.models, localOnly: true });
      if (url.pathname === '/api/events' || url.pathname === '/api/overlay/events') {
        const overlay = url.pathname.includes('/overlay/'); streams.attach(response, overlay ? 'overlay' : 'studio', overlay ? session.overlay() : session.snapshot()); return;
      }
      if (url.pathname === '/auth/twitch/callback') {
        const cookie = String(request.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('voicebox_oauth='))?.slice('voicebox_oauth='.length);
        try {
          await oauth.complete(owner, url.searchParams.get('code'), url.searchParams.get('state'), cookie);
          session.available = await credentials.status(owner); await twitch.connect();
          response.writeHead(302, { Location: '/?twitch=connected', 'Set-Cookie': 'voicebox_oauth=; Path=/auth/twitch; HttpOnly; SameSite=Lax; Max-Age=0' }); response.end();
        } catch (error) {
          session.addEvent(error.message); response.writeHead(302, { Location: '/?twitch=error', 'Set-Cookie': 'voicebox_oauth=; Path=/auth/twitch; HttpOnly; SameSite=Lax; Max-Age=0' }); response.end();
        }
        return;
      }
    }
    if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
      const body = JSON.parse(await readBody(request, url.pathname.startsWith('/api/media/') ? 1000000 : 150000) || '{}');
      switch (url.pathname) {
        case '/api/voice/receiver/start': return json(response, 200, session.voice.claim(body));
        case '/api/voice/receiver/poll': return json(response, 200, session.voice.poll(body));
        case '/api/voice/receiver/stop': session.voice.release(body.token); return json(response, 200, { ok: true });
        case '/api/voice/signal': capture(body); return json(response, 200, { offer: session.base.voiceEnabled ? session.voice.offer() : null });
        case '/api/voice/answer': capture(body); session.voice.answer(body.id, body.sdp); return json(response, 200, { ok: true });
        case '/api/voice/status': capture(body); return json(response, 200, { accepted: session.voice.status(body) });
        case '/api/voice/stop': session.voice.cancel(); return json(response, 200, { ok: true });
        case '/api/voice/test-tone': session.voice.testTone(); return json(response, 200, { ok: true });
        case '/api/voice/start': return json(response, 200, session.startVoice());
        case '/api/voice/sdp': {
          capture(body); const effect = session.voice.effect;
          if (!effect || effect.id !== body.id || effect.phase !== 'connecting' || effect.negotiating || !session.voice.connected() || !session.base.voiceEnabled) throw new Error('Voice effect is unavailable or already connecting.');
          if (typeof body.sdp !== 'string' || !body.sdp.startsWith('v=0') || body.sdp.length > 100000) throw new Error('Invalid voice offer.');
          effect.negotiating = true;
          const controller = new AbortController(); response.on('close', () => { if (!response.writableEnded) controller.abort(); });
          try {
            const sdp = await provider.negotiateTranslation(session.context(), body.sdp, controller.signal, effect.language);
            capture(body); if (!session.voice.owns(body.id)) throw new Error('Voice effect ended.');
            return json(response, 200, { sdp });
          } catch (error) { if (session.voice.owns(body.id)) session.voice.cancel(error.message); throw error; }
        }
        case '/api/output': session.setOutput(body.state); return json(response, 200, session.snapshot());
        case '/api/settings': session.setSettings(body); await persistSettings(); return json(response, 200, session.snapshot());
        case '/api/session': {
          const mode = body.mode === 'live' ? 'live' : 'demo';
          const connection = session.begin(mode, body.provider === 'openai' ? 'openai' : 'browser');
          return json(response, 200, { ...session.snapshot(), captureId: connection.captureId });
        }
        case '/api/capture/heartbeat': capture(body); session.heartbeat(); return json(response, 200, { ok: true });
        case '/api/caption': { capture(body); return json(response, 200, { accepted: session.acceptSpeech(body) }); }
        case '/api/microphone':
        case '/api/camera': {
          capture(body); const target = url.pathname.endsWith('camera') ? session.camera : session.microphone;
          target.status = ['listening', 'error', 'stopped', 'starting', 'idle'].includes(body.status) ? body.status : 'idle';
          target.error = safeCaptureDetail(body.error);
          if (target === session.microphone) {
            session.microphone.failure = target.status === 'error' ? captureFailure({name: body.failure?.code, message: body.failure?.detail || body.error}, body.failure?.stage) : null;
            if (session.microphone.failure) target.error = session.microphone.failure.message;
          }
          if (target === session.microphone && ['stopped', 'error'].includes(target.status)) session.stopCapture();
          return json(response, 200, { ok: true });
        }
        case '/api/media/audio':
        case '/api/media/vision': { capture(body); return json(response, 200, { accepted: session.ingestMedia(url.pathname.split('/').at(-1), body) }); }
        case '/api/realtime/sdp': {
          capture(body); if (typeof body.sdp !== 'string' || body.sdp.length > 100000) throw new Error('Invalid audio offer.');
          const controller = new AbortController(); response.on('close', () => { if (!response.writableEnded) controller.abort(); });
          const answer = await provider.negotiate(session.context(), body.sdp, controller.signal);
          capture(body); return json(response, 200, { sdp: answer });
        }
        case '/api/playback': if (session.mode !== 'demo') throw new Error('Playback applies to sample captions.'); session.playing = !session.playing; if (session.playing) session.showDemo(); return json(response, 200, session.snapshot());
        case '/api/action': { const result = session.action({ id: randomUUID(), kind: body.kind, value: body.value, moderator: true, origin: 'demo', actor: 'Studio preview' }); if (result.persisted) await persistSettings(); return json(response, 200, result); }
        case '/api/effects/reset': if (session.voice.effect?.mode !== 'continuous') session.voice.cancel(); session.clearEffect(); return json(response, 200, session.snapshot());
        case '/api/reset': session.setSettings(defaults); session.lastAction = -Infinity; await persistSettings(); return json(response, 200, session.snapshot());
        case '/api/setup/openai': {
          if (typeof body.key !== 'string' || body.key.length > 512) throw new Error('Enter an OpenAI key.');
          if (session.mode === 'live') session.begin('demo');
          await credentials.update(owner, { openaiKey: body.key.trim() }); session.available = await credentials.status(owner);
          return json(response, 200, { saved: true, ...session.available });
        }
        case '/api/setup/validate': return json(response, 200, await provider.validate(session.context()));
        case '/api/setup/test': {
          const started = Date.now(), text = await provider.translate(session.context(), 'Hello everyone. Welcome to the stream.', 'zh');
          return json(response, 200, { source: 'Hello everyone. Welcome to the stream.', translation: text, latency: Date.now() - started });
        }
        case '/api/setup/twitch': {
          if (typeof body.clientId !== 'string' || !/^[a-zA-Z0-9]{1,100}$/.test(body.clientId)) throw new Error('Enter your Twitch application client ID.');
          if (typeof body.clientSecret !== 'string' || !body.clientSecret.trim() || body.clientSecret.length > 512) throw new Error('Enter your Twitch application secret.');
          twitch.disconnect(); await credentials.update(owner, { twitchClientId: body.clientId, twitchClientSecret: body.clientSecret.trim(), twitchToken: '', twitchRefreshToken: '' });
          session.available = await credentials.status(owner); return json(response, 200, { saved: true });
        }
        case '/api/twitch/oauth': {
          const authorization = await oauth.authorize(owner, session.base.addons.some(a => a.enabled && a.trigger === 'subscription'));
          response.setHeader('Set-Cookie', `voicebox_oauth=${authorization.state}; Path=/auth/twitch; HttpOnly; SameSite=Lax; Max-Age=600`);
          return json(response, 200, { url: authorization.url });
        }
        case '/api/twitch/connect': await twitch.connect(); return json(response, 200, { ok: true });
        case '/api/twitch/disconnect': twitch.disconnect(); await credentials.update(owner, { twitchToken: '', twitchRefreshToken: '' }); session.available = await credentials.status(owner); return json(response, 200, { ok: true });
        case '/api/twitch/preview': return json(response, 200, await twitch.preview(typeof body.channel === 'string' ? body.channel.trim() : ''));
        case '/api/twitch/rewards': return json(response, 200, { rewards: await twitch.rewards() });
        default: return json(response, 404, { error: 'Unknown studio action.' });
      }
    }
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname === '/overlay' ? '/overlay.html' : url.pathname === '/voice' ? '/voice.html' : url.pathname;
    const path = resolve(root, 'public', `.${decodeURIComponent(pathname)}`);
    if (!path.startsWith(resolve(root, 'public') + sep)) return json(response, 403, { error: 'Forbidden' });
    const content = await readFile(path);
    const contentType = mime[extname(path)] || 'application/octet-stream';
    const encoding = contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'image/svg+xml' ? '; charset=utf-8' : '';
    response.writeHead(200, { 'Content-Type': contentType + encoding, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); response.end(content);
  } catch (error) { if (!response.headersSent) json(response, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? 'Not found' : error.message }); else response.destroy(); }
});
let ticks = 0;
const tickTimer = setInterval(() => { session.tick(); streams.publish('overlay', session.overlay()); if (++ticks % 5 === 0) streams.publish('studio', session.snapshot()); }, 100);
const heartbeatTimer = setInterval(() => streams.heartbeat(), 15000);
server.listen(port, '127.0.0.1', () => {
  publicOrigin = process.env.APP_ORIGIN || `http://localhost:${server.address().port}`;
  const parsed = new URL(publicOrigin);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error('This release supports a local APP_ORIGIN only.');
  oauth.callback = `${publicOrigin}/auth/twitch/callback`;
  console.log(`Streamer Voice Box studio: ${publicOrigin}`); console.log(`OBS browser source: ${publicOrigin}/overlay`);
  if (!testMode && session.available.twitch) void twitch.connect().catch(() => {
    session.addEvent('Twitch could not reconnect. Use Reconnect Twitch in Setup.');
  });
});
function shutdown() { clearInterval(tickTimer); clearInterval(heartbeatTimer); session.close(); twitch.disconnect(); streams.close(); server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
