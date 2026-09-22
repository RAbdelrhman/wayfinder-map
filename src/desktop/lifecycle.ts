export class DesktopLifecycle {
  private quitPromise: Promise<void> | null = null;

  get isQuitting(): boolean {
    return this.quitPromise !== null;
  }

  shouldHideOnWindowClose(): boolean {
    return !this.isQuitting;
  }

  quit(closeRuntime: () => Promise<void>): Promise<void> {
    this.quitPromise ??= closeRuntime();
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
