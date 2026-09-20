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
