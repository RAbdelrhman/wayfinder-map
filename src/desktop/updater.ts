import { dialog, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';
import { updateChannel } from './updaterPolicy.js';

const RELEASES_URL = 'https://github.com/RAbdelrhman/wayfinder-map/releases';
const DAILY = 24 * 60 * 60 * 1000;

export interface UpdaterStatus {
  status: 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'dev' | 'disabled' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  error?: string;
}

export interface DesktopUpdaterHandle {
  (): void;
  stop: () => void;
  check: () => Promise<UpdaterStatus>;
  install: () => Promise<void>;
  status: () => UpdaterStatus;
}

export interface UpdateOptions {
  window: BrowserWindow;
  enabled: boolean;
  /** Optional reversible preparation. Runtime cleanup belongs to Electron's quit path. */
  prepareForRestart?: () => Promise<void>;
}

export function startAutoUpdates({ window, enabled, prepareForRestart }: UpdateOptions): DesktopUpdaterHandle {
  if (!enabled) {
    return Object.assign(() => undefined, {
      stop: () => undefined,
      check: async (): Promise<UpdaterStatus> => ({
        status: 'disabled',
        currentVersion: 'dev',
        releaseUrl: RELEASES_URL,
      }),
      install: async (): Promise<void> => undefined,
      status: (): UpdaterStatus => ({
        status: 'disabled',
        currentVersion: 'dev',
        releaseUrl: RELEASES_URL,
      }),
    });
  }

  // Reading this getter constructs NsisUpdater, so wait until a packaged app enables updates.
  const { autoUpdater } = electronUpdater;
  // The desktop can outlive its launcher and inherited stdout pipe. Errors still use status/dialogs.
  autoUpdater.logger = null;
  autoUpdater.channel = updateChannel(process.arch);
  // The channel setter enables downgrades unless reset afterward.
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  let stopped = false;
  let errorShown = false;
  let errorRevision = 0;
  let downloadedVersion: string | undefined;
  let cancelDownload: (() => void) | undefined;
  // Startup callbacks can stop the updater before the polling timer is assigned.
  // eslint-disable-next-line prefer-const
  let timer: ReturnType<typeof setInterval> | undefined;
  let installation: Promise<void> | null = null;
  let installing = false;
  const versionStatus = () => ({
    currentVersion: autoUpdater.currentVersion.version,
    releaseUrl: RELEASES_URL,
  });
  let currentStatus: UpdaterStatus = {
    status: 'up-to-date',
    ...versionStatus(),
  };

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    autoUpdater.removeListener('update-available', onAvailable);
    autoUpdater.removeListener('update-not-available', onNotAvailable);
    autoUpdater.removeListener('update-downloaded', onDownloaded);
    autoUpdater.removeListener('error', reportError);
    cancelDownload?.();
    cancelDownload = undefined;
  }

  function setReleaseStatus(available: boolean, latestVersion: string): void {
    currentStatus = {
      status: installing ? 'installing' : downloadedVersion ? 'ready' : available ? 'available' : 'up-to-date',
      ...versionStatus(),
      latestVersion: downloadedVersion ?? latestVersion,
    };
  }

  function onAvailable(info: UpdateInfo): void {
    if (stopped) return;
    if (downloadedVersion && downloadedVersion !== info.version) downloadedVersion = undefined;
    setReleaseStatus(true, info.version);
  }

  function onNotAvailable(info: UpdateInfo): void {
    if (!stopped) setReleaseStatus(false, info.version);
  }

  function reportError(error: unknown): void {
    if (stopped) return;
    cancelDownload = undefined;
    // Missing channel metadata or installer assets are broken updates, not proof of being current.
    if (error instanceof Error && 'code' in error && error.code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS') {
      setReleaseStatus(false, autoUpdater.currentVersion.version);
      return;
    }
    errorRevision += 1;
    const message = error instanceof Error ? error.message : String(error);
    // BaseUpdater uses this uncoded error when its cached installer no longer exists.
    if (message === "No update filepath provided, can't quit and install") downloadedVersion = undefined;
    currentStatus = {
      status: installing ? 'installing' : downloadedVersion ? 'ready' : 'error',
      ...versionStatus(),
      ...(downloadedVersion ? { latestVersion: downloadedVersion } : {}),
      error: message,
    };
    if (errorShown || window.isDestroyed()) return;
    errorShown = true;
    void (async () => {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning',
        title: 'Could not check for updates',
        message: 'Wayfinder is still running normally.',
        detail: message,
        buttons: ['Dismiss', 'Open releases'],
        defaultId: 0,
        cancelId: 0,
      });
      if (!stopped && !window.isDestroyed() && response === 1) await shell.openExternal(RELEASES_URL);
    })().catch(() => undefined);
  }

  function install(): Promise<void> {
    if (installation) return installation;
    if (stopped || window.isDestroyed() || !downloadedVersion) {
      return Promise.reject(new Error('No update is ready to install.'));
    }
    const readyVersion = downloadedVersion;
    installing = true;
    installation = (async () => {
      try {
        setReleaseStatus(true, readyVersion);
        await prepareForRestart?.();
        if (stopped || window.isDestroyed()) return;
        const revision = errorRevision;
        autoUpdater.quitAndInstall(false, true);
        // NSIS reports a refused installer through a synchronous error event, not a return value.
        if (revision !== errorRevision) {
          throw new Error(currentStatus.error ?? 'Could not start the update installer.');
        }
        stop();
      } catch (error) {
        installing = false;
        reportError(error);
        throw error;
      }
    })().finally(() => {
      installing = false;
      installation = null;
    });
    return installation;
  }

  function onDownloaded(info: UpdateInfo): void {
    if (stopped) return;
    cancelDownload = undefined;
    downloadedVersion = info.version;
    setReleaseStatus(true, info.version);
    if (window.isDestroyed()) return;
    void (async () => {
      const { response } = await dialog.showMessageBox(window, {
        type: 'info',
        title: 'Wayfinder update ready',
        message: 'A Wayfinder update is ready.',
        detail: 'Restart now to install it, or keep working and restart later.',
        buttons: ['Restart and install', 'Later'],
        defaultId: 1,
        cancelId: 1,
      });
      if (!stopped && !window.isDestroyed() && response === 0) await install();
    })().catch(() => undefined);
  }

  autoUpdater.on('update-available', onAvailable);
  autoUpdater.on('update-not-available', onNotAvailable);
  autoUpdater.on('update-downloaded', onDownloaded);
  autoUpdater.on('error', reportError);

  const check = async (): Promise<UpdaterStatus> => {
    if (stopped || installing) return currentStatus;
    const revision = errorRevision;
    try {
      const result = await autoUpdater.checkForUpdates();
      // The library emits download errors and rejects this separate background promise.
      void result?.downloadPromise?.catch(() => undefined);
      if (stopped) {
        result?.cancellationToken?.cancel();
        return currentStatus;
      }
      if (result?.cancellationToken && !downloadedVersion && !cancelDownload) {
        cancelDownload = () => result.cancellationToken?.cancel();
      }
      // A fast download can emit an error before the check itself resolves.
      if (result?.updateInfo && revision === errorRevision) {
        setReleaseStatus(result.isUpdateAvailable, result.updateInfo.version);
      }
    } catch (error) {
      reportError(error);
    }
    return currentStatus;
  };

  void check();
  timer = setInterval(() => void check(), DAILY);
  return Object.assign(stop, {
    stop,
    check,
    install,
    status: () => currentStatus,
  });
}
