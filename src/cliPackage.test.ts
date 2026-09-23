/*
  Smoke test for the CLI as users get it: `npm pack` the repository, install that tarball
  globally into a scratch prefix, and run the installed command against a fake `gh` and a
  fake T3 Code home. Nothing here touches the real GitHub account or T3 Code install.
*/
import { exec, execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { copyFile, link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const runShell = promisify(exec);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS = process.platform === 'win32';
const FAKE_REPO = 'smoke-owner/smoke-repo';

/** Stands in for `gh` when a copy of the node binary runs under that name. */
const FAKE_GH = `
const { appendFileSync } = require('node:fs');
const { basename } = require('node:path');
if (/^gh(\\.exe)?$/i.test(basename(process.execPath))) {
  // Node resolved the first argument as a script path, so take its last segment back.
  const args = [basename(process.argv[1] ?? ''), ...process.argv.slice(2)];
  appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
  const command = args.slice(0, 2).join(' ');
  const write = (body) => process.stdout.write(process.env.FAKE_GH_COLOR
    ? String.fromCharCode(27) + '[1;37m' + body + String.fromCharCode(27) + '[0m'
    : body);
  if (command === 'auth status') {
    write(JSON.stringify({ hosts: { 'github.com': [{ login: 'smoke-user', active: true, scopes: 'repo, read:org' }] } }));
    process.exit(0);
  }
  if (command === 'repo view' && process.env.FAKE_GH_REPO) {
    write(process.env.FAKE_GH_REPO + '\\n');
    process.exit(0);
  }
  if (command === 'api user' && args.includes('--jq')) {
    write('https://avatars.githubusercontent.com/u/1\\n');
    process.exit(0);
  }
  if (command === 'api --paginate' && args.includes('user/orgs')) {
    write('');
    process.exit(0);
  }
  if (command === 'api -i' && args.includes('search/issues')) {
    write('HTTP/2 200\\r\\n\\r\\n' + JSON.stringify({ items: [] }));
    process.exit(0);
  }
  if (command === 'issue list') {
    write('[]');
    process.exit(0);
  }
  process.stderr.write('fake gh: no answer for ' + args.join(' ') + '\\n');
  process.exit(1);
}
`;

interface PackResult {
  filename: string;
  version: string;
  files: { path: string }[];
}

let work: string;
let pack: PackResult;
let installed: string;
let shim: string;
let baseEnv: NodeJS.ProcessEnv;
let ghLog: string;
let emptyDir: string;
const children: ChildProcess[] = [];

/** npm and the installed shim are .cmd files on Windows, which only run through a shell. */
function command(file: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<{ stdout: string; stderr: string }> {
  const settings = { ...options, maxBuffer: 16 * 1024 * 1024, windowsHide: true };
  if (!WINDOWS) return run(file, args, settings);
  // A quoted command name throws off the %~dp0 that npm's .cmd shims resolve themselves by.
  const quote = (part: string): string => (/[\s"]/.test(part) ? `"${part}"` : part);
  return runShell([file, ...args].map(quote).join(' '), settings);
}

async function npm(args: string[], cwd: string): Promise<string> {
  return (await command('npm', args, { cwd })).stdout;
}

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'wayfinder-cli-smoke-'));

  const packOutput = await npm(['pack', '--json', '--pack-destination', work], ROOT);
  const parsed = JSON.parse(packOutput.slice(packOutput.indexOf('['))) as PackResult[];
  pack = parsed[0] as PackResult;

  const prefix = join(work, 'prefix');
  await npm(['install', '--global', '--prefix', prefix, '--offline', '--no-audit', '--no-fund', join(work, pack.filename)], work);
  installed = join(prefix, WINDOWS ? '' : 'lib', 'node_modules', 'wayfinder-map');
  shim = WINDOWS ? join(prefix, 'wayfinder-map.cmd') : join(prefix, 'bin', 'wayfinder-map');

  const fakeBin = join(work, 'fake-bin');
  await mkdir(fakeBin);
  const fakeGh = join(fakeBin, WINDOWS ? 'gh.exe' : 'gh');
  await link(process.execPath, fakeGh).catch(() => copyFile(process.execPath, fakeGh));
  const preload = join(work, 'fake-gh.cjs');
  await writeFile(preload, FAKE_GH);

  const home = join(work, 'home');
  emptyDir = join(work, 'empty');
  await mkdir(home);
  await mkdir(emptyDir);
  ghLog = join(work, 'gh.log');
  await writeFile(ghLog, '');

  baseEnv = {
    // Only the fake gh and node itself: no real gh, git or T3 Code is reachable.
    PATH: [fakeBin, dirname(process.execPath)].join(delimiter),
    HOME: home,
    USERPROFILE: home,
    T3CODE_HOME: join(work, 't3'),
    // NODE_OPTIONS treats a backslash as an escape, and Windows accepts forward slashes.
    NODE_OPTIONS: `--require "${preload.replaceAll('\\', '/')}"`,
    FAKE_GH_LOG: ghLog,
    ...(WINDOWS ? { SystemRoot: process.env['SystemRoot'], TEMP: tmpdir(), TMP: tmpdir() } : {}),
  };
}, 240_000);

afterAll(async () => {
  for (const child of children) child.kill();
  if (work !== undefined) await rm(work, { recursive: true, force: true, maxRetries: 5 });
});

interface Started {
  child: ChildProcess;
  url: string;
  output: () => string;
  exited: Promise<number | null>;
}

/** Runs the installed package's bin with a free port and waits for its banner. */
function startCli(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Started> {
  const child = spawn(process.execPath, [join(installed, 'dist', 'cli.js'), '--no-open', '--port', '0', ...args], {
    cwd: emptyDir,
    env: { ...baseEnv, ...env },
    windowsHide: true,
  });
  children.push(child);
  let output = '';
  const exited = new Promise<number | null>((resolveExit) => child.once('exit', (code) => resolveExit(code)));
  return new Promise((resolveStart, rejectStart) => {
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = /serving\s+(\S+)\n[\s\S]*threads/.exec(output);
      if (match?.[1] !== undefined) resolveStart({ child, url: match[1], output: () => output, exited });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    void exited.then((code) => rejectStart(new Error(`CLI exited with ${String(code)} before serving:\n${output}`)));
  });
}

/** Runs the installed command to completion. */
async function runShim(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await command(shim, args, { env: baseEnv, cwd: emptyDir });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
  }
}

async function stop(started: Started): Promise<void> {
  const response = await fetch(`${new URL(started.url).origin}/api/shutdown`, { method: 'POST' });
  expect(response.status).toBe(200);
  expect(await started.exited).toBe(0);
  await expect(fetch(started.url)).rejects.toThrow();
}

describe('the packaged CLI', () => {
  it('ships the command and its web assets, and a command that never loads the desktop shell', async () => {
    const paths = pack.files.map((file) => file.path);
    for (const file of ['dist/cli.js', 'package.json', 'README.md']) expect(paths).toContain(file);
    for (const file of ['index.html', 'home.html', 'styles.css', 'app.js', 'home.js', 'theme.js']) {
      expect(paths).toContain(`dist/ui/${file}`);
    }
    // npm always packs `main`, which Electron needs; the command itself never loads it.
    expect(paths.filter((path) => path.includes('desktop'))).toEqual(['dist/desktop.cjs']);

    const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest['dependencies']).toBeUndefined();
    const cli = await readFile(join(installed, 'dist', 'cli.js'), 'utf8');
    expect(cli).not.toMatch(/["']electron["']|desktop\.cjs|desktop\/main/);
  });

  it('reports the root package version and its usage through the installed command', async () => {
    const version = await runShim(['--version']);
    expect(version).toMatchObject({ code: 0, stdout: `${pack.version}\n` });
    const help = await runShim(['--help']);
    expect(help.code).toBe(0);
    for (const flag of ['--repo', '--cwd', '--port', '--prompt', '--no-open', '--help']) expect(help.stdout).toContain(flag);
  }, 60_000);

  it('opens Home outside a checkout, serves every page asset and stops on request', async () => {
    const started = await startCli([]);
    expect(started.output()).toContain(`wayfinder-map ${pack.version}  Home`);
    expect(started.output()).toMatch(/T3 Code\s+not detected/);

    const page = await fetch(started.url);
    expect(page.status).toBe(200);
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)="\/?([^"#?:]+\.(?:js|css))"/g)].map((match) => match[1]);
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) expect((await fetch(new URL(`/${asset ?? ''}`, started.url))).status).toBe(200);

    const account = (await (await fetch(new URL('/api/auth/status', started.url))).json()) as { login: string };
    expect(account.login).toBe('smoke-user');
    expect(await readFile(ghLog, 'utf8')).toContain('["auth","status","--json","hosts"]');

    await stop(started);
  }, 60_000);

  it('opens the checkout repository and reports the T3 Code server it finds', async () => {
    const t3State = join(work, 't3', 'userdata');
    await mkdir(t3State, { recursive: true });
    await writeFile(join(t3State, 'server-runtime.json'), JSON.stringify({ origin: 'http://127.0.0.1:9', pid: 1 }));
    try {
      const started = await startCli(['--cwd', emptyDir], { FAKE_GH_REPO: FAKE_REPO });
      expect(started.output()).toContain(`wayfinder-map ${pack.version}  ${FAKE_REPO}`);
      expect(started.output()).toMatch(/T3 Code\s+http:\/\/127\.0\.0\.1:9/);
      expect(started.url.endsWith(`/repos/${FAKE_REPO}`)).toBe(true);
      expect((await fetch(started.url)).status).toBe(200);

      if (WINDOWS) {
        await stop(started);
      } else {
        started.child.kill('SIGINT');
        expect(await started.exited).toBe(0);
      }
    } finally {
      await rm(join(work, 't3'), { recursive: true, force: true });
    }
  }, 60_000);

  it('loads Home and a repository when GitHub CLI decorates JSON with terminal colors', async () => {
    const started = await startCli([], { FAKE_GH_COLOR: '1', GH_FORCE_TTY: '1' });
    try {
      const home = (await fetch(new URL('/api/home', started.url)).then((response) => response.json())) as {
        account: { status: string; login: string | null };
        warning: string | null;
      };
      expect(home.account).toMatchObject({ status: 'ready', login: 'smoke-user' });
      expect(home.warning).toBeNull();

      const response = await fetch(new URL(`/api/repos/${FAKE_REPO}/snapshot`, started.url));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ repo: FAKE_REPO, maps: [] });
    } finally {
      await stop(started);
    }
  }, 60_000);

  it('takes --repo and --prompt, and refuses bad ones before serving', async () => {
    const prompt = join(emptyDir, 'prompt.txt');
    await writeFile(prompt, 'Work on {{ticketTitle}}.');
    const started = await startCli(['--repo', 'other/name', '--prompt', prompt]);
    expect(started.url.endsWith('/repos/other/name')).toBe(true);
    await stop(started);

    await expect(startCli(['--prompt', join(emptyDir, 'missing.txt')])).rejects.toThrow(/Could not read prompt template/);
    await expect(startCli(['--repo', 'not-a-repo'])).rejects.toThrow(/Invalid repository/);
    await expect(startCli(['--port', 'nope'])).rejects.toThrow(/--port needs a port/);
  }, 60_000);
});
