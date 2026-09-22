import { app, BrowserWindow, Menu, Tray, dialog, nativeImage, session, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DEFAULTS } from '../config.js';
import type { Config } from '../config.js';
import { startWayfinder } from '../runtime.js';
import type { WayfinderRuntime } from '../runtime.js';
import { startServer } from '../server.js';
import { AUTO_UPDATE_ENABLED } from '../version.js';
import { DESKTOP_PORT, DesktopLifecycle, isInternalUrl, isSafeExternalUrl, startOnStablePort } from './lifecycle.js';
import { startAutoUpdates } from './updater.js';
import type { DesktopUpdaterHandle } from './updater.js';
import { shouldEnableUpdates } from './updaterPolicy.js';

const TRAY_ICON = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFSSURBVDhPjVOhbsMwEA0sLByyBwf3CYWDlUrGWjhNm29wpNLYQD9gcKrUfygKCRkcqTQYKaSJXTUqqKYq4E3npGnsNOpOeoriu/fe2T4HQUdIyvuSzMDiMbvy850hKZsIZWJJBk0IMmupsle/vg52FGSWPtGHIPMlaX3t84P/kGsRZb7lOO7VZKnSB7/oEgRt3k/uSudlYou5BpJwa4tGYQHoPUacWxwAHDB1hPJ+wPtpKk9XAFa7WgwoMJ9VYnbd6WQQSEqHziI7setsjwQFEg1Ei1KYv66AfrHX5ixWxHl4sI7snIR7RFUnTi1fq6Ts1lU9tl452r3jdBYO0uHxCn+bCXsOteMOEf+29496QgVtPlrJC+C5Oc3BOO4J0j9+URfsWPvvg8/CJs4QHDLPzHN255CPYd+DMp8+qeG8bDmfi3K47Hy8WSh9L5/MjV/H8QcYxvxKVQ6UNgAAAABJRU5ErkJggg==';

const lifecycle = new DesktopLifecycle();
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let runtime: WayfinderRuntime | null = null;
let runtimeOrigin: string | null = null;
let startupPromise: Promise<void> | null = null;
let stopUpdates = (): void => undefined;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function statePage(title: string, message: string, action = ''): string {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHtml(title)}</title><style>:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#0d1117;color:#e6edf3}body{margin:0;min-height:100vh;display:grid;place-items:center}.card{width:min(620px,calc(100% - 48px));padding:42px;border:1px solid #30363d;border-radius:16px;background:#10151c}p{color:#8b949e;line-height:1.6}a{display:inline-block;margin-top:12px;padding:10px 14px;border-radius:8px;background:#f0f6fc;color:#0d1117;text-decoration:none;font-weight:700}code{color:#79c0ff}</style></head><body><main class="card"><p>WAYFINDER</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${action}</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function showWindow(): void {
  if (mainWindow === null) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function navigate(path: '/' | '/new-map'): void {
  if (mainWindow === null || runtimeOrigin === null) return;
  void mainWindow.loadURL(new URL(path, runtimeOrigin).toString());
  showWindow();
}

async function quitApplication(): Promise<void> {
  stopUpdates();
  await lifecycle.quit(async () => {
    await runtime?.close();
    runtime = null;
    runtimeOrigin = null;
  });
  tray?.destroy();
  tray = null;
  app.quit();
}

async function confirmQuit(): Promise<void> {
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    title: 'Quit Wayfinder',
    message: 'Stop Wayfinder completely?',
    detail: 'This stops the local server and revokes the T3 Code session.',
    buttons: ['Quit Wayfinder', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  };
  const answer = mainWindow === null ? await dialog.showMessageBox(options) : await dialog.showMessageBox(mainWindow, options);
  if (answer.response === 0) await quitApplication();
}

function installNavigationBoundary(window: BrowserWindow): void {
  window.webContents.on('will-navigate', (event, target) => {
    if (target === 'wayfinder:retry') {
      event.preventDefault();
      void startRuntime();
      return;
    }
    if (isInternalUrl(target, runtimeOrigin)) return;
    event.preventDefault();
    if (isSafeExternalUrl(target)) void shell.openExternal(target);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#0d1117',
    title: 'Wayfinder',
    icon: applicationIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      navigateOnDragDrop: false,
    },
  });
  installNavigationBoundary(window);
  window.on('close', (event) => {
    if (!lifecycle.shouldHideOnWindowClose()) return;
    event.preventDefault();
    window.hide();
  });
  window.once('ready-to-show', showWindow);
  return window;
}

