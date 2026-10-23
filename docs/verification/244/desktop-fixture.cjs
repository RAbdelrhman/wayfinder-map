const { app } = require('electron');
const cp = require('node:child_process');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const root = path.resolve(__dirname, '../../..');
const isolated = path.join(root, '.shots', '244', 'desktop-home');
fs.mkdirSync(isolated, { recursive: true });
fs.mkdirSync(path.join(isolated, '.wayfinder-map'), { recursive: true });
fs.writeFileSync(path.join(isolated, '.wayfinder-map', 'follows.json'), JSON.stringify({ bob: { 'fixture/tutorial': [10, 20] } }));
app.setPath('userData', path.join(isolated, 'electron'));
app.setAppPath(root);
os.homedir = () => isolated;
const calls = [];
let login = 'alice';
const issue = (number, done = false) => ({ number, title: `Fixture ticket ${number}`, body: '', state: done ? 'closed' : 'open', labels: [{ name: 'wayfinder:task' }], assignees: [], user: { login: 'alice' }, updated_at: new Date().toISOString(), html_url: `https://github.com/fixture/tutorial/issues/${number}` });
const map = (number, title, ticket, done = false) => ({ ...issue(number), title, body: `Visibility: public\n\n## Destination\n${title}\n\n## Tickets\n- [ ] #${ticket}`, sub_issues_summary: { total: 1, completed: done ? 1 : 0, percent_completed: done ? 100 : 0 } });
const maps = [map(10, 'Active verification map', 11), map(20, 'Finished verification map', 21, true)];
const rejected = [];
async function fake(file, args) {
  calls.push([file, args]);
  fs.writeFileSync(path.join(root, '.shots', '244', 'desktop-calls.json'), JSON.stringify({ calls, rejected }, null, 2));
  if (file !== 'gh') throw new Error(`Blocked process ${file}`);
  if (args[0] === 'auth' && args[1] === 'switch') { login = args.at(-1); return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; }
  const methodFlag = args.findIndex(arg => arg === '-X' || arg === '--method');
  const inlineMethod = args.find(arg => arg.startsWith('--method=') || (arg.startsWith('-X') && arg.length > 2));
  const hasBody = args.some(arg => /^(-[fF]|--(?:raw-)?field(?:=|$)|--input(?:=|$))/.test(arg));
  const method = methodFlag >= 0 ? args[methodFlag + 1] : inlineMethod?.replace(/^(--method=|-X)/, '') ?? (hasBody ? 'POST' : 'GET');
  if (args[0] === 'api' && method !== 'GET') {
    rejected.push([file, args]);
    fs.writeFileSync(path.join(root, '.shots', '244', 'desktop-calls.json'), JSON.stringify({ calls, rejected }, null, 2));
    throw new Error(`Blocked fixture write method ${method}`);
  }
  let data;
  const route = args.at(-1);
  if (args[0] === 'auth' && args[1] === 'status') data = { hosts: { 'github.com': ['alice', 'bob'].map(name => ({ login: name, active: login === name, scopes: 'repo,read:org', tokenSource: 'fixture' })) } };
  else if (args.includes('user/orgs')) return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  else if ((args.includes('user') || args.includes('repos/fixture/tutorial')) && args.includes('--jq')) return { stdout: Buffer.from(''), stderr: Buffer.alloc(0) };
  else if (args.some(arg => arg.startsWith('user/repos?'))) return { stdout: Buffer.from('fixture/tutorial'), stderr: Buffer.alloc(0) };
  else if (args.includes('search/issues') && args.some(arg => arg.startsWith('q=label:'))) data = { items: [{ repository_url: 'https://api.github.com/repos/fixture/tutorial' }] };
  else if (args.includes('search/issues')) return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  else if (args.includes('--slurp') && route.includes('/issues?')) data = [maps];
  else if (/issues\/10\/sub_issues/.test(route)) data = [issue(11)];
  else if (/issues\/20\/sub_issues/.test(route)) data = [issue(21, true)];
  else if (route.endsWith('/dependencies/blocked_by')) data = [];
  else if (/issues\/11$/.test(route)) data = issue(11);
  else if (/issues\/21$/.test(route)) data = issue(21, true);
  else if (args.includes('-H') || args.includes('--include')) data = {};
  else { rejected.push([file, args]); throw new Error(`Blocked fixture call ${args.join(' ')}`); }
  const output = args.includes('--include') || args.includes('-i') ? `HTTP/2.0 200 OK\r\nETag: "fixture"\r\n\r\n${JSON.stringify(data)}` : JSON.stringify(data);
  return { stdout: Buffer.from(output), stderr: Buffer.alloc(0) };
}
cp.execFile = Object.assign(() => { throw new Error('Use fixture async wrapper'); }, { [promisify.custom]: fake });
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFileSync']) cp[name] = () => { throw new Error(`Blocked ${name}`); };
require('node:module').syncBuiltinESMExports();
require(path.join(root, 'dist', 'desktop.cjs'));
