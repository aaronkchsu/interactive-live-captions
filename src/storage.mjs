import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class MemoryStorage {
  constructor() { this.data = new Map(); }
  async get(owner, kind) { return structuredClone(this.data.get(`${owner}:${kind}`) || {}); }
  async put(owner, kind, value) { this.data.set(`${owner}:${kind}`, structuredClone(value)); }
}
/** Local adapter only. A hosted adapter must encrypt credentials and enforce account access. */
export class FileStorage {
  constructor(directory) { this.directory = directory; this.writes = new Map(); }
  path(owner, kind) {
    if (!/^[a-zA-Z0-9_-]+$/.test(owner) || !['settings', 'credentials'].includes(kind)) throw new Error('Invalid storage identity.');
    return join(this.directory, `${owner}.${kind}.json`);
  }
  async get(owner, kind) {
    try { return JSON.parse(await readFile(this.path(owner, kind), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async put(owner, kind, value) {
    const path = this.path(owner, kind); const contents = JSON.stringify(value);
    const operation = (this.writes.get(path) || Promise.resolve()).catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 }); await chmod(this.directory, 0o700);
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, contents, { mode: 0o600 }); await rename(temporary, path);
    });
    this.writes.set(path, operation); await operation;
  }
}
export class CredentialProvider {
  constructor(storage) { this.storage = storage; this.updates = new Map(); }
  async get(context) { return this.storage.get(context.streamerId, 'credentials'); }
  async update(context, patch) {
    const owner = context.streamerId;
    const operation = (this.updates.get(owner) || Promise.resolve()).catch(() => {}).then(async () => {
      const current = await this.get(context);
      const next = { ...current, ...patch }; await this.storage.put(owner, 'credentials', next); return next;
    });
    this.updates.set(owner, operation);
    try { return await operation; } finally { if (this.updates.get(owner) === operation) this.updates.delete(owner); }
  }
  async status(context) {
    const c = await this.get(context);
    return { openai: !!c.openaiKey, twitchApp: !!(c.twitchClientId && c.twitchClientSecret), twitch: !!c.twitchToken };
  }
}
