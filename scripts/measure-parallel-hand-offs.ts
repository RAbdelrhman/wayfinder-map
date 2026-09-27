/**
 * Measures what happens when several hand-offs start at once (#123). Results are in
 * docs/design/parallel-hand-offs.md. Bundle and run under Node:
 * `npx esbuild scripts/measure-parallel-hand-offs.ts --bundle --platform=node --format=esm --outfile=$TMP/probe.mjs && node $TMP/probe.mjs <phase>`:
 *
 * - `git`: N concurrent `git worktree add -b` on one scratch clone, as `startThread` runs them.
 * - `store`: N concurrent `HandOffStore.record` calls, in one store and across two.
 * - `t3`: N real `startThread` calls against the running T3 Code, on a fresh scratch clone
 *   (`warm` creates its T3 project first, `hot` connects to T3 Code before the starts),
 *   then waits for every turn to settle and deletes what it made. This spends provider tokens.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { HandOffStore } from '../src/handOffTracking.js';
import { T3HandOff, detectT3 } from '../src/t3.js';
import { T3Api, serverCommand } from '../src/t3Api.js';
import type { ModelChoice } from '../src/models.js';

const run = promisify(execFile);
const SIZES = [2, 4, 8];
const REPO_ROOT = process.cwd();

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, windowsHide: true });
  return stdout.trim();
}

async function scratchClone(label: string): Promise<{ dir: string; root: string }> {
  const dir = await mkdtemp(join(tmpdir(), `wf-par-${label}-`));
  const root = join(dir, 'wayfinder-map');
  await git(dir, ['clone', '--quiet', '--no-hardlinks', REPO_ROOT, root]);
  return { dir, root };
}

/** Same as `freeBranch` in src/t3.ts, which is not exported. */
async function freeBranch(root: string, branch: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const candidate = attempt === 1 ? branch : `${branch}-${String(attempt)}`;
    try {
      await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`]);
    } catch {
      return candidate;
    }
  }
}

function ms(start: number): number {
  return Math.round(performance.now() - start);
}

async function measureGit(trials: number): Promise<void> {
  for (const size of SIZES) {
    for (const shared of [false, true]) {
      const failures: string[] = [];
      const walls: number[] = [];
      for (let trial = 0; trial < trials; trial += 1) {
        const { dir, root } = await scratchClone('git');
        const start = performance.now();
        const results = await Promise.allSettled(
          Array.from({ length: size }, async (_, i) => {
            // `shared` asks every start for the same branch, like new-map hand-offs (`wayfinder/new-map`),
            // and picks a free name first the way `freeBranch` in src/t3.ts does.
            const branch = shared ? await freeBranch(root, 'wayfinder/new-map') : `wayfinder/${String(100 + i)}-ticket`;
            const path = join(dir, 'worktrees', `${branch.replace(/\//g, '-')}-${String(i)}`);
            return git(root, ['worktree', 'add', '-b', branch, path, 'HEAD']);
          }),
        );
        walls.push(ms(start));
        for (const result of results) {
          if (result.status === 'rejected') failures.push(String((result.reason as { stderr?: string }).stderr ?? result.reason).trim().split('\n').at(-1) ?? '');
        }
        await rm(dir, { recursive: true, force: true, maxRetries: 5 });
      }
      walls.sort((a, b) => a - b);
      const distinct = [...new Set(failures)];
      console.log(
        JSON.stringify({ phase: 'git', size, branches: shared ? 'shared' : 'distinct', trials, starts: size * trials, failed: failures.length, medianWallMs: walls[Math.floor(walls.length / 2)], maxWallMs: walls.at(-1), errors: distinct }),
      );
    }
  }
}

async function measureStore(): Promise<void> {
  for (const size of SIZES) {
    const dir = await mkdtemp(join(tmpdir(), 'wf-par-store-'));
    const filePath = join(dir, 'hand-offs.json');
    const input = (i: number) => ({ repo: 'o/r', mapNumber: 1, ticketNumber: i, title: `t${String(i)}`, threadId: `thread-${String(i)}`, rung: 'thread' as const });

    const one = new HandOffStore({ filePath });
    await Promise.all(Array.from({ length: size }, (_, i) => one.record(input(i))));
    const oneStore = (JSON.parse(await readFile(filePath, 'utf8')) as { records: unknown[] }).records.length;

    // Two processes (the CLI and the desktop app) each hold their own store over the same file.
    await rm(filePath, { force: true });
    const a = new HandOffStore({ filePath });
    const b = new HandOffStore({ filePath });
    const twoResults = await Promise.allSettled(Array.from({ length: size }, (_, i) => (i % 2 === 0 ? a : b).record(input(i))));
    const twoErrors = [...new Set(twoResults.flatMap((result) => (result.status === 'rejected' ? [(result.reason as Error).message] : [])))];
    const twoStores = (JSON.parse(await readFile(filePath, 'utf8')) as { records: unknown[] }).records.length;

    console.log(JSON.stringify({ phase: 'store', size, oneStoreSaved: oneStore, twoStoresSaved: twoStores, twoStoresErrors: twoErrors }));
    await rm(dir, { recursive: true, force: true });
  }
}

interface ShellThread {
  id?: string;
  session?: { status?: string; lastError?: string | null } | null;
  latestTurn?: { state?: string } | null;
}

