import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const image = { resize: vi.fn(), isEmpty: () => false };
  image.resize.mockReturnValue(image);
  return {
    image,
    start: vi.fn(async () => ({ url: 'http://127.0.0.1:4479/', close: async () => undefined })),
    app: {
      isPackaged: true, setAppUserModelId: vi.fn(), setAsDefaultProtocolClient: vi.fn(),
      requestSingleInstanceLock: () => true, whenReady: async () => undefined,
      getVersion: () => '0.2.23', getAppPath: () => process.cwd(), quit: vi.fn(), on: vi.fn(),
    },
    window: {
      loadURL: vi.fn(async () => undefined), isMinimized: () => false,
      show: vi.fn(), focus: vi.fn(), on: vi.fn(), once: vi.fn(),
      webContents: { on: vi.fn(), setWindowOpenHandler: vi.fn() },
    },
  };
});
vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: class { constructor() { return mocks.window; } },
  Tray: class { setToolTip() {} setContextMenu() {} setImage() {} on() {} },
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
  Notification: { isSupported: () => false },
  nativeImage: { createFromPath: () => mocks.image, createFromBuffer: () => mocks.image },
  session: { defaultSession: { setPermissionRequestHandler: vi.fn() } },
  dialog: {}, shell: { openExternal: vi.fn() },
}));
vi.mock('../runtime.js', () => ({ startWayfinder: mocks.start }));
vi.mock('./updaterPolicy.js', () => ({ shouldEnableUpdates: () => false }));
vi.mock('./updater.js', () => ({ startAutoUpdates: () => ({ stop: vi.fn() }) }));

const originalArgv = [...process.argv];
const resourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.app.isPackaged = true;
  Object.defineProperty(process, 'resourcesPath', { value: process.cwd(), configurable: true });
  mocks.start.mockReset().mockResolvedValue({ url: 'http://127.0.0.1:4479/', close: async () => undefined });
});
afterEach(() => {
  process.argv = [...originalArgv];
  if (resourcesPath) Object.defineProperty(process, 'resourcesPath', resourcesPath);
  else Reflect.deleteProperty(process, 'resourcesPath');
});

function event(name: string): (...args: unknown[]) => void {
  const listener = mocks.app.on.mock.calls.find(([type]) => type === name)?.[1] as ((...args: unknown[]) => void) | undefined;
  expect(listener).toBeDefined();
  return listener!;
}

it('registers the installed handler and opens an exact map from a cold launch', async () => {
  process.argv = [...originalArgv, 'wayfinder://map?repo=o%2Fr&number=217'];
  await import('./main.js');
  await vi.waitFor(() => expect(mocks.window.loadURL).toHaveBeenLastCalledWith('http://127.0.0.1:4479/repos/o/r/maps/217'));
  expect(mocks.app.setAsDefaultProtocolClient).toHaveBeenCalledWith('wayfinder');
});

it('handles a second Windows instance and a macOS URL in the running window', async () => {
  await import('./main.js');
  await vi.waitFor(() => expect(mocks.window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:4479/'));
  event('second-instance')({}, ['Wayfinder.exe', 'wayfinder://map?repo=o%2Fr&number=35']);
  await vi.waitFor(() => expect(mocks.window.loadURL).toHaveBeenLastCalledWith('http://127.0.0.1:4479/repos/o/r/maps/35'));
  const preventDefault = vi.fn();
  event('open-url')({ preventDefault }, 'wayfinder://map?repo=another%2Frepo&number=42');
  await vi.waitFor(() => expect(mocks.window.loadURL).toHaveBeenLastCalledWith('http://127.0.0.1:4479/repos/another/repo/maps/42'));
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(mocks.window.focus).toHaveBeenCalled();
});

it('keeps a URL received while the server is starting, without a Home navigation overwriting it', async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  mocks.start.mockImplementationOnce(async () => {
    await gate;
    return { url: 'http://127.0.0.1:4480/', close: async () => undefined };
  });
  await import('./main.js');
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalled());
  event('second-instance')({}, ['wayfinder://map?repo=o%2Fr&number=5']);
  event('second-instance')({}, ['wayfinder://map?repo=o%2Fr&number=6']);
  finish();
  await vi.waitFor(() => expect(mocks.window.loadURL).toHaveBeenLastCalledWith('http://127.0.0.1:4480/repos/o/r/maps/6'));
});

it('ignores invalid OS arguments and keeps development checkouts from stealing the handler', async () => {
  mocks.app.isPackaged = false;
  await import('./main.js');
  await vi.waitFor(() => expect(mocks.window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:4479/'));
  const count = mocks.window.loadURL.mock.calls.length;
  event('second-instance')({}, ['file:///C:/Windows/calc.exe', 'wayfinder://map?repo=o%2Fr&number=0']);
  expect(mocks.window.loadURL).toHaveBeenCalledTimes(count);
  expect(mocks.app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
});
