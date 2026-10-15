// #221 research probe. Run from a scratch folder with `npm i playwright`; fetch.mjs <branch> <dir> first.
// Download a branch's prototypes/ tree through the GitHub REST API, as a phone app would.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
const token = execSync('gh auth token').toString().trim();
const [branch, out] = process.argv.slice(2);
const api = (p, accept = 'application/vnd.github+json') =>
  fetch(`https://api.github.com/repos/RAbdelrhman/wayfinder-map/${p}`, { headers: { authorization: `Bearer ${token}`, accept } });
const t0 = Date.now();
const tree = await (await api(`git/trees/${encodeURIComponent(branch)}?recursive=1`)).json();
const files = tree.tree.filter((e) => e.type === 'blob' && e.path.startsWith('prototypes/'));
let bytes = 0;
await Promise.all(files.map(async (f) => {
  const res = await api(`git/blobs/${f.sha}`, 'application/vnd.github.raw');
  const buf = Buffer.from(await res.arrayBuffer());
  bytes += buf.length;
  const dest = join(out, f.path);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}));
console.log(JSON.stringify({ branch, requests: files.length + 1, files: files.length, bytes, ms: Date.now() - t0, truncated: tree.truncated }));