function applicationIcon(): Electron.NativeImage {
  if (app.isPackaged) {
    const packaged = nativeImage.createFromPath(join(process.resourcesPath, 'Wayfinder.ico'));
    if (!packaged.isEmpty()) return packaged;
  }
  return nativeImage.createFromBuffer(Buffer.from(TRAY_ICON, 'base64'));
}

function createTray(): Tray {
  const image = applicationIcon().resize({ width: 16, height: 16 });
  const appTray = new Tray(image, '4cf718aa-6a75-4d10-a817-7299cd31b519');
  appTray.setToolTip('Wayfinder');
  appTray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Wayfinder', click: showWindow },
    { label: 'Home', click: () => navigate('/') },
    { label: 'Start a new map', click: () => navigate('/new-map') },
    { type: 'separator' },
    { label: 'Quit', click: () => void confirmQuit() },
  ]));
  appTray.on('click', showWindow);
  return appTray;
}

/** The native folder picker behind "Choose local clone". Cancelling answers null. */
async function chooseDirectory(): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose a local clone',
    buttonLabel: 'Use this clone',
    properties: ['openDirectory'],
  };
  const picked = mainWindow === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(mainWindow, options);
  return picked.canceled ? null : (picked.filePaths[0] ?? null);
}

async function startRuntime(): Promise<void> {
  if (startupPromise !== null) return startupPromise;
  startupPromise = (async () => {
    if (mainWindow === null) return;
    await mainWindow.loadURL(statePage('Preparing your Home', 'Starting the local server and checking this machine.'));
    showWindow();
    const config: Config = { ...DEFAULTS, repo: null, cwd: process.cwd(), port: DESKTOP_PORT, open: false };
    try {
      let updaterHandle: DesktopUpdaterHandle | null = null;
      runtime = await startWayfinder(
        config,
        {
          startServer: (options) =>
            startOnStablePort((port) =>
              startServer({
                ...options,
                config: { ...options.config, port },
                chooseDirectory,
                updater: {
                  check: async () => (updaterHandle ? updaterHandle.check() : { status: 'disabled', currentVersion: app.getVersion() }),
                  install: async () => {
                    if (updaterHandle) await updaterHandle.install();
                  },
                  status: () => (updaterHandle ? updaterHandle.status() : { status: 'disabled', currentVersion: app.getVersion() }),
                },
                onShutdown: () => void quitApplication(),
              }),
            ),
        },
        { resolveCurrentRepository: false, uiDir: join(app.getAppPath(), 'dist', 'ui') },
      );
      runtimeOrigin = new URL(runtime.url).origin;
      await mainWindow.loadURL(runtime.url);
      await completeSmokeTest(runtime.url);
      updaterHandle = startAutoUpdates({
        window: mainWindow,
        enabled: shouldEnableUpdates(app.isPackaged, app.getVersion(), AUTO_UPDATE_ENABLED),
        prepareForRestart: async () => {
          updaterHandle?.stop();
          await lifecycle.quit(async () => runtime?.close());
          tray?.destroy();
          tray = null;
        },
      });
      stopUpdates = () => updaterHandle?.stop();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await runtime?.close().catch(() => undefined);
      runtime = null;
      runtimeOrigin = null;
      await mainWindow.loadURL(statePage('Wayfinder did not start', `${detail} Nothing was left running.`, '<a href="wayfinder:retry">Retry startup</a>'));
    }
  })().finally(() => {
    startupPromise = null;
  });
  return startupPromise;
}

/**
 * The Windows package smoke test opts in through an environment variable. Keeping the
 * hook here means it exercises the real packaged Electron entry point, runtime, server,
 * and Home route without changing ordinary launches.
 */
async function completeSmokeTest(homeUrl: string): Promise<void> {
  const markerPath = process.env.WAYFINDER_SMOKE_FILE;
  if (markerPath === undefined || runtime === null) return;

  let homeStatus = 0;
  try {
    homeStatus = (await fetch(new URL('/api/home', homeUrl))).status;
  } catch {
    homeStatus = 0;
  }
  const port = Number(new URL(homeUrl).port);
  await writeFile(
    markerPath,
    JSON.stringify({ route: new URL(homeUrl).pathname || '/', homeStatus, port, version: app.getVersion() }),
    'utf8',
  );
  setTimeout(() => void quitApplication(), 100);
}

app.setAppUserModelId('com.rabdelrhman.wayfinder');
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) {
  // The running copy raises its window on 'second-instance'. Say so, or this looks like a crash.
  process.stderr.write('Wayfinder is already running. Raising the window that is already open.\n');
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', (event) => {
    if (lifecycle.isQuitting) return;
    event.preventDefault();
    void quitApplication();
  });
  app.on('window-all-closed', () => undefined);
  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    mainWindow = createWindow();
    tray = createTray();
    await startRuntime();
  });
}
