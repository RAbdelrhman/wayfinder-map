import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface Config {
  repo: string | null;
  cwd: string;
  port: number;
  host: string;
  mapLabel: string;
  typePrefix: string;
  /** Path to a file holding a prompt template, or null for the built-in one. */
  promptFile: string | null;
  open: boolean;
}

export const DEFAULTS: Omit<Config, 'repo' | 'cwd'> = {
  port: 4478,
  host: '127.0.0.1',
  mapLabel: 'wayfinder:map',
  typePrefix: 'wayfinder:',
  promptFile: null,
  open: true,
};

export const USAGE = `wayfinder-map - an interactive map of a repo's wayfinder maps

Usage
  wayfinder-map [options]

Options
  --repo <owner/name>   Repository to open. Uses the one in --cwd, or Home when none.
  --cwd <path>          Directory used to resolve the repo. Defaults to the shell's.
  --port <number>       Port to serve on. Default ${String(DEFAULTS.port)}; 0 picks a free one.
  --map-label <label>   Label that marks a map issue. Default ${DEFAULTS.mapLabel}.
  --type-prefix <text>  Prefix on a ticket's type label. Default ${DEFAULTS.typePrefix}.
  --prompt <file>       Prompt template. {{ticketTitle}}, {{destination}} and friends.
  --no-open             Do not open a browser on start.
  -v, --version         Print the version.
  -h, --help            This text.

Config file
  A wayfinder-map.config.json in --cwd sets the same keys, and flags win over it.
`;

function readPort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) throw new Error(`--port needs a port from 0 to 65535, got "${value}"`);
  return parsed;
}

/** Flags beat the config file, the config file beats the defaults. */
export async function resolveConfig(argv: readonly string[]): Promise<Config | 'help' | 'version'> {
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined || !arg.startsWith('--')) {
      if (arg === '-h') flags.set('help', true);
      if (arg === '-v') flags.set('version', true);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      flags.set(name, true);
    } else {
      flags.set(name, next);
      index += 1;
    }
  }

  if (flags.has('help')) return 'help';
  if (flags.has('version')) return 'version';

  const cwd = resolve(typeof flags.get('cwd') === 'string' ? (flags.get('cwd') as string) : process.cwd());
  const fromFile = await readConfigFile(cwd);

  const text = (name: string, fallback: string): string => {
    const flag = flags.get(name);
    if (typeof flag === 'string') return flag;
    const key = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const value = fromFile[key];
    return typeof value === 'string' ? value : fallback;
  };

  const portFlag = flags.get('port');
  const filePort = fromFile['port'];

  return {
    repo: typeof flags.get('repo') === 'string' ? (flags.get('repo') as string) : (asString(fromFile['repo']) ?? null),
    cwd,
    port:
      typeof portFlag === 'string'
        ? readPort(portFlag)
        : typeof filePort === 'number'
          ? filePort
          : DEFAULTS.port,
    host: DEFAULTS.host,
    mapLabel: text('map-label', DEFAULTS.mapLabel),
    typePrefix: text('type-prefix', DEFAULTS.typePrefix),
    promptFile: typeof flags.get('prompt') === 'string' ? (flags.get('prompt') as string) : (asString(fromFile['prompt']) ?? null),
    open: flags.get('no-open') !== true && fromFile['open'] !== false,
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function readConfigFile(cwd: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(resolve(cwd, 'wayfinder-map.config.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
