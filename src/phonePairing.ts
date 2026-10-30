import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { acquireStoreLock } from './handOffTracking.js';

export interface PairedPhone {
  id: string;
  name: string;
  model: string;
  pairedAt: number;
  lastReachedAt: number;
  pushRegistered: boolean;
}
interface PhoneRecord extends Omit<PairedPhone, 'pushRegistered'> { tokenHash: string; pushToken?: string }
interface PairingData {
  version: 1;
  code: { hash: string; expiresAt: number; usedBy?: string } | null;
  phones: PhoneRecord[];
  starts?: Record<string, { phoneId: string; fingerprint: string; reply?: { status: number; body: unknown } }>;
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string): boolean => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(b));
const publicPhone = ({ tokenHash: _token, pushToken, ...phone }: PhoneRecord): PairedPhone => ({ ...phone, pushRegistered: pushToken !== undefined });

/** Per-phone credentials stay on disk as hashes. All read/modify/write operations share a process lock. */
export class PhonePairingStore {
  constructor(private readonly file: string, private readonly now: () => number = Date.now) {}

  private async transaction<T>(work: (data: PairingData) => T): Promise<T> {
    await mkdir(dirname(this.file), { recursive: true });
    const release = await acquireStoreLock(`${this.file}.lock`);
    try {
      let data: PairingData;
      try {
        data = JSON.parse(await readFile(this.file, 'utf8')) as PairingData;
        if (data.version !== 1 || !Array.isArray(data.phones)) throw new Error('Invalid phone pairing store');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        data = { version: 1, code: null, phones: [] };
      }
      const before = JSON.stringify(data);
      const result = work(data);
      if (JSON.stringify(data) === before) return result;
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await rename(temporary, this.file);
      return result;
    } finally { await release(); }
  }

  createCode(): Promise<{ code: string; expiresAt: number }> {
    return this.transaction(data => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const text = [...randomBytes(8)].map(value => alphabet[value % alphabet.length]).join('');
      const code = `${text.slice(0, 4)}-${text.slice(4)}`;
      const expiresAt = this.now() + 5 * 60_000;
      data.code = { hash: hash(code), expiresAt };
      return { code, expiresAt };
    });
  }

  cancelCode(): Promise<void> { return this.transaction(data => { data.code = null; }); }
  codeState(): Promise<{ expiresAt: number; usedBy: string | null } | null> {
    return this.transaction(data => data.code ? { expiresAt: data.code.expiresAt, usedBy: data.code.usedBy ?? null } : null);
  }

  pair(code: string, name: string, model: string): Promise<{ phone: PairedPhone; token: string } | null> {
    return this.transaction(data => {
      if (!data.code || data.code.usedBy || data.code.expiresAt <= this.now() || !equal(code.toUpperCase(), data.code.hash)) return null;
      const token = randomBytes(32).toString('base64url');
      const phone: PhoneRecord = { id: randomUUID(), name, model, pairedAt: this.now(), lastReachedAt: this.now(), tokenHash: hash(token) };
      data.phones.push(phone);
      data.code.usedBy = phone.id;
      return { phone: publicPhone(phone), token };
    });
  }

  authenticate(token: string): Promise<PairedPhone | null> {
    return this.transaction(data => {
      const phone = data.phones.find(candidate => equal(token, candidate.tokenHash));
      if (!phone) return null;
      if (this.now() - phone.lastReachedAt >= 60_000) phone.lastReachedAt = this.now();
      return publicPhone(phone);
    });
  }

  list(): Promise<PairedPhone[]> { return this.transaction(data => data.phones.map(publicPhone)); }
  revoke(id: string): Promise<void> { return this.transaction(data => {
    data.phones = data.phones.filter(phone => phone.id !== id);
    if (data.starts) for (const [key, start] of Object.entries(data.starts)) if (start.phoneId === id) delete data.starts[key];
  }); }

  lookupStart(phoneId: string, requestId: string, fingerprint: string): Promise<{ status: number; body: unknown } | null> {
    return this.transaction(data => {
      const entry = data.starts?.[hash(JSON.stringify([phoneId, requestId]))];
      if (!entry) return null;
      if (entry.fingerprint !== fingerprint) return { status: 409, body: { error: 'Request ID already used for another start.' } };
      return entry.reply ?? { status: 409, body: { error: 'Start outcome unknown. Check the ticket session before retrying.', code: 'start_unknown' } };
    });
  }

  abandonStart(phoneId: string, requestId: string): Promise<void> {
    return this.transaction(data => { if (data.starts) delete data.starts[hash(JSON.stringify([phoneId, requestId]))]; });
  }

  reserveStart(phoneId: string, requestId: string, fingerprint: string): Promise<{ status: number; body: unknown } | null> {
    return this.transaction(data => {
      if (!data.phones.some(phone => phone.id === phoneId)) return { status: 401, body: { error: 'Phone is not paired.' } };
      data.starts ??= {};
      const key = hash(JSON.stringify([phoneId, requestId]));
      const previous = data.starts[key];
      if (previous) return previous.fingerprint !== fingerprint
        ? { status: 409, body: { error: 'Request ID already used for another start.' } }
        : previous.reply ?? { status: 409, body: { error: 'Start outcome unknown. Check the ticket session before retrying.', code: 'start_unknown' } };
      data.starts[key] = { phoneId, fingerprint };
      return null;
    });
  }

  completeStart(phoneId: string, requestId: string, reply: { status: number; body: unknown }): Promise<void> {
    return this.transaction(data => {
      const entry = data.starts?.[hash(JSON.stringify([phoneId, requestId]))];
      if (!entry) return; // Revocation can remove an in-flight reservation.
      entry.reply = reply;
    });
  }
}
