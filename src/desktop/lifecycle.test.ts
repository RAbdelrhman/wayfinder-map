import { describe, expect, it, vi } from 'vitest';

import { DesktopLifecycle, isInternalUrl, isSafeExternalUrl } from './lifecycle.js';

describe('DesktopLifecycle', () => {
  it('hides ordinary window closes and lets a requested quit close the window', async () => {
    const lifecycle = new DesktopLifecycle();
    const closeRuntime = vi.fn(async () => undefined);
    expect(lifecycle.shouldHideOnWindowClose()).toBe(true);
    await Promise.all([lifecycle.quit(closeRuntime), lifecycle.quit(closeRuntime)]);
    expect(lifecycle.shouldHideOnWindowClose()).toBe(false);
    expect(closeRuntime).toHaveBeenCalledTimes(1);
  });
});

describe('desktop navigation boundary', () => {
  it('accepts only the active loopback origin as internal', () => {
    expect(isInternalUrl('http://127.0.0.1:4481/repos/owner/repo', 'http://127.0.0.1:4481')).toBe(true);
    expect(isInternalUrl('http://127.0.0.1:4482/', 'http://127.0.0.1:4481')).toBe(false);
    expect(isInternalUrl('https://example.com/', 'http://127.0.0.1:4481')).toBe(false);
  });

  it('allows only web URLs through the operating-system browser', () => {
    expect(isSafeExternalUrl('https://github.com/owner/repo')).toBe(true);
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });
});
