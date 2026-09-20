import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
  The argument and WAYFINDER_BUILD_ARCH both pick the architecture, and electron-builder's
  config reads the variable. If a runner passes one and not the other they must still agree,
  or the build ships x64 binaries in an arm64 folder.
*/
const fromArgument = process.argv[2];
const fromEnvironment = process.env.WAYFINDER_BUILD_ARCH;
if (fromArgument !== undefined && fromEnvironment !== undefined && fromArgument !== fromEnvironment) {
  throw new Error(`Architecture mismatch: argument ${fromArgument}, WAYFINDER_BUILD_ARCH ${fromEnvironment}.`);
}
const requested = fromArgument ?? fromEnvironment ?? 'x64';
if (requested !== 'x64' && requested !== 'arm64') throw new Error(`Unsupported Windows architecture: ${requested}`);

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${String(code)}`))));
  });
}

await run(process.execPath, ['scripts/create-icons.mjs']);
await run(process.execPath, ['scripts/build.mjs']);
const builder = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.exe' : 'electron-builder');
await run(builder, ['--config', 'electron-builder.config.cjs', '--win', 'nsis', `--${requested}`, '--publish', 'never'], {
  ...process.env,
  WAYFINDER_BUILD_ARCH: requested,
});
