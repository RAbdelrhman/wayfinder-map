import { describe, expect, it, vi } from 'vitest';

import { shouldEnableUpdates, updateChannel } from './updaterPolicy.js';

/*
  electron-updater's `autoUpdater` is a getter that builds an updater as soon as it is
  read, and that constructor needs a running Electron app. Reading it while the module
  loads killed the main process before it opened a window, so this stands in for it and
  throws if anything reads it outside an enabled run.
*/
let reads = 0;
vi.mock('electron-updater', () => ({
  default: {
    get autoUpdater() {
      reads += 1;
      throw new Error('autoUpdater was read without a running app');
    },
  },
}));

vi.mock('electron', () => ({ dialog: { showMessageBox: vi.fn() }, shell: { openExternal: vi.fn() } }));

describe('desktop update policy', () => {
  it('uses architecture-specific GitHub release channels', () => {
    expect(updateChannel('x64')).toBe('latest-x64');
    expect(updateChannel('arm64')).toBe('latest-arm64');
  });

  it('enables updates only for packaged, signed, stable builds', () => {
    expect(shouldEnableUpdates(true, '1.2.3', true)).toBe(true);
    expect(shouldEnableUpdates(false, '1.2.3', true)).toBe(false);
    expect(shouldEnableUpdates(true, '1.2.3-beta.1', true)).toBe(false);
    expect(shouldEnableUpdates(true, '1.2.3', false)).toBe(false);
  });
});

describe('startAutoUpdates', () => {
  it('does not touch electron-updater when updates are off', async () => {
    const { startAutoUpdates } = await import('./updater.js');
    expect(reads).toBe(0);

    const stop = startAutoUpdates({
      window: {} as never,
      enabled: false,
      prepareForRestart: async () => undefined,
    });

    expect(reads).toBe(0);
    expect(() => stop()).not.toThrow();
  });
});
