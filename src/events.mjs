/** Latest-state SSE transport; a slow client never builds an unbounded application queue. */
export class StateStreams {
  constructor() { this.clients = new Set(); this.last = new Map(); }
  attach(response, channel, snapshot) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const client = { response, channel, blocked: false, pending: null, timer: null };
    this.clients.add(client);
    response.on('close', () => { clearTimeout(client.timer); this.clients.delete(client); });
    response.on('drain', () => { client.blocked = false; clearTimeout(client.timer); const payload = client.pending; client.pending = null; if (payload) this.send(client, payload); });
    this.send(client, `data: ${JSON.stringify(snapshot)}\n\n`);
  }
  send(client, payload) {
    if (client.blocked) { client.pending = payload; return; }
    if (!client.response.write(payload)) {
      client.blocked = true; client.timer = setTimeout(() => client.response.destroy(), 10000); client.timer.unref?.();
    }
  }
  publish(channel, snapshot) {
    const json = JSON.stringify(snapshot); if (this.last.get(channel) === json) return;
    this.last.set(channel, json);
    for (const client of this.clients) if (client.channel === channel) this.send(client, `data: ${json}\n\n`);
  }
  heartbeat() { for (const client of this.clients) if (!client.blocked) this.send(client, ': heartbeat\n\n'); }
  close() { for (const client of this.clients) { clearTimeout(client.timer); client.response.end(); } this.clients.clear(); }
}
