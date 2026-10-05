import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { T3HandOff } from './t3.js';
import type { HandOffInput, T3Runtime } from './t3.js';

const state = vi.hoisted(() => ({
  projects: [] as Array<{ id: string; workspaceRoot: string; defaultModelSelection: unknown; deletedAt: string | null }>,
  threads: [] as Array<{
    projectId: string;
    modelSelection: unknown;
    runtimeMode: string;
    interactionMode: string;
    createdAt: string;
    deletedAt: string | null;
  }>,
  projectCreates: 0,
  turnStarts: 0,
  threadCreates: 0,
  activeThreadCreates: 0,
  maxConcurrentThreadCreates: 0,
  threadCreateTarget: 1,
  threadCreateBarrier: Promise.resolve(),
  releaseThreadCreateBarrier: (): void => undefined,
  reset(threadCreateTarget: number): void {
    this.projects = [];
    this.threads = [];
    this.projectCreates = 0;
    this.turnStarts = 0;
    this.threadCreates = 0;
    this.activeThreadCreates = 0;
    this.maxConcurrentThreadCreates = 0;
    this.threadCreateTarget = threadCreateTarget;
    this.threadCreateBarrier = new Promise<void>((resolveBarrier) => {
      this.releaseThreadCreateBarrier = resolveBarrier;
    });
  },
}));

vi.mock('./t3Api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./t3Api.js')>();

  class MockT3Api {
    async snapshot() {
      return { projects: thisProjects(), threads: thisThreads() };
    }

    async rpc() {
      return { providers: [], settings: { defaultModelSelection: { model: 'test-model' } } };
    }

    async dispatch(command: Record<string, unknown>): Promise<unknown> {
      if (command['type'] === 'project.create') {
        const workspaceRoot = String(command['workspaceRoot']);
        if (state.projects.some((project) => project.workspaceRoot === workspaceRoot && project.deletedAt === null)) {
          throw new Error(`project already exists for workspace root ${workspaceRoot}`);
        }
        state.projectCreates += 1;
        state.projects.push({
          id: String(command['projectId']),
          workspaceRoot,
          defaultModelSelection: null,
          deletedAt: null,
        });
        return null;
      }
      if (command['type'] === 'thread.create') {
        state.activeThreadCreates += 1;
        state.threadCreates += 1;
        state.maxConcurrentThreadCreates = Math.max(state.maxConcurrentThreadCreates, state.activeThreadCreates);
        if (state.threadCreates === state.threadCreateTarget) state.releaseThreadCreateBarrier();
        await state.threadCreateBarrier;
        state.threads.push({
          projectId: String(command['projectId']),
          modelSelection: command['modelSelection'],
          runtimeMode: String(command['runtimeMode']),
          interactionMode: String(command['interactionMode']),
          createdAt: String(command['createdAt']),
          deletedAt: null,
        });
        state.activeThreadCreates -= 1;
        return null;
      }
      if (command['type'] === 'thread.turn.start') {
        state.turnStarts += 1;
      }
      return null;
    }

    async environment() {
      return { environmentId: 'test-environment' };
    }

    revoke(): void {}
  }

  const serverCommand = vi.fn(async () => ({ exe: process.execPath, script: 'C:\\t3\\server.asar\\bin.mjs' }));

  return { ...original, T3Api: MockT3Api, serverCommand };
});

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    spawn: vi.fn(() => ({ unref: vi.fn() }) as unknown as ReturnType<typeof original.spawn>),
  };
});

function thisProjects() {
  return state.projects.map((project) => ({ ...project }));
}

function thisThreads() {
  return state.threads.map((thread) => ({ ...thread }));
}

function startInput(workspaceRoot: string, index: number, branch: string): HandOffInput & { workspaceRoot: string } {
  return {
    title: `Concurrent start ${String(index)}`,
    workspaceRoot,
    branch,
    model: null,
    prompt: (worktree) => `Start ${String(index)}${worktree === null ? '' : ` on ${worktree.branch}`}`,
  };
}

describe('T3HandOff concurrent prepare', () => {
  // Eight real Git worktrees are prepared serially; loaded Windows hosts need
  // more time than the default unit-test budget without relaxing assertions.
  const realGitTimeout = 90_000;
  let tempRoot: string;
  let workspaceRoot: string;
  let runtime: T3Runtime;
  let pendingStarts: Promise<unknown>[];

  beforeEach(async () => {
    pendingStarts = [];
    tempRoot = await mkdtemp(join(tmpdir(), 'wayfinder-t3-prepare-'));
    workspaceRoot = join(tempRoot, 'repo');
    await mkdir(workspaceRoot);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Wayfinder test'], { cwd: workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'wayfinder@example.test'], { cwd: workspaceRoot, stdio: 'ignore' });
    await writeFile(join(workspaceRoot, 'README.md'), 'fixture\n', 'utf8');
    execFileSync('git', ['add', 'README.md'], { cwd: workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: workspaceRoot, stdio: 'ignore' });
    runtime = { origin: 'http://127.0.0.1:3773', pid: 123, stateDir: join(tempRoot, 'userdata') };
  }, realGitTimeout);

  afterEach(async () => {
    // A timeout or rejected prepare must not leave another hand-off using the
    // fixture while teardown removes it. Release the mock barrier on failure.
    state.releaseThreadCreateBarrier();
    await Promise.allSettled(pendingStarts);
    await rm(tempRoot, { recursive: true, force: true });
  }, realGitTimeout);

  it('creates one T3 project and keeps all thread dispatches concurrent', async () => {
    const count = 8;
    state.reset(count);
    const startThread = new T3HandOff().steps(runtime).startThread;

    const starts = Array.from({ length: count }, (_, index) => startThread(startInput(workspaceRoot, index, `wayfinder/ticket-${String(index + 1)}`)));
    pendingStarts = starts;
    const results = await Promise.all(starts);

    expect(state.projectCreates).toBe(1);
    expect(state.turnStarts).toBe(count);
    expect(results).toHaveLength(count);
    expect(new Set(results.map((result) => result.tracking?.projectId)).size).toBe(1);
    expect(state.maxConcurrentThreadCreates).toBe(count);
  }, realGitTimeout);

  it('assigns each concurrent new-map start its own branch', async () => {
    const count = 8;
    state.reset(count);
    const startThread = new T3HandOff().steps(runtime).startThread;

    const starts = Array.from({ length: count }, (_, index) => startThread(startInput(workspaceRoot, index, 'wayfinder/new-map')));
    pendingStarts = starts;
    const results = await Promise.all(starts);

    expect(state.projectCreates).toBe(1);
    expect(state.turnStarts).toBe(count);
    expect(results.map((result) => result.tracking?.branch)).toEqual([
      'wayfinder/new-map',
      ...Array.from({ length: count - 1 }, (_, index) => `wayfinder/new-map-${String(index + 2)}`),
    ]);
    expect(state.maxConcurrentThreadCreates).toBe(count);
  }, realGitTimeout);
});
