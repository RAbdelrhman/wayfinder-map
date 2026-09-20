import { dialog, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { updateChannel } from './updaterPolicy.js';

const RELEASES_URL = 'https://github.com/RAbdelrhman/wayfinder-map/releases';
const DAILY = 24 * 60 * 60 * 1000;

export interface UpdateOptions {
  window: BrowserWindow;
  enabled: boolean;
  prepareForRestart: () => Promise<void>;
}

export function startAutoUpdates({ window, enabled, prepareForRestart }: UpdateOptions): () => void {
  if (!enabled) return () => undefined;

  /*
    `autoUpdater` is a getter that builds an NsisUpdater the moment it is read, and that
    constructor asks Electron for the running app's version. Reading it at module scope
    therefore kills the main process before it has an app: the window never opens and the
    launch looks like a silent crash. Read it here, past the enabled check, so a dev or
    unsigned build never touches it at all.
  */
  const { autoUpdater } = electronUpdater;

  let errorShown = false;
  autoUpdater.channel = updateChannel(process.arch);
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-downloaded', () => {
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

  const check = (): void => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  };
  check();
  const timer = setInterval(check, DAILY);
  return () => clearInterval(timer);
}
