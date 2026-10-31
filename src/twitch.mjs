import { randomBytes } from 'node:crypto';
import { parseCommand } from './state.mjs';

export class TwitchOAuth {
  constructor({ credentials, callback, fetcher = fetch, now = Date.now }) { this.credentials = credentials; this.callback = callback; this.fetcher = fetcher; this.now = now; this.pending = new Map(); }
  async authorize(context) {
    const c = await this.credentials.get(context);
    if (!c.twitchClientId || !c.twitchClientSecret) throw new Error('Save your Twitch application client ID and secret first.');
    const state = randomBytes(32).toString('hex');
    for (const [key, item] of this.pending) if (item.until < this.now() || item.owner === context.streamerId) this.pending.delete(key);
    this.pending.set(state, { owner: context.streamerId, until: this.now() + 600000 });
    const query = new URLSearchParams({ client_id: c.twitchClientId, redirect_uri: this.callback, response_type: 'code', scope: 'user:read:chat channel:read:redemptions', state, force_verify: 'true' });
    return { state, url: `https://id.twitch.tv/oauth2/authorize?${query}` };
  }
  async complete(context, code, state, cookieState) {
    const pending = this.pending.get(state); this.pending.delete(state);
    if (!pending || pending.owner !== context.streamerId || pending.until < this.now() || state !== cookieState) throw new Error('Twitch sign-in expired or could not be verified. Start again from Setup.');
    if (!code) throw new Error('Twitch authorization was cancelled.');
    const c = await this.credentials.get(context);
    const response = await this.fetcher('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.twitchClientId, client_secret: c.twitchClientSecret, code, grant_type: 'authorization_code', redirect_uri: this.callback }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Twitch authorization failed (${response.status}).`);
    const data = await response.json();
    if (!data.access_token || !data.refresh_token) throw new Error('Twitch returned an incomplete connection.');
    await this.credentials.update(context, { twitchToken: data.access_token, twitchRefreshToken: data.refresh_token, twitchExpiresAt: this.now() + data.expires_in * 1000 });
  }
}

export class TwitchAdapter {
  constructor({ context, credentials, onStatus, onChat, onDelete, onClear, onAction, mappings, fetcher = fetch, socketFactory = url => new WebSocket(url), now = Date.now }) {
    this.context = context; this.credentials = credentials; this.onStatus = onStatus; this.onChat = onChat;
    this.onDelete = onDelete; this.onClear = onClear; this.onAction = onAction; this.mappings = mappings;
    this.fetcher = fetcher; this.socketFactory = socketFactory; this.now = now;
    this.epoch = 0; this.sockets = new Set(); this.timers = new Set(); this.seen = new Set(); this.retries = 0;
  }
  timer(fn, delay) { const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, delay); timer.unref?.(); this.timers.add(timer); return timer; }
  status(status, channel = '', error = '') { this.onStatus({ status, channel, error }); }
  disconnect() { this.epoch++; for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); for (const socket of this.sockets) socket.close(); this.sockets.clear(); this.current = null; this.status('disconnected'); }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    const epoch = this.epoch;
    this.refreshing = (async () => {
      const c = await this.credentials.get(this.context);
      if (!c.twitchRefreshToken || !c.twitchClientSecret) throw new Error('Reconnect Twitch in Setup.');
      const response = await this.fetcher('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.twitchRefreshToken, client_id: c.twitchClientId, client_secret: c.twitchClientSecret }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Twitch access expired. Reconnect in Setup.');
      const data = await response.json();
      if (epoch !== this.epoch) throw new Error('Twitch connection changed.');
      await this.credentials.update(this.context, { twitchToken: data.access_token, twitchRefreshToken: data.refresh_token || c.twitchRefreshToken, twitchExpiresAt: this.now() + data.expires_in * 1000 });
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async helix(path, options = {}, retried = false) {
    const c = await this.credentials.get(this.context);
    const response = await this.fetcher(`https://api.twitch.tv/helix/${path}`, { ...options,
      headers: { Authorization: `Bearer ${c.twitchToken}`, 'Client-Id': c.twitchClientId, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (response.status === 401 && !retried) { await this.refresh(); return this.helix(path, options, true); }
    if (!response.ok) throw new Error(`Twitch request failed (${response.status}). Check permissions in Setup.`);
    return response.json();
  }
  async validate(retried = false) {
    const c = await this.credentials.get(this.context);
    const response = await this.fetcher('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${c.twitchToken}` }, signal: AbortSignal.timeout(10000) });
    if (response.status === 401 && !retried && c.twitchRefreshToken) { await this.refresh(); return this.validate(true); }
    if (!response.ok) throw new Error('Twitch connection is invalid. Reconnect in Setup.');
    const identity = await response.json();
    if (identity.client_id !== c.twitchClientId || !identity.scopes?.includes('user:read:chat')) throw new Error('Twitch connection needs user:read:chat permission.');
    return identity;
  }
  async connect() {
    this.disconnect(); const epoch = this.epoch; this.status('connecting');
    try {
      const identity = await this.validate(); if (epoch !== this.epoch) return;
      this.identity = identity; this.retries = 0; this.attach(epoch);
      const check = async () => {
        if (epoch !== this.epoch) return;
        try { await this.validate(); } catch (error) { if (epoch === this.epoch) { this.disconnect(); this.status('error', identity.login, error.message); } return; }
        if (epoch === this.epoch) this.timer(check, 3600000);
      };
      this.timer(check, 3600000);
    } catch (error) { if (epoch === this.epoch) this.status('error', '', error.message); throw error; }
  }
  attach(epoch, url = 'wss://eventsub.wss.twitch.tv/ws', migrating = false) {
    if (epoch !== this.epoch) return;
    const socket = this.socketFactory(url); this.sockets.add(socket); const old = this.current;
    let keepalive, welcome = false;
    const arm = (seconds = 30) => { clearTimeout(keepalive); this.timers.delete(keepalive); keepalive = this.timer(() => socket.close(), (seconds + 5) * 1000); };
    arm(10);
    socket.addEventListener('message', event => { void (async () => {
      if (epoch !== this.epoch) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      const type = message.metadata?.message_type;
      if (type === 'session_welcome') {
        welcome = true;
        if (!migrating) {
          /** @type {[string, {broadcaster_user_id:string,user_id?:string}][]} */
          const conditions = [
            ['channel.chat.message', { broadcaster_user_id: this.identity.user_id, user_id: this.identity.user_id }],
            ['channel.chat.message_delete', { broadcaster_user_id: this.identity.user_id, user_id: this.identity.user_id }],
            ['channel.chat.clear', { broadcaster_user_id: this.identity.user_id, user_id: this.identity.user_id }]
          ];
          if (this.identity.scopes.includes('channel:read:redemptions')) conditions.push(['channel.channel_points_custom_reward_redemption.add', { broadcaster_user_id: this.identity.user_id }]);
          for (const [subscription, condition] of conditions) {
            if (epoch !== this.epoch) return;
            await this.helix('eventsub/subscriptions', { method: 'POST', body: JSON.stringify({ type: subscription, version: '1', condition, transport: { method: 'websocket', session_id: message.payload.session.id } }) });
          }
        }
        if (epoch !== this.epoch) return;
        this.current = socket; if (migrating && old !== socket) old?.close(); this.retries = 0;
        arm(message.payload.session.keepalive_timeout_seconds || 30); this.status('connected', this.identity.login);
      } else if (type === 'session_keepalive') arm();
      else if (type === 'session_reconnect') {
        let next; try { next = new URL(message.payload.session.reconnect_url); } catch { return; }
        if (next.protocol === 'wss:' && (next.hostname === 'eventsub.wss.twitch.tv' || next.hostname.endsWith('.twitch.tv'))) this.attach(epoch, next.href, true);
      } else if (type === 'notification') {
        arm(); const id = message.metadata.message_id;
        if (this.seen.has(id)) return; this.seen.add(id); if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value);
        const data = message.payload.event, subscription = message.payload.subscription.type;
        if (subscription === 'channel.chat.message') {
          this.onChat({ id: data.message_id, author: data.chatter_user_id, text: data.message.text });
          const moderator = data.chatter_user_id === this.identity.user_id || data.badges?.some(badge => ['moderator', 'broadcaster'].includes(badge.set_id));
          const action = parseCommand(data.message.text, moderator);
          if (action) this.onAction({ ...action, id: data.message_id, moderator: !!moderator, origin: 'twitch', actor: data.chatter_user_name });
        } else if (subscription === 'channel.chat.message_delete') this.onDelete(data.message_id);
        else if (subscription === 'channel.chat.clear') this.onClear();
        else if (subscription === 'channel.channel_points_custom_reward_redemption.add') {
          const value = this.mappings()[data.reward.id];
          if (value) this.onAction({ id: data.id, kind: value === 'voice:zh' ? 'voice' : 'mode', value: value === 'voice:zh' ? 'zh' : value, moderator: false, origin: 'reward', actor: data.user_name });
        }
      } else if (type === 'revocation') { this.disconnect(); this.status('error', this.identity.login, 'Twitch revoked a subscription. Reconnect in Setup.'); }
    })().catch(error => { if (epoch === this.epoch) { this.disconnect(); this.status('error', this.identity?.login || '', error.message); } }); });
    socket.addEventListener('error', () => { if (epoch === this.epoch) socket.close(); });
    socket.addEventListener('close', () => {
      clearTimeout(keepalive); this.timers.delete(keepalive); this.sockets.delete(socket);
      if (epoch !== this.epoch || (this.current && this.current !== socket)) return;
      if (!welcome && migrating && old?.readyState === 1) return;
      this.current = null;
      if (++this.retries > 5) { this.status('error', this.identity.login, 'Twitch reconnect attempts stopped. Reconnect in Setup.'); return; }
      this.status('reconnecting', this.identity.login); this.timer(() => this.attach(epoch), Math.min(30000, 1000 * 2 ** this.retries));
    });
  }
  async rewards() {
    if (!this.identity) this.identity = await this.validate();
    const data = await this.helix(`channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(this.identity.user_id)}`);
    return data.data.map(reward => ({ id: reward.id, title: reward.title, cost: reward.cost }));
  }
}
