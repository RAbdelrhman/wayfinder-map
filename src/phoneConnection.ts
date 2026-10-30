import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostname } from 'node:os';
import type { Server } from 'node:http';
import { toString as qrSvg } from 'qrcode/lib/browser.js';
import { phoneRemoteServer } from './phoneRemote.js';
import type { PhoneRemoteDependencies } from './phoneRemote.js';

const run = promisify(execFile);
export interface PhoneConnectionOptions {
  address: () => Promise<string | null>;
  port: number;
}
async function tailscaleAddress(): Promise<string | null> {
  const command = process.platform === 'win32' ? 'C:\\Program Files\\Tailscale\\tailscale.exe' : 'tailscale';
  const { stdout } = await run(command, ['status', '--json'], { windowsHide: true, timeout: 5_000, maxBuffer: 1_000_000 });
  const status = JSON.parse(stdout) as { BackendState?: string; Self?: { TailscaleIPs?: string[] } };
  if (status.BackendState !== 'Running') return null;
  return status.Self?.TailscaleIPs?.find(value => /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.(?:\d{1,3})\.(?:\d{1,3})$/.test(value)) ?? null;
}
export interface PhoneConnectionState { name: string; address: string | null; ready: boolean }
export class PhoneConnection {
  private server: Server | null = null;
  private state: PhoneConnectionState = { name: hostname(), address: null, ready: false };
  private opening: Promise<PhoneConnectionState> | null = null;
  private checkedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  constructor(private readonly deps: PhoneRemoteDependencies, private readonly options: PhoneConnectionOptions = { address: tailscaleAddress, port: 4479 }) {}

  start(): void {
    void this.check().catch(() => undefined);
    this.timer ??= setInterval(() => { void this.check(true).catch(() => undefined); }, 15_000);
    this.timer.unref();
  }

  check(force = false): Promise<PhoneConnectionState> {
    if (this.stopped) return Promise.resolve({ ...this.state, address: null, ready: false });
    if (this.opening) return this.opening;
    if (!force && Date.now() - this.checkedAt < 15_000) return Promise.resolve(this.state);
    this.opening ??= this.open().finally(() => { this.opening = null; });
    return this.opening;
  }

  private async open(): Promise<PhoneConnectionState> {
    let ip: string | null;
    try {
      ip = await this.options.address();
    } catch { ip = null; }
    this.checkedAt = Date.now();
    if (this.stopped) return { ...this.state, address: null, ready: false };
    if (!ip) {
      this.stopListener();
      this.state = { name: hostname(), address: null, ready: false };
      return this.state;
    }
    if (this.server?.listening && this.state.address?.startsWith(`http://${ip}:`)) return this.state;
    this.stopListener();
    try {
      const server = phoneRemoteServer(this.deps);
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.options.port, ip, () => { server.removeListener('error', reject); resolve(); });
      });
      this.server = server;
      server.on('error', () => { this.checkedAt = 0; this.stopListener(); });
      if (this.stopped) { this.stopListener(); return { ...this.state, address: null, ready: false }; }
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No phone listener address');
      this.state = { name: hostname(), address: `http://${ip}:${address.port}`, ready: true };
    } catch (error) {
      this.stopListener();
      this.state = { name: hostname(), address: null, ready: false };
      this.checkedAt = 0;
      throw error;
    }
    return this.state;
  }

  async code() {
    const connection = await this.check();
    if (!connection.ready || !connection.address) throw new Error('Tailscale is not running on this desktop.');
    const pairing = await this.deps.pairing.createCode();
    const payload = JSON.stringify({ version: 1, address: connection.address, code: pairing.code });
    const svg = await qrSvg(payload, { type: 'svg' });
    return { ...pairing, address: connection.address, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
  }

  private stopListener(): void { this.server?.closeAllConnections(); this.server?.close(); this.server = null; }
  close(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.stopListener();
  }
}
