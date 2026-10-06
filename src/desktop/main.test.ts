import { expect, it, vi } from 'vitest';
import type { UpdateOptions } from './updater.js';

const mocks = vi.hoisted(() => {
  const image = { resize: vi.fn(), isEmpty: () => false };
  image.resize.mockReturnValue(image);
  return {
    image,
    closeRuntime: vi.fn(async () => undefined),
    install: vi.fn<() => Promise<void>>(),
    stopUpdates: vi.fn(),
    openExternal: vi.fn(),
    app: {
      isPackaged: false,
      setAppUserModelId: vi.fn(),
      requestSingleInstanceLock: () => true,
      whenReady: async () => undefined,
      getVersion: () => '0.2.12',
      getAppPath: () => process.cwd(),
      quit: vi.fn(),
      on: vi.fn<(event: string, listener: (event: { preventDefault: () => void }) => void) => void>(),
    },
    window: {
      loadURL: vi.fn(async () => undefined),
      isMinimized: () => false,
      show: vi.fn(),
      focus: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      webContents: { on: vi.fn(), setWindowOpenHandler: vi.fn() },
    },
    tray: {
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      setImage: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
    },
  };
});

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: class { constructor() { return mocks.window; } },
  Tray: class { constructor() { return mocks.tray; } },
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
  Notification: { isSupported: () => false },
  nativeImage: { createFromPath: () => mocks.image, createFromBuffer: () => mocks.image },
  session: { defaultSession: { setPermissionRequestHandler: vi.fn() } },
  dialog: {},
  shell: { openExternal: mocks.openExternal },
}));
vi.mock('../runtime.js', () => ({
  startWayfinder: async () => ({ url: 'http://127.0.0.1:4479/', close: mocks.closeRuntime }),
}));
vi.mock('./updaterPolicy.js', () => ({ shouldEnableUpdates: () => true }));
vi.mock('./updater.js', () => ({
  startAutoUpdates: (options: UpdateOptions) => {
    mocks.install.mockImplementation(async () => {
      await options.prepareForRestart?.();
      throw new Error('Installer refused');
    });
    return Object.assign(mocks.stopUpdates, {
      stop: mocks.stopUpdates,
      install: mocks.install,
      check: async () => ({ status: 'ready', currentVersion: '0.2.12' }),
      status: () => ({ status: 'ready', currentVersion: '0.2.12' }),
    });
  },
}));

it('keeps the desktop runtime and tray after installer refusal, then cleans them on Electron quit', async () => {
  await import('./main.js');
  await vi.waitFor(() => expect(mocks.install.getMockImplementation()).toBeDefined());
  const open = mocks.window.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as (details: { url: string }) => { action: string };
  for (const path of ['/proto/octo/repo/prototype%2F1/index.html', '/proto/octo/repo/prototype%2F1/prototype-snapshot.html']) {
    expect(open({ url: 'http://127.0.0.1:4479' + path })).toEqual({ action: 'deny' });
  }
  expect(mocks.openExternal).not.toHaveBeenCalled();
  open({ url: 'https://github.com/octo/repo' });
  expect(mocks.openExternal).toHaveBeenCalledWith('https://github.com/octo/repo');
  await expect(mocks.install()).rejects.toThrow('Installer refused');
  expect(mocks.closeRuntime).not.toHaveBeenCalled();
  expect(mocks.tray.destroy).not.toHaveBeenCalled();
  expect(mocks.app.quit).not.toHaveBeenCalled();

  const beforeQuit = mocks.app.on.mock.calls.find(([event]) => event === 'before-quit')?.[1];
  expect(beforeQuit).toBeDefined();
  const preventDefault = vi.fn();
  beforeQuit?.({ preventDefault });
  await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalledTimes(1));
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(mocks.closeRuntime).toHaveBeenCalledTimes(1);
  expect(mocks.tray.destroy).toHaveBeenCalledTimes(1);
  expect(mocks.stopUpdates).toHaveBeenCalledTimes(1);
});
