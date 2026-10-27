export class DesktopLifecycle {
  private quitPromise: Promise<void> | null = null;

  get isQuitting(): boolean {
    return this.quitPromise !== null;
  }

  shouldHideOnWindowClose(): boolean {
    return !this.isQuitting;
  }

  quit(closeRuntime: () => Promise<void>): Promise<void> {
    this.quitPromise ??= Promise.resolve().then(closeRuntime).catch((error: unknown) => {
      this.quitPromise = null;
      throw error;
    });
    return this.quitPromise;
  }
}

export function isInternalUrl(target: string, expectedOrigin: string | null): boolean {
  if (expectedOrigin === null) return false;
  try {
    return new URL(target).origin === expectedOrigin;
  } catch {
    return false;
  }
}

/** Paths the server answers with files or data rather than an app page; the window has no Back to leave one. */
const RAW_RESOURCE_PREFIXES = ['/proto/', '/proto-shot/', '/api/'];

/** An app page the main window may show: internal, and not a raw file or API response. */
export function isAppPageUrl(target: string, expectedOrigin: string | null): boolean {
  if (!isInternalUrl(target, expectedOrigin)) return false;
  const { pathname } = new URL(target);
  return !RAW_RESOURCE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isSafeExternalUrl(target: string): boolean {
  try {
    const protocol = new URL(target).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * localStorage is scoped to the page origin, so the desktop server needs the same port every launch
 * or saved settings vanish on restart. Try the stable port first; only a busy port falls back to a free one.
 */
export const DESKTOP_PORT = 4479;

export async function startOnStablePort<T>(start: (port: number) => Promise<T>, port = DESKTOP_PORT): Promise<T> {
  try {
    return await start(port);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'EADDRINUSE') throw error;
    return start(0);
  }
}
