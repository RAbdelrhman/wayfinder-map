import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import net from 'node:net';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const arch = process.argv[2] ?? 'x64';
if (process.platform !== 'win32') throw new Error('The Windows package smoke test must run on Windows.');
if (arch !== 'x64' && arch !== 'arm64') throw new Error(`Unsupported Windows architecture: ${arch}`);

function existingWayfinderInstall() {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData && existsSync(join(localAppData, 'Programs', 'Wayfinder', 'Wayfinder.exe'))) return true;

  for (const hive of ['HKCU', 'HKLM']) {
    const key = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall`;
    const result = spawnSync('reg.exe', ['query', key, '/s', '/v', 'DisplayName'], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) throw new Error(`Could not inspect ${key}: ${result.stderr}`);
    if (/^\s*DisplayName\s+REG_SZ\s+Wayfinder\s*$/im.test(result.stdout)) return true;
  }
  return false;
}

// NSIS uses one uninstall registration per app ID, even when /D points to a temp folder.
// Installing this smoke copy over a real installation replaces its registration and files.
if (existingWayfinderInstall()) {
  throw new Error('Wayfinder is already installed. Run the installer smoke test on a clean Windows runner or VM.');
}

const releaseDir = join(root, 'release', arch);
const installerNames = (await import('node:fs/promises')).readdir(releaseDir)
  .then((names) => names.filter((name) => name.endsWith('-Setup.exe')).sort());
const installerName = (await installerNames).at(-1);
if (installerName === undefined) throw new Error(`No ${arch} NSIS installer was found in ${releaseDir}.`);

const installer = join(releaseDir, installerName);
const installDir = await mkdtemp(join(tmpdir(), 'wayfinder-smoke-'));
const markerPath = join(installDir, 'smoke-marker.json');

function run(command, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} did not finish within ${String(timeoutMs)}ms.`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${String(code)}`));
    });
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Wayfinder did not quit after the smoke marker was written.')), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function waitForMarker(child, timeoutMs, diagnostics) {
  const exited = new Promise((_, reject) => {
    child.once('exit', (code, signal) => {
      reject(new Error(`Wayfinder exited before reaching Home (code=${String(code)}, signal=${String(signal)}): ${diagnostics()}`));
    });
  });
  const poll = (async () => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return JSON.parse(await readFile(markerPath, 'utf8'));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Wayfinder did not report reaching Home.');
  })();
  return Promise.race([poll, exited]);
}

async function assertPortClosed(port) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error(`Wayfinder left its loopback server listening on port ${String(port)}.`));
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve();
    });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' || error.code === 'EHOSTUNREACH') resolve();
      else reject(error);
    });
  });
}

async function removeTemporaryDirectory(path) {
  await rm(path, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
}

let appProcess;
let installed = false;
try {
  await run(installer, ['/S', '/currentuser', `/D=${installDir}`]);
  installed = true;
  const executable = join(installDir, 'Wayfinder.exe');
  await access(executable);
  await access(join(installDir, 'Uninstall Wayfinder.exe'));
  const appEnvironment = { ...process.env, WAYFINDER_SMOKE_FILE: markerPath };
  // T3 Code sets this for Electron-hosted Node commands; a packaged desktop launch
  // must not inherit it or Electron exits as a Node process without opening the app.
  delete appEnvironment.ELECTRON_RUN_AS_NODE;
  appProcess = spawn(executable, [], {
    cwd: installDir,
    env: appEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const output = [];
  appProcess.stdout.on('data', (chunk) => output.push(chunk.toString()));
  appProcess.stderr.on('data', (chunk) => output.push(chunk.toString()));
  const marker = await waitForMarker(appProcess, 90_000, () => output.join('').trim().slice(-2_000));
  if (marker.route !== '/' || marker.homeStatus !== 200) {
    throw new Error(`Packaged app reached an unexpected Home state: ${JSON.stringify(marker)}`);
  }
  const exit = await waitForExit(appProcess, 30_000);
  if (exit.code !== 0) throw new Error(`Wayfinder exited with code ${String(exit.code)}.`);
  if (!Number.isInteger(marker.port) || marker.port < 1 || marker.port > 65_535) {
    throw new Error(`Smoke marker did not include a valid loopback port: ${JSON.stringify(marker)}`);
  }
  await assertPortClosed(marker.port);
  process.stdout.write(`Windows ${arch} installed smoke passed: Home ${marker.version}, port ${String(marker.port)} closed.\n`);
} catch (error) {
  if (appProcess !== undefined && appProcess.exitCode === null) appProcess.kill();
  throw error;
} finally {
  try {
    if (installed) {
      await run(join(installDir, 'Uninstall Wayfinder.exe'), ['/S', '/currentuser']);
    }
  } finally {
    await removeTemporaryDirectory(installDir);
  }
}
