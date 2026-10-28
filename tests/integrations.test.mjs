import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorage, MemoryStorage, CredentialProvider } from '../src/storage.mjs';
import { TwitchOAuth, TwitchAdapter } from '../src/twitch.mjs';
import { StateStreams } from '../src/events.mjs';
import { OpenAIProvider } from '../src/providers.mjs';

test('private local storage writes atomically and isolates owner files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-box-test-'));
  try { const store = new FileStorage(directory); await Promise.all([store.put('alice', 'credentials', { key: 'first' }), store.put('alice', 'credentials', { key: 'last' })]);
    assert.equal((await store.get('alice', 'credentials')).key, 'last'); assert.deepEqual(await store.get('bob', 'credentials'), {});
    assert.equal((await stat(join(directory, 'alice.credentials.json'))).mode & 0o777, 0o600);
    assert.throws(() => store.path('../escape', 'credentials')); assert.equal(JSON.parse(await readFile(join(directory, 'alice.credentials.json'), 'utf8')).key, 'last');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('OAuth rejects missing cookie, cross-owner state, cancellation and replay', async () => {
  const credentials = new CredentialProvider(new MemoryStorage()), context = { streamerId: 'a' };
  await credentials.update(context, { twitchClientId: 'client', twitchClientSecret: 'secret' });
  let calls = 0; const oauth = new TwitchOAuth({ credentials, callback: 'http://localhost:4317/auth/twitch/callback', fetcher: async () => { calls++; return { ok: true, json: async () => ({ access_token: 'token', refresh_token: 'refresh', expires_in: 3600 }) }; } });
  let auth = await oauth.authorize(context); await assert.rejects(oauth.complete(context, 'code', auth.state, 'wrong'), /verified/);
  auth = await oauth.authorize(context); await assert.rejects(oauth.complete({ streamerId: 'b' }, 'code', auth.state, auth.state), /verified/);
  auth = await oauth.authorize(context); await assert.rejects(oauth.complete(context, null, auth.state, auth.state), /cancelled/);
  auth = await oauth.authorize(context); await oauth.complete(context, 'code', auth.state, auth.state); assert.equal(calls, 1);
  await assert.rejects(oauth.complete(context, 'code', auth.state, auth.state), /verified/); assert.equal((await credentials.get(context)).twitchToken, 'token');
});
test('Twitch refresh uses the owner credentials and persists rotated tokens', async () => {
  const credentials = new CredentialProvider(new MemoryStorage()), context = { streamerId: 'a' };
  await credentials.update(context, { twitchClientId: 'client', twitchClientSecret: 'secret', twitchToken: 'expired', twitchRefreshToken: 'refresh' });
  const adapter = new TwitchAdapter({ context, credentials, onStatus: () => {}, fetcher: async (url, options) => {
    if (url.endsWith('/token')) return { ok: true, json: async () => ({ access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }) };
    if (options.headers.Authorization === 'OAuth expired') return { ok: false, status: 401 };
    return { ok: true, json: async () => ({ client_id: 'client', user_id: 'a', login: 'alice', scopes: ['user:read:chat'] }) };
  } });
  assert.equal((await adapter.validate()).login, 'alice'); assert.equal((await credentials.get(context)).twitchRefreshToken, 'new-refresh'); assert.deepEqual(await credentials.get({ streamerId: 'b' }), {}); adapter.disconnect();
});
test('SSE keeps only the latest pending state for a stalled client', () => {
  class Response extends EventEmitter { constructor() { super(); this.values = []; this.accept = false; } writeHead() {} write(value) { this.values.push(value); return this.accept; } end() { this.emit('close'); } }
  const response = new Response(), stream = new StateStreams(); stream.attach(response, 'overlay', { frame: 0 });
  for (let i = 1; i < 100; i++) stream.publish('overlay', { frame: i });
  assert.equal(response.values.length, 1); response.accept = true; response.emit('drain'); assert.equal(response.values.length, 2); assert.match(response.values[1], /"frame":99/); stream.close();
});
test('provider failures never forward a secret-containing API error', async () => {
  const credentials = new CredentialProvider(new MemoryStorage()); await credentials.update({ streamerId: 'a' }, { openaiKey: 'test-secret' });
  const provider = new OpenAIProvider({ credentials, fetcher: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid key test-secret' } }) }) });
  await assert.rejects(provider.translate({ streamerId: 'a' }, 'hi', 'zh'), error => /rejected/.test(error.message) && !error.message.includes('test-secret'));
});
test('concurrent credential patches do not lose another lane’s update', async () => {
  const credentials = new CredentialProvider(new MemoryStorage()), context = { streamerId: 'a' };
  await Promise.all([credentials.update(context, { openaiKey: 'one' }), credentials.update(context, { twitchToken: 'two' })]);
  assert.deepEqual(await credentials.get(context), { openaiKey: 'one', twitchToken: 'two' });
});
test('EventSub chat and mapped rewards normalize once and respect moderator identity', async () => {
  const credentials = new CredentialProvider(new MemoryStorage()), context = { streamerId: 'alice' };
  await credentials.update(context, { twitchClientId: 'client', twitchToken: 'token' });
  const chats = [], actions = [], subscriptions = [], statuses = []; let socket;
  const adapter = new TwitchAdapter({ context, credentials, onStatus: value => statuses.push(value), onChat: value => chats.push(value), onAction: value => actions.push(value), onClear: () => {}, onDelete: () => {}, mappings: () => ({ reward1: 'chaos' }),
    fetcher: async (url, options) => {
      if (url.includes('/validate')) return { ok: true, json: async () => ({ client_id: 'client', user_id: 'alice', login: 'alice', scopes: ['user:read:chat', 'channel:read:redemptions'] }) };
      subscriptions.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ data: [] }) };
    }, socketFactory: () => { socket = new EventEmitter(); socket.addEventListener = socket.on.bind(socket); socket.close = () => socket.emit('close'); return socket; }
  });
  try {
    await adapter.connect(); const send = (type, payload, id = type) => socket.emit('message', { data: JSON.stringify({ metadata: { message_type: type, message_id: id }, payload }) });
    send('session_welcome', { session: { id: 'socket1', keepalive_timeout_seconds: 30 } }); await new Promise(r => setImmediate(r));
    assert.equal(subscriptions.length, 4); assert.equal(statuses.at(-1).status, 'connected');
    const chat = { subscription: { type: 'channel.chat.message' }, event: { message_id: 'chat1', chatter_user_id: 'alice', chatter_user_name: 'Alice', message: { text: '!mode reset' }, badges: [] } };
    send('notification', chat, 'delivery1'); send('notification', chat, 'delivery1');
    const reward = { subscription: { type: 'channel.channel_points_custom_reward_redemption.add' }, event: { id: 'redemption1', reward: { id: 'reward1' }, user_name: 'Viewer' } };
    send('notification', reward, 'delivery2'); send('notification', reward, 'delivery2'); await new Promise(r => setImmediate(r));
    assert.equal(chats.length, 1); assert.equal(actions.length, 2); assert.equal(actions[0].moderator, true); assert.equal(actions[0].kind, 'reset'); assert.equal(actions[1].value, 'chaos'); assert.equal(actions[1].moderator, false);
  } finally { adapter.disconnect(); }
});
