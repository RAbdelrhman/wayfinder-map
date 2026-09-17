import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface T3Runtime {
  /** Origin of the local T3 Code server, e.g. http://127.0.0.1:3773. */
  origin: string | null;
  /** True when the desktop app has a registered t3code:// handler. */
  hasDesktopApp: boolean;
}

const RUNTIME_FILE = join(homedir(), '.t3', 'userdata', 'server-runtime.json');

/**
 * Where T3 Code is reachable on this machine. The app writes its port to
 * ~/.t3/userdata/server-runtime.json on every start, so this survives a port change.
 */
export async function detectT3(): Promise<T3Runtime> {
  let origin: string | null = null;
  try {
    const raw = JSON.parse(await readFile(RUNTIME_FILE, 'utf8')) as { origin?: unknown; port?: unknown };
    if (typeof raw.origin === 'string') origin = raw.origin;
    else if (typeof raw.port === 'number') origin = `http://127.0.0.1:${raw.port}`;
  } catch {
    // Not running, or never installed. The clipboard path still works.
  }
  return { origin, hasDesktopApp: await hasProtocolHandler() };
}

async function hasProtocolHandler(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  try {
    await run('reg', ['query', 'HKCU\\Software\\Classes\\t3code\\shell\\open\\command'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** Put `text` on the system clipboard using whatever the platform ships with. */
export async function copyToClipboard(text: string): Promise<void> {
  const [command, args] =
    process.platform === 'win32'
      ? (['powershell', ['-NoProfile', '-NonInteractive', '-Command', '$input | Set-Clipboard']] as const)
      : process.platform === 'darwin'
        ? (['pbcopy', []] as const)
        : (['wl-copy', []] as const);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${String(code)}`))));
    child.stdin.end(text, 'utf8');
  });
}

/** Hand a URL to the OS: the desktop app for t3code://, the browser for http(s). */
export async function openExternal(target: string): Promise<void> {
  if (process.platform === 'win32') {
    await run('cmd', ['/c', 'start', '', target], { windowsHide: true });
    return;
  }
  await run(process.platform === 'darwin' ? 'open' : 'xdg-open', [target]);
}

export interface HandOffResult {
  copied: boolean;
  opened: string | null;
  /** Filled when the clipboard or the launch failed, so the UI can say what went wrong. */
  error: string | null;
}

/**
 * Put the prompt on the clipboard and bring T3 Code forward, so the thread is one
 * paste away. T3 Code's thread-creation API is DPoP-authenticated and internal to a
 * nightly build, so driving it directly would break on the next update.
 */
export async function handOffToT3(prompt: string, runtime: T3Runtime): Promise<HandOffResult> {
  const result: HandOffResult = { copied: false, opened: null, error: null };

  try {
    await copyToClipboard(prompt);
    result.copied = true;
  } catch (error) {
    result.error = `Clipboard: ${(error as Error).message}`;
  }

  const target = runtime.hasDesktopApp ? 't3code://app' : runtime.origin;
  if (target === null) {
    result.error ??= 'T3 Code is not running and no desktop app is registered.';
    return result;
  }

  try {
    await openExternal(target);
    result.opened = target;
  } catch (error) {
    result.error ??= `Launch: ${(error as Error).message}`;
  }

  return result;
}
