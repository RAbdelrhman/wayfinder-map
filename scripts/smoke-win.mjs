import { access, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import net from 'node:net';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const arch = process.argv[2] ?? 'x64';
if (process.platform !== 'win32') throw new Error('The Windows package smoke test must run on Windows.');
if (arch !== 'x64' && arch !== 'arm64') throw new Error(`Unsupported Windows architecture: ${arch}`);

const releaseDir = join(root, 'release', arch);
const installerNames = (await import('node:fs/promises')).readdir(releaseDir)
  .then((names) => names.filter((name) => name.endsWith('-Setup.exe')).sort());
const installerName = (await installerNames).at(-1);
if (installerName === undefined) throw new Error(`No ${arch} NSIS installer was found in ${releaseDir}.`);

const installer = join(releaseDir, installerName);
const installDir = join(tmpdir(), `wayfinder-smoke-${process.pid}`);
const markerPath = join(tmpdir(), `wayfinder-smoke-${process.pid}.json`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${String(code)}`))));
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

async function waitForMarker(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return JSON.parse(await readFile(markerPath, 'utf8'));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Wayfinder did not report reaching Home.');
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

let appProcess;
try {
  await rm(installDir, { recursive: true, force: true });
  await rm(markerPath, { force: true });
  await run(installer, ['/S', `/D=${installDir}`]);
  const executable = join(installDir, 'Wayfinder.exe');
  await access(executable);
  appProcess = spawn(executable, [], {
    cwd: installDir,
    env: { ...process.env, WAYFINDER_SMOKE_FILE: markerPath },
    stdio: 'ignore',
    windowsHide: true,
  });
  const marker = await waitForMarker(90_000);
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
  await rm(installDir, { recursive: true, force: true });
  await rm(markerPath, { force: true });
}
