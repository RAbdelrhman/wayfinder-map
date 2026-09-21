import { dialog, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { updateChannel } from './updaterPolicy.js';

const RELEASES_URL = 'https://github.com/RAbdelrhman/wayfinder-map/releases';
const DAILY = 24 * 60 * 60 * 1000;

export interface UpdaterStatus {
  status: 'up-to-date' | 'available' | 'downloading' | 'ready' | 'dev' | 'disabled' | 'error';
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
  prepareForRestart: () => Promise<void>;
}

export function startAutoUpdates({ window, enabled, prepareForRestart }: UpdateOptions): DesktopUpdaterHandle {
  if (!enabled) {
    return Object.assign(() => undefined, {
      stop: () => undefined,
      check: async (): Promise<UpdaterStatus> => ({
        status: 'disabled' as const,
        currentVersion: 'dev',
        releaseUrl: RELEASES_URL,
      }),
      install: async (): Promise<void> => undefined,
      status: (): UpdaterStatus => ({
        status: 'disabled' as const,
        currentVersion: 'dev',
        releaseUrl: RELEASES_URL,
      }),
    });
  }

  /*
    `autoUpdater` is a getter that builds an NsisUpdater the moment it is read, and that
    constructor asks Electron for the running app's version. Reading it at module scope
    therefore kills the main process before it has an app: the window never opens and the
    launch looks like a silent crash. Read it here, past the enabled check, so a dev or
    unsigned build never touches it at all.
  */
  const { autoUpdater } = electronUpdater;

  let errorShown = false;
  let currentStatus: UpdaterStatus = {
    status: 'up-to-date',
    currentVersion: autoUpdater.currentVersion?.version ?? '0.0.0',
    releaseUrl: RELEASES_URL,
  };

  autoUpdater.channel = updateChannel(process.arch);
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    currentStatus = {
      status: 'available',
      currentVersion: autoUpdater.currentVersion?.version ?? '0.0.0',
      latestVersion: info?.version,
      releaseUrl: RELEASES_URL,
    };
  });

  autoUpdater.on('update-not-available', (info) => {
    currentStatus = {
      status: 'up-to-date',
      currentVersion: autoUpdater.currentVersion?.version ?? '0.0.0',
      latestVersion: info?.version,
      releaseUrl: RELEASES_URL,
    };
  });

  autoUpdater.on('update-downloaded', (info) => {
    currentStatus = {
      status: 'ready',
      currentVersion: autoUpdater.currentVersion?.version ?? '0.0.0',
      latestVersion: info?.version,
      releaseUrl: RELEASES_URL,
    };
    void dialog.showMessageBox(window, {
      type: 'info',
      title: 'Wayfinder update ready',
      message: 'A signed Wayfinder update is ready.',
      detail: 'Restart now to install it, or keep working and restart later.',
      buttons: ['Restart and install', 'Later'],
      defaultId: 1,
      cancelId: 1,
    }).then(async ({ response }) => {
      if (response !== 0) return;
      await prepareForRestart();
      autoUpdater.quitAndInstall(false, true);
    });
  });

  autoUpdater.on('error', (error) => {
    const is404 = /404|not found/i.test(error.message);
    if (is404) {
      currentStatus = {
        status: 'up-to-date',
        currentVersion: autoUpdater.currentVersion?.version ?? '0.0.0',
        releaseUrl: RELEASES_URL,
      };
      return;
    }
    currentStatus = {
      status: 'error',
      currentVersion: autoUpdater.currentVersion?.version ?? '0.0.0',
      error: error.message,
      releaseUrl: RELEASES_URL,
    };
    if (errorShown || window.isDestroyed()) return;
    errorShown = true;
    void dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Could not check for updates',
      message: 'Wayfinder is still running normally.',
      detail: error.message,
      buttons: ['Dismiss', 'Open releases'],
      defaultId: 0,
      cancelId: 0,
    }).then(({ response }) => {
      if (response === 1) void shell.openExternal(RELEASES_URL);
    });
  });

  const check = async (): Promise<UpdaterStatus> => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo) {
        const latest = result.updateInfo.version;
        const current = autoUpdater.currentVersion?.version ?? '0.0.0';
        if (latest && current && latest !== current) {
          currentStatus = {
            status: currentStatus.status === 'ready' ? 'ready' : 'available',
            currentVersion: current,
            latestVersion: latest,
            releaseUrl: RELEASES_URL,
          };
        } else {
          currentStatus = {
            status: 'up-to-date',
            currentVersion: current,
            latestVersion: latest,
            releaseUrl: RELEASES_URL,
          };
        }
      }
      return currentStatus;
    } catch (error) {
      const message = (error as Error).message;
      if (/404|not found/i.test(message)) {
        currentStatus = {
          status: 'up-to-date',
          currentVersion: autoUpdater.currentVersion?.version ?? '0.0.0',
          releaseUrl: RELEASES_URL,
        };
        return currentStatus;
      }
      currentStatus = {
        status: 'error',
        currentVersion: autoUpdater.currentVersion?.version ?? '0.0.0',
        error: message,
        releaseUrl: RELEASES_URL,
      };
      return currentStatus;
    }
  };

  const install = async (): Promise<void> => {
    await prepareForRestart();
    autoUpdater.quitAndInstall(false, true);
  };

  void check().catch(() => undefined);
  const timer = setInterval(() => void check().catch(() => undefined), DAILY);

  return Object.assign(() => clearInterval(timer), {
    stop: () => clearInterval(timer),
    check,
    install,
    status: () => currentStatus,
  });
}
