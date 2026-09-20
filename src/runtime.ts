import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Config } from './config.js';
import { currentRepo } from './github.js';
import { DEFAULT_TEMPLATE } from './prompt.js';
import { startServer } from './server.js';
import type { RunningServer, ServerT3 } from './server.js';
import { T3HandOff, detectT3, resolveWorkspace } from './t3.js';
import type { T3Runtime } from './t3.js';
import { normalizeRepo, repoPath } from './repoRoutes.js';

export type StartupStage = 'repository' | 'prompt' | 'workspace' | 'server' | 't3';

export class WayfinderStartupError extends Error {
  constructor(
    readonly stage: StartupStage,
    message: string,
    cause: unknown,
  ) {
    super(message, { cause });
    this.name = 'WayfinderStartupError';
  }
}

export type ManagedT3 = ServerT3 & Pick<T3HandOff, 'close'>;

export interface WayfinderRuntime {
  repo: string | null;
  url: string;
  workspaceRoot: string | null;
  t3Origin: string | null;
  close: () => Promise<void>;
}

export interface RuntimeDependencies {
  currentRepo: (cwd: string) => Promise<string>;
  readTextFile: (path: string) => Promise<string>;
  resolveWorkspace: typeof resolveWorkspace;
  createT3: () => ManagedT3;
  startServer: typeof startServer;
  detectT3: () => Promise<T3Runtime>;
}

export interface RuntimeStartOptions {
  resolveCurrentRepository?: boolean;
  /** Where the page's files live, named by the entry point rather than derived here. */
  uiDir?: string;
}

const DEFAULT_DEPENDENCIES: RuntimeDependencies = {
  currentRepo,
  readTextFile: (path) => readFile(path, 'utf8'),
  resolveWorkspace,
  createT3: () => new T3HandOff(),
  startServer,
  detectT3,
};

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined || (error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') resolveClose();
      else rejectClose(error);
    });
  });
}

function startupError(stage: StartupStage, message: string, cause: unknown): WayfinderStartupError {
  return cause instanceof WayfinderStartupError ? cause : new WayfinderStartupError(stage, message, cause);
}

export async function startWayfinder(
  config: Config,
  overrides: Partial<RuntimeDependencies> = {},
  options: RuntimeStartOptions = {},
): Promise<WayfinderRuntime> {
  const dependencies: RuntimeDependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };

  let repo = config.repo === null ? null : normalizeRepo(config.repo);
  if (config.repo !== null && repo === null) {
    throw startupError('repository', `Invalid repository "${config.repo}". Use owner/name.`, new Error('Invalid repository'));
  }
  if (repo === null && options.resolveCurrentRepository !== false) {
    try {
      repo = normalizeRepo(await dependencies.currentRepo(config.cwd));
    } catch {
      repo = null;
    }
  }

  let template = DEFAULT_TEMPLATE;
  if (config.promptFile !== null) {
    try {
      template = await dependencies.readTextFile(resolve(config.cwd, config.promptFile));
    } catch (error) {
      throw startupError('prompt', `Could not read prompt template ${config.promptFile}.`, error);
    }
  }

  let workspaceRoot: string | null = null;
  if (repo !== null) {
    try {
      workspaceRoot = await dependencies.resolveWorkspace(config.cwd, repo, () => dependencies.currentRepo(config.cwd));
    } catch (error) {
      throw startupError('workspace', `Could not inspect the checkout at ${config.cwd}.`, error);
    }
  }

  const t3 = dependencies.createT3();
  let running: RunningServer;
  try {
    running = await dependencies.startServer({
      config,
      repo,
      template,
      workspaceRoot,
      t3,
      ...(options.uiDir === undefined ? {} : { uiDir: options.uiDir }),
    });
  } catch (error) {
    t3.close();
    throw startupError('server', `Could not start Wayfinder on ${config.host}:${String(config.port)}.`, error);
  }

  let t3Runtime: T3Runtime;
  try {
    t3Runtime = await dependencies.detectT3();
  } catch (error) {
    t3.close();
    await closeServer(running.server).catch(() => undefined);
    throw startupError('t3', 'Could not inspect the local T3 Code runtime.', error);
  }

  let closePromise: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closePromise ??= (() => {
      t3.close();
      return closeServer(running.server);
    })();
    return closePromise;
  };

  return {
    repo,
    url: repo === null ? running.url : `${running.url}${repoPath(repo)}`,
    workspaceRoot,
    t3Origin: t3Runtime.origin,
    close,
  };
}
