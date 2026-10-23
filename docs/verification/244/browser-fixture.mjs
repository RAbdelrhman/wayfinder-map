import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

await mkdir('.shots/244', { recursive: true });
let login = 'alice';
const calls = [];
const forbidden = [];
const issue = (number, done = false) => ({ number, title: `Fixture ticket ${number}`, body: '', state: done ? 'closed' : 'open', labels: [{ name: 'wayfinder:task' }], assignees: [], updated_at: new Date().toISOString(), html_url: `https://github.com/fixture/tutorial/issues/${number}` });
const map = (number, title, ticket, done = false) => ({ ...issue(number), title, body: `## Destination\n${title}\n\n## Tickets\n- [ ] #${ticket}`, author: { login: 'alice' }, sub_issues_summary: { total: 1, completed: done ? 1 : 0, percent_completed: done ? 100 : 0 } });
const maps = [map(10, 'Active verification map', 11), map(20, 'Finished verification map', 21, true)];
async function fake(file, args) {
  calls.push([file, args]);
  await writeFile('.shots/244/calls.json', JSON.stringify({ calls, forbidden }, null, 2));
  if (file !== 'gh') throw new Error(`Blocked process: ${file}`);
  if (args[0] === 'auth' && args[1] === 'switch') { login = args.at(-1); return { stdout: Buffer.from(''), stderr: Buffer.alloc(0) }; }
  const route = args.at(-1);
  if (args.includes('repos/fixture/tutorial') && args.includes('--jq')) return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  if (args.includes('search/issues')) return { stdout: Buffer.from(''), stderr: Buffer.alloc(0) };
  let data;
  if (args.includes('--slurp') && route.includes('/issues?')) data = [maps];
  else if (/issues\/10\/sub_issues/.test(route)) data = [issue(11)];
  else if (/issues\/20\/sub_issues/.test(route)) data = [issue(21, true)];
  else if (route.endsWith('/dependencies/blocked_by')) data = [];
  else if (/issues\/11$/.test(route)) data = issue(11);
  else if (/issues\/21$/.test(route)) data = issue(21, true);
  else { forbidden.push([file, args]); await writeFile('.shots/244/calls.json', JSON.stringify({ calls, forbidden }, null, 2)); throw new Error(`Blocked fixture call: ${args.join(' ')}`); }
  const output = args.includes('--include') ? `HTTP/2.0 200 OK\r\nETag: "fixture"\r\n\r\n${JSON.stringify(data)}` : JSON.stringify(data);
  return { stdout: Buffer.from(output), stderr: Buffer.alloc(0) };
}
await build({ entryPoints: ['src/server.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.shots/server-244.mjs' });
await build({ stdin: { contents: `export { fetchMaps } from './src/github.ts'; export { SettleStore } from './src/settling.ts'; export { HandOffStore } from './src/handOffTracking.ts'; export { MapWatcher } from './src/mapWatcher.ts'; export { memoryAutoMapStore } from './src/autoMapStore.ts';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.shots/deps-244.mjs' });
cp.execFile = Object.assign(() => { throw new Error('Use promisified fixture'); }, { [promisify.custom]: fake });
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFileSync']) cp[name] = () => { throw new Error(`Blocked ${name}`); };
syncBuiltinESMExports();
const { startServer, DEFAULT_TEMPLATE } = await import(pathToFileURL(resolve('.shots/server-244.mjs')).href);
const { fetchMaps, SettleStore, HandOffStore, MapWatcher, memoryAutoMapStore } = await import(pathToFileURL(resolve('.shots/deps-244.mjs')).href);
const account = () => ({ status: 'ready', host: 'github.com', login, accounts: ['alice', 'bob'], missingScopes: [], tokenSource: 'keyring', message: null });
const running = await startServer({
  config: { repo: null, cwd: process.cwd(), port: 4484, host: '127.0.0.1', mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', promptFile: null, open: false },
  repo: null, workspaceRoot: null, template: DEFAULT_TEMPLATE, uiDir: resolve('dist/ui'),
  fetcher: fetchMaps, changeChecker: async () => false,
  homeLoader: async () => ({ version: '0.2.22', account: account(), repositories: ['fixture/tutorial'], skippedOrganizations: [], warning: null }),
  accountReader: async () => account(), repoLister: async () => ['fixture/tutorial'],
  t3: { detect: async () => null, models: async () => ({ providers: [] }), projects: async () => [], steps: () => { forbidden.push('agent steps'); throw new Error('No agent actions allowed'); } },
  handOffStore: new HandOffStore({ filePath: null }), autoMapStore: memoryAutoMapStore(),
  mapWatcher: new MapWatcher({ readMap: async () => ({ status: 'unchanged', rateLimit: null, pollIntervalSeconds: null }), readPullRequests: async () => ({ byTicket: new Map(), lastCommits: new Map(), rateLimit: null }) }),
  settling: { account: async () => ({ host: 'github.com', login }), store: new SettleStore(resolve('.shots/244/settled.json')) },
});
console.log(running.url);