async function measureT3(size: number, warm: boolean, hot: boolean, model: ModelChoice | null): Promise<void> {
  const runtime = await detectT3();
  if (runtime.origin === null || runtime.pid === null) throw new Error('T3 Code is not running');
  const command = await serverCommand(runtime.pid);
  if (command === null) throw new Error('could not find the T3 Code binary');
  const api = new T3Api(runtime.origin, command);
  const { dir, root } = await scratchClone('t3');
  if (warm) {
    // The usual case: T3 Code already has a project for the clone.
    await api.dispatch({ type: 'project.create', commandId: crypto.randomUUID(), projectId: crypto.randomUUID(), title: 'wayfinder-map', workspaceRoot: root, createdAt: new Date().toISOString() });
  }
  // A cold T3HandOff, as right after Wayfinder starts: each start connects on its own.
  const t3 = new T3HandOff();
  const steps = t3.steps(runtime);
  // `hot` connects once first, as a running Wayfinder already has (tracking and the model picker).
  if (hot) await t3.models(runtime);

  const runId = Date.now().toString(36);
  const start = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: size }, async (_, i) => {
      const began = performance.now();
      const result = await steps.startThread({
        title: `wayfinder #123 concurrency probe ${String(i + 1)}/${String(size)}`,
        workspaceRoot: root,
        branch: `wayfinder/probe-${runId}-${String(i + 1)}`,
        model,
        prompt: () => 'This is an automated concurrency probe. Reply with the single word OK. Do not run any tools or read any files.',
      });
      return { ...result, startMs: ms(began) };
    }),
  );
  const wallMs = ms(start);
  const started = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [(result.reason as Error).message.slice(0, 200)] : []));

  // How many T3 projects now point at the one scratch clone.
  const snapshot = await api.snapshot();
  const projects = snapshot.projects.filter((project) => project.deletedAt === null && project.workspaceRoot.toLowerCase() === root.toLowerCase());

  // Wait for every turn to finish, so provider errors (rate limits included) show up.
  const settled = new Map<string, { ms: number; turn: string | null; session: string | null; error: string | null }>();
  const deadline = performance.now() + 5 * 60_000;
  while (settled.size < started.length && performance.now() < deadline) {
    const shell = (await api.shell()) as { threads?: ShellThread[] };
    for (const item of started) {
      if (settled.has(item.threadId)) continue;
      const thread = shell.threads?.find((candidate) => candidate.id === item.threadId);
      const turn = thread?.latestTurn?.state ?? null;
      const session = thread?.session?.status ?? null;
      const error = thread?.session?.lastError ?? null;
      if (error !== null || (turn !== null && turn !== 'running' && turn !== 'pending')) {
        settled.set(item.threadId, { ms: ms(start), turn, session, error });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(
    JSON.stringify({
      phase: 't3',
      size,
      warm,
      hot,
      models: [...new Set(snapshot.threads.filter((thread) => started.some((item) => item.threadId === (thread as { id?: string }).id)).map((thread) => JSON.stringify(thread.modelSelection)))],
      started: started.length,
      failed: errors.length,
      errors,
      wallMs,
      startMs: started.map((item) => item.startMs).sort((a, b) => a - b),
      projectsForClone: projects.length,
      turns: [...settled.values()],
      unsettled: started.length - settled.size,
    }),
  );

  for (const item of started) {
    await api.dispatch({ type: 'thread.delete', commandId: crypto.randomUUID(), threadId: item.threadId }).catch(() => undefined);
  }
  for (const project of projects) {
    await api.dispatch({ type: 'project.delete', commandId: crypto.randomUUID(), projectId: project.id }).catch((error: unknown) => console.log(`project.delete: ${(error as Error).message}`));
  }
  for (const item of started) {
    if (item.tracking?.worktreePath) await rm(item.tracking.worktreePath, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }
  t3.close();
  api.revoke();
  await rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
}

/** `model=<instanceId>/<model>` picks the model; without it T3 Code's default runs. */
function modelArg(): ModelChoice | null {
  const [instanceId, model] = process.argv.find((arg) => arg.startsWith('model='))?.slice('model='.length).split('/') ?? [];
  return instanceId && model ? { instanceId, model } : null;
}

const phase = process.argv[2];
if (phase === 'git') await measureGit(Number(process.argv[3] ?? 5));
else if (phase === 'store') await measureStore();
else if (phase === 't3') await measureT3(Number(process.argv[3] ?? 2), process.argv.includes('warm'), process.argv.includes('hot'), modelArg());
else if (phase === 'cleanup') {
  // Delete any probe threads and scratch-clone projects a crashed run left in T3 Code.
  const runtime = await detectT3();
  const command = runtime.pid === null ? null : await serverCommand(runtime.pid);
  if (runtime.origin === null || command === null) throw new Error('T3 Code is not running');
  const api = new T3Api(runtime.origin, command);
  const snapshot = await api.snapshot();
  const projects = snapshot.projects.filter((project) => project.deletedAt === null && /wf-par-/.test(project.workspaceRoot));
  const threads = snapshot.threads.filter((thread) => thread.deletedAt === null && projects.some((project) => project.id === thread.projectId));
  for (const thread of threads) await api.dispatch({ type: 'thread.delete', commandId: crypto.randomUUID(), threadId: (thread as { id?: string }).id });
  for (const project of projects) await api.dispatch({ type: 'project.delete', commandId: crypto.randomUUID(), projectId: project.id });
  console.log(JSON.stringify({ phase: 'cleanup', threads: threads.length, projects: projects.length }));
  api.revoke();
} else if (phase === 'models') {
  const t3 = new T3HandOff();
  console.log(JSON.stringify(await t3.models(await detectT3())));
  t3.close();
} else console.log('usage: node probe.mjs git [trials] | store | t3 <size> [warm] [hot] [model=<instance>/<model>] | models | cleanup');
