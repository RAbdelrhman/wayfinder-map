import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updater: {
    currentVersion: { version: '1.2.3' },
    allowDowngrade: false,
    allowPrerelease: true,
    autoDownload: false,
    autoInstallOnAppQuit: true,
    channelValue: '',
    get channel() {
      return this.channelValue;
    },
    set channel(value: string) {
      this.channelValue = value;
      // Match electron-updater's channel setter side effect.
      this.allowDowngrade = true;
    },
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));

vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.updater } }));
vi.mock('electron', () => ({
  dialog: { showMessageBox: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

import { startAutoUpdates } from './updater.js';

describe('enabled desktop updates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.updater.checkForUpdates.mockReset();
    mocks.updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.2.3' },
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function start() {
    return startAutoUpdates({
      window: {} as never,
      enabled: true,
      prepareForRestart: async () => undefined,
    });
  }

  it('keeps downgrades disabled after selecting the architecture channel', async () => {
    const handle = start();
    await handle.check();

    expect(mocks.updater.channel).toBe(`latest-${process.arch === 'arm64' ? 'arm64' : 'x64'}`);
    expect(mocks.updater.allowDowngrade).toBe(false);
    expect(mocks.updater.allowPrerelease).toBe(false);
    expect(mocks.updater.autoDownload).toBe(true);
    expect(mocks.updater.autoInstallOnAppQuit).toBe(false);
    handle.stop();
  });

  it('does not offer an older version returned by the release feed', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.2.2' },
    });
    const handle = start();

    await expect(handle.check()).resolves.toMatchObject({
      status: 'up-to-date',
      currentVersion: '1.2.3',
      latestVersion: '1.2.2',
    });
    handle.stop();
  });

  it('honors the updater availability decision for a newer staged release', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.2.4' },
    });
    const handle = start();

    await expect(handle.check()).resolves.toMatchObject({ status: 'up-to-date' });
    handle.stop();
  });

  it('offers a newer version when the updater accepts it', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '1.2.4' },
    });
    const handle = start();

    await expect(handle.check()).resolves.toMatchObject({
      status: 'available',
      currentVersion: '1.2.3',
      latestVersion: '1.2.4',
    });
    handle.stop();
  });
});
