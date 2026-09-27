import { describe, expect, it, vi } from 'vitest';

const { runGh } = vi.hoisted(() => ({
  runGh: vi.fn((_file: string, _args: string[], _options: unknown) => Promise.resolve({ stdout: Buffer.from(''), stderr: Buffer.from('') })),
}));

vi.mock('node:child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: runGh,
  }),
}));

import { fetchMaps } from './github.js';

describe('fetchMaps pagination', () => {
  it('includes maps on later pages and skips pull requests', async () => {
    const mapIssue = (number: number) => ({
      number,
      title: `Map ${String(number)}`,
      html_url: `https://github.com/octo/repo/issues/${String(number)}`,
      body: '',
      state: 'open',
    });
    const pages = [
      Array.from({ length: 100 }, (_, index) => mapIssue(index + 1)),
      [mapIssue(101), { ...mapIssue(102), pull_request: { url: 'https://api.github.com/repos/octo/repo/pulls/102' } }],
    ];
    const calls: string[][] = [];

    runGh.mockImplementation(async (_file, args) => {
      calls.push(args);
      if (args.includes('--slurp')) return { stdout: Buffer.from(JSON.stringify(pages)), stderr: Buffer.from('') };
      if (args.some((arg) => arg.includes('/sub_issues?'))) return { stdout: Buffer.from('[]'), stderr: Buffer.from('') };
      throw new Error(`Unexpected gh command: ${args.join(' ')}`);
    });

    const result = await fetchMaps({ repo: 'octo/repo', mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:' });

    expect(result.maps.map((map) => map.number)).toEqual(Array.from({ length: 101 }, (_, index) => index + 1));
    expect(calls.find((args) => args.includes('--slurp'))).toEqual([
      'api',
      '--paginate',
      '--slurp',
      'repos/octo/repo/issues?state=all&labels=wayfinder%3Amap&per_page=100',
    ]);
  });
});
