import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  quitAndInstall: vi.fn(),
  showMessageBox: vi.fn(),
  openExternal: vi.fn(),
}));

class MockUpdater extends EventEmitter {
  currentVersion = { version: '1.2.3' };
  allowDowngrade = false;
  allowPrerelease = true;
  autoDownload = false;
  autoInstallOnAppQuit = true;
  logger: unknown = console;
  private channelValue = '';
  get channel(): string {
    return this.channelValue;
  }
  set channel(value: string) {
    this.channelValue = value;
    this.allowDowngrade = true;
  }
  checkForUpdates = mocks.checkForUpdates;
  quitAndInstall = mocks.quitAndInstall;
}

let updater: MockUpdater;
let actualUpdater: unknown;
vi.mock('electron-updater', () => ({
  default: {
    get autoUpdater() {
      return actualUpdater ?? updater;
    },
  },
}));
vi.mock('electron', () => ({
  dialog: { showMessageBox: mocks.showMessageBox },
  shell: { openExternal: mocks.openExternal },
}));

import { startAutoUpdates } from './updater.js';
import { DEFAULTS } from '../config.js';
import { DEFAULT_TEMPLATE, startServer } from '../server.js';
import { bindUpdater } from '../ui/chrome.js';

describe('enabled desktop updates', () => {
  let destroyed: boolean;
  let prepareForRestart: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    destroyed = false;
    actualUpdater = undefined;
    updater = new MockUpdater();
    mocks.checkForUpdates.mockReset().mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.2.3' },
    });
    mocks.showMessageBox.mockReset().mockResolvedValue({ response: 1 });
    prepareForRestart = vi.fn(async () => undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function start() {
    return startAutoUpdates({
      window: { isDestroyed: () => destroyed } as never,
      enabled: true,
      prepareForRestart,
    });
  }

  it('disables console logging and downgrades after selecting the architecture channel', async () => {
    const handle = start();
    await handle.check();
    expect(updater.channel).toBe(`latest-${process.arch === 'arm64' ? 'arm64' : 'x64'}`);
    expect(updater.logger).toBeNull();
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    handle.stop();
  });

  it('keeps real NSIS checks and error events safe when the launcher console pipe is closed', async () => {
    const { NsisUpdater } = await vi.importActual<typeof import('electron-updater')>('electron-updater');
    const realUpdater = new NsisUpdater(null, {
      version: '1.2.3',
      name: 'Wayfinder',
      isPackaged: false,
      appUpdateConfigPath: '',
      userDataPath: '',
      baseCachePath: '',
      whenReady: async () => undefined,
      relaunch: () => undefined,
      quit: () => undefined,
      onQuit: () => undefined,
    });
    actualUpdater = realUpdater;
    const closedPipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    const info = vi.spyOn(console, 'info').mockImplementation(() => { throw closedPipe; });
    const error = vi.spyOn(console, 'error').mockImplementation(() => { throw closedPipe; });
    let handle: ReturnType<typeof start> | undefined;
    try {
      handle = start();
      await expect(handle.check()).resolves.toMatchObject({ status: 'up-to-date' });
      expect(() => realUpdater.emit('error', new Error('Update connection failed'))).not.toThrow();
      expect(handle.status()).toMatchObject({ status: 'error', error: 'Update connection failed' });
      expect(info).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      handle?.stop();
      info.mockRestore();
      error.mockRestore();
    }
  });

  it.each(['1.2.2', '1.2.4'])('honors unavailable older or staged release %s', async (version) => {
    mocks.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version },
    });
    const handle = start();
    await expect(handle.check()).resolves.toMatchObject({
      status: 'up-to-date',
      latestVersion: version,
    });
    handle.stop();
  });

  it('offers a newer version only when the updater accepts it', async () => {
    mocks.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '1.2.4' },
    });
    const handle = start();
    await expect(handle.check()).resolves.toMatchObject({
      status: 'available',
      latestVersion: '1.2.4',
    });
    handle.stop();
  });

  it('rejects installation before a download is ready without tearing down the runtime', async () => {
    const handle = start();
    await handle.check();
    await expect(handle.install()).rejects.toThrow('No update is ready');
    expect(prepareForRestart).not.toHaveBeenCalled();
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
    handle.stop();
  });

  it('clears stale readiness when real NSIS has lost its cached installer', async () => {
    const { NsisUpdater } = await vi.importActual<typeof import('electron-updater')>('electron-updater');
    const realUpdater = new NsisUpdater(null, {
      version: '1.2.3',
      name: 'Wayfinder',
      isPackaged: false,
      appUpdateConfigPath: '',
      userDataPath: '',
      baseCachePath: '',
      whenReady: async () => undefined,
      relaunch: () => undefined,
      quit: () => undefined,
      onQuit: () => undefined,
    });
    actualUpdater = realUpdater;
    const handle = start();
    try {
      await handle.check();
      // Simulate readiness becoming stale: the library has no installer in its download cache.
      realUpdater.emit('update-downloaded', {
        version: '1.2.4',
        downloadedFile: '/fixture/Wayfinder.exe',
        files: [{ url: 'Wayfinder.exe', sha512: 'fixture' }],
        path: 'Wayfinder.exe',
        sha512: 'fixture',
        releaseDate: '2026-10-03T00:00:00.000Z',
      });
      await expect(handle.install()).rejects.toThrow('No update filepath provided');
      expect(handle.status()).toMatchObject({ status: 'error' });
      expect(realUpdater.listenerCount('error')).toBe(2);
      await expect(handle.install()).rejects.toThrow('No update is ready');
      expect(prepareForRestart).toHaveBeenCalledTimes(1);
      expect(realUpdater.listenerCount('update-downloaded')).toBe(1);
    } finally {
      handle.stop();
    }
  });

  it('preserves downloaded readiness across another check and installs once', async () => {
    const handle = start();
    await handle.check();
    updater.emit('update-downloaded', { version: '1.2.4' });
    mocks.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-available', { version: '1.2.4' });
      return { isUpdateAvailable: true, updateInfo: { version: '1.2.4' } };
    });
    await expect(handle.check()).resolves.toMatchObject({
      status: 'ready',
      latestVersion: '1.2.4',
    });
    await Promise.all([handle.install(), handle.install()]);
    expect(prepareForRestart).toHaveBeenCalledTimes(1);
    expect(mocks.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true);
  });

  it('cancels an active download and removes only its own listeners when stopped', async () => {
    const cancel = vi.fn();
    mocks.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '1.2.4' },
      cancellationToken: { cancel },
    });
    const unrelated = vi.fn();
    updater.on('update-downloaded', unrelated);
    const handle = start();
    await handle.check();
    handle.stop();
    handle.stop();
    updater.emit('update-downloaded', { version: '1.2.4' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(unrelated).toHaveBeenCalledTimes(1);
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    expect(updater.listenerCount('update-available')).toBe(0);
    expect(updater.listenerCount('update-not-available')).toBe(0);
    expect(updater.listenerCount('error')).toBe(0);
    const before = mocks.checkForUpdates.mock.calls.length;
    await handle.check();
    expect(mocks.checkForUpdates).toHaveBeenCalledTimes(before);
  });

  it('ignores a restart dialog answer after stop or window destruction', async () => {
    let answer: ((value: { response: number }) => void) | undefined;
    mocks.showMessageBox.mockReturnValue(
      new Promise<{ response: number }>((resolve) => {
        answer = resolve;
      }),
    );
    const handle = start();
    await handle.check();
    updater.emit('update-downloaded', { version: '1.2.4' });
    handle.stop();
    destroyed = true;
    answer?.({ response: 0 });
    await Promise.resolve();
    expect(prepareForRestart).not.toHaveBeenCalled();
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
  });

  it('cancels a download discovered by a check that finishes after stop', async () => {
    const cancel = vi.fn();
    let finish:
      | ((value: {
          isUpdateAvailable: boolean;
          updateInfo: { version: string };
          cancellationToken: { cancel: typeof cancel };
        }) => void)
      | undefined;
    mocks.checkForUpdates.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const handle = start();
    const pending = handle.check();
    handle.stop();
    finish?.({
      isUpdateAvailable: true,
      updateInfo: { version: '1.2.4' },
      cancellationToken: { cancel },
    });
    await pending;
    expect(cancel).toHaveBeenCalled();
    expect(handle.status()).toMatchObject({ status: 'up-to-date' });
  });

  it('keeps the original download cancellation token across repeated checks', async () => {
    const originalCancel = vi.fn();
    const laterCancel = vi.fn();
    mocks.checkForUpdates
      .mockResolvedValueOnce({
        isUpdateAvailable: true,
        updateInfo: { version: '1.2.4' },
        cancellationToken: { cancel: originalCancel },
      })
      .mockResolvedValue({
        isUpdateAvailable: true,
        updateInfo: { version: '1.2.4' },
        cancellationToken: { cancel: laterCancel },
      });
    const handle = start();
    await handle.check();
    handle.stop();
    expect(originalCancel).toHaveBeenCalledTimes(1);
    expect(laterCancel).not.toHaveBeenCalled();
  });

  it('consumes a failed preparation initiated by the ready dialog', async () => {
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    prepareForRestart.mockRejectedValue(new Error('Runtime close failed'));
    const handle = start();
    await handle.check();
    updater.emit('update-downloaded', { version: '1.2.4' });
    await vi.waitFor(() =>
      expect(handle.status()).toMatchObject({
        status: 'ready',
        error: 'Runtime close failed',
      }),
    );
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
    handle.stop();
  });

  it('never opens a ready dialog for a destroyed window', async () => {
    const handle = start();
    await handle.check();
    destroyed = true;
    updater.emit('update-downloaded', { version: '1.2.4' });
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    handle.stop();
  });

  it('consumes rejected ready and error dialogs', async () => {
    mocks.showMessageBox.mockRejectedValue(new Error('Window destroyed'));
    const handle = start();
    await handle.check();
    updater.emit('update-downloaded', { version: '1.2.4' });
    updater.emit('error', new Error('Connection failed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(prepareForRestart).not.toHaveBeenCalled();
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
    handle.stop();
  });

  it('reports failed restart preparation and allows a later retry', async () => {
    const handle = start();
    await handle.check();
    updater.emit('update-downloaded', { version: '1.2.4' });
    prepareForRestart.mockRejectedValueOnce(new Error('Could not stop the runtime'));
    await expect(handle.install()).rejects.toThrow('Could not stop the runtime');
    expect(handle.status()).toMatchObject({
      status: 'ready',
      error: 'Could not stop the runtime',
    });
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
    await handle.install();
    expect(mocks.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('keeps the installing phase while an earlier check completes and ignores new checks', async () => {
    const handle = start();
    await handle.check();
    let finishCheck!: () => void;
    const checking = new Promise<void>((resolve) => { finishCheck = resolve; });
    mocks.checkForUpdates.mockImplementationOnce(async () => {
      await checking;
      updater.emit('update-not-available', { version: '1.2.4' });
      return { isUpdateAvailable: false, updateInfo: { version: '1.2.4' } };
    });
    const pendingCheck = handle.check();
    updater.emit('update-downloaded', { version: '1.2.4' });
    let finishPreparation!: () => void;
    prepareForRestart.mockImplementationOnce(() => new Promise<void>((resolve) => { finishPreparation = resolve; }));
    const installing = handle.install();
    expect(handle.status().status).toBe('installing');
    const checks = mocks.checkForUpdates.mock.calls.length;
    await expect(handle.check()).resolves.toMatchObject({ status: 'installing' });
    expect(mocks.checkForUpdates).toHaveBeenCalledTimes(checks);
    finishCheck();
    await pendingCheck;
    expect(handle.status().status).toBe('installing');
    finishPreparation();
    await installing;
  });

  it('keeps download and missing metadata 404 failures visible', async () => {
    const handle = start();
    await handle.check();
    updater.emit('error', new Error('404 installer file not found'));
    expect(handle.status()).toMatchObject({
      status: 'error',
      error: '404 installer file not found',
    });
    mocks.checkForUpdates.mockRejectedValue(new Error('Cannot find latest-x64.yml: 404'));
    await expect(handle.check()).resolves.toMatchObject({ status: 'error' });
    handle.stop();
  });

  it('ignores a stale manual check after installation begins', async () => {
    let releaseCheck!: (response: Response) => void;
    const staleCheck = new Promise<Response>((resolve) => { releaseCheck = resolve; });
    let reads = 0;
    let checks = 0;
    const fetcher = vi.fn(async (input: string) => {
      if (input === '/api/updater/check') {
        checks += 1;
        return checks === 1 ? staleCheck : Response.json({ status: 'ready', currentVersion: '1.2.3', latestVersion: '1.2.4' });
      }
      if (input === '/api/updater/install') return Response.json({ installing: true });
      reads += 1;
      return Response.json({ status: reads === 1 ? 'up-to-date' : 'installing', currentVersion: '1.2.3' });
    });
    let click!: () => void;
    const button = {
      title: '',
      classList: { add: vi.fn(), remove: vi.fn() },
      setAttribute: vi.fn(),
      addEventListener: (_event: string, listener: () => void) => { click = listener; },
    };
    vi.stubGlobal('fetch', fetcher);
    try {
      bindUpdater(button as unknown as HTMLElement, vi.fn());
      await vi.waitFor(() => expect(button.title).toContain('up to date'));
      click();
      click();
      await vi.waitFor(() => expect(button.title).toContain('ready'));
      click();
      await vi.waitFor(() => expect(reads).toBeGreaterThan(1));
      releaseCheck(Response.json({ status: 'up-to-date', currentVersion: '1.2.3' }));
      await vi.advanceTimersByTimeAsync(1);
      expect(button.title).toBe('Installing update...');
      click();
      expect(checks).toBe(2);
      expect(fetcher.mock.calls.filter(([route]) => route === '/api/updater/install')).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(['preparation', 'delayed-preparation', 'installer', 'check', 'not-ready'] as const)(
    'shows %s failures from the UI through HTTP and retries valid downloads',
    async (failure) => {
      vi.useRealTimers();
      const handle = start();
      await handle.check();
      updater.emit('update-downloaded', { version: '1.2.4' });
      const message = `${failure} failed`;
      let releasePreparation: (() => void) | undefined;
      if (failure === 'delayed-preparation') {
        const preparation = new Promise<void>((resolve) => { releasePreparation = resolve; });
        prepareForRestart.mockImplementationOnce(async () => {
          await preparation;
          throw new Error(message);
        });
      }
      if (failure === 'preparation') prepareForRestart.mockRejectedValueOnce(new Error(message));
      if (failure === 'installer') {
        mocks.quitAndInstall.mockImplementationOnce(() => updater.emit('error', new Error(message)));
      }
      if (failure === 'check') mocks.checkForUpdates.mockRejectedValueOnce(new Error(message));
      const running = await startServer({
        config: { ...DEFAULTS, repo: null, cwd: process.cwd(), port: 0, open: false },
        repo: null,
        template: DEFAULT_TEMPLATE,
        workspaceRoot: null,
        t3: {
          detect: async () => ({ origin: 'http://127.0.0.1:3773', pid: null, stateDir: '' }),
          models: async () => ({ providers: [] }),
          projects: async () => [],
          steps: () => ({
            startThread: async () => ({ threadId: 'unused', prompt: '' }),
            openApp: async () => undefined,
            copy: async () => undefined,
          }),
        },
        updater: handle,
      });
      const nativeFetch = globalThis.fetch;
      let statusReads = 0;
      const apiFetch: typeof fetch = (input, init) => {
        if (String(input) === '/api/updater') statusReads += 1;
        return nativeFetch(new URL(String(input), running.url), {
          ...init,
          headers: { origin: running.url, ...init?.headers },
        });
      };
      try {
        if (failure === 'check') {
          const response = await apiFetch('/api/updater/check', { method: 'POST' });
          expect(response.status).toBe(200);
        }
        const classes = new Set<string>();
        let click: (() => void) | undefined;
        const button = {
          title: '',
          classList: {
            add: (...names: string[]) => names.forEach((name) => classes.add(name)),
            remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
          },
          setAttribute: vi.fn(),
          addEventListener: (_event: string, listener: () => void) => { click = listener; },
        };
        vi.stubGlobal('fetch', apiFetch);
        bindUpdater(button as unknown as HTMLElement, vi.fn());
        await vi.waitFor(() => expect(classes.has('is-ready')).toBe(true));
        if (failure === 'not-ready') {
          updater.emit('update-available', { version: '1.2.5' });
          click?.();
          await vi.waitFor(() => expect(button.title).toContain('No update is ready'));
          expect(classes.has('is-error')).toBe(true);
          expect(classes.has('is-downloading')).toBe(false);
          expect(classes.has('is-ready')).toBe(false);
          expect(prepareForRestart).not.toHaveBeenCalled();
          return;
        }
        if (failure !== 'check') {
          click?.();
        }
        if (failure === 'delayed-preparation') {
          // Outlast the previous eight-read cutoff before rejecting preparation.
          await vi.waitFor(() => expect(statusReads).toBeGreaterThan(9), { timeout: 4000 });
          expect(button.title).toBe('Installing update...');
          const checks = mocks.checkForUpdates.mock.calls.length;
          click?.();
          expect(prepareForRestart).toHaveBeenCalledTimes(1);
          expect(mocks.checkForUpdates).toHaveBeenCalledTimes(checks);
          releasePreparation?.();
        }
        await vi.waitFor(() => expect(button.title).toContain(message));
        expect(classes.has('is-ready')).toBe(true);
        expect(classes.has('is-error')).toBe(true);
        expect(classes.has('is-downloading')).toBe(false);
        expect(button.title).toContain('Click to retry');
        const status = await apiFetch('/api/updater');
        await expect(status.json()).resolves.toMatchObject({ status: 'ready', latestVersion: '1.2.4', error: message });
        const attemptsBeforeRetry = mocks.quitAndInstall.mock.calls.length;
        click?.();
        await vi.waitFor(() => expect(mocks.quitAndInstall).toHaveBeenCalledTimes(attemptsBeforeRetry + 1));
        expect(handle.status().status).toBe('installing');
      } finally {
        releasePreparation?.();
        vi.unstubAllGlobals();
        handle.stop();
        await new Promise<void>((resolve) => running.server.close(() => resolve()));
      }
    },
    10_000,
  );

  it('handles truly absent releases without an error', async () => {
    mocks.checkForUpdates.mockRejectedValue(
      Object.assign(new Error('No published versions on GitHub'), {
        code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS',
      }),
    );
    const handle = start();
    await expect(handle.check()).resolves.toMatchObject({
      status: 'up-to-date',
    });
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    handle.stop();
  });

  it('preserves an immediate download error and consumes its rejected promise', async () => {
    mocks.checkForUpdates.mockImplementation(async () => {
      const failure = new Error('Download connection interrupted');
      updater.emit('error', failure);
      return {
        isUpdateAvailable: true,
        updateInfo: { version: '1.2.4' },
        downloadPromise: Promise.reject(failure),
      };
    });
    const handle = start();
    await expect(handle.check()).resolves.toMatchObject({
      status: 'error',
      error: 'Download connection interrupted',
    });
    await Promise.resolve();
    handle.stop();
  });
});
