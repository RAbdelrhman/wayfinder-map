import { describe, expect, it, vi } from 'vitest';
import { resolveObjectDestination } from './objectLookup.js';

function issue(number: number, labels: string[], patch: Record<string, unknown> = {}) {
  return { __typename: 'Issue', id: `node-${number}`, number, body: '', author: { login: 'ramon' },
    repository: { nameWithOwner: 'new-owner/new-name' },
    labels: { nodes: labels.map(name => ({ name })), pageInfo: { hasNextPage: false } }, ...patch };
}
const map = issue(217, ['wayfinder:map']);

describe('current object lookup and map boundaries', () => {
  it('uses configured map and prototype labels without accepting the default labels by accident', async () => {
    const parent = issue(217, ['plan:map']);
    const node = issue(366, ['plan:prototype'], { parent });
    const labels = { mapLabel: 'plan:map', typePrefix: 'plan:' };
    const link = { kind: 'prototype', id: 'node-366', canvas: 'prototypes/replies/index.html' } as const;
    expect(await resolveObjectDestination({ kind: 'map', id: 'node-217' }, async () => parent, async () => true, labels)).toMatchObject({ mapNumber: 217 });
    expect(await resolveObjectDestination(link, async () => node, async () => true, labels)).toMatchObject({ ticketNumber: 366 });
    expect(await resolveObjectDestination(link, async () => node, async () => true)).toBeNull();
    expect(await resolveObjectDestination(link, async () => ({ ...node, labels: { nodes: [{ name: 'wayfinder:prototype' }], pageInfo: { hasNextPage: false } } }), async () => true, labels)).toBeNull();
    expect(await resolveObjectDestination(link, async () => node, async () => false, labels)).toBeNull();
  });
  it('looks up an opaque ID and uses the current repository name', async () => {
    const lookup = vi.fn(async () => map);
    expect(await resolveObjectDestination({ kind: 'map', id: 'old-opaque-id' }, lookup, async () => true))
      .toEqual({ kind: 'map', id: 'node-217', repo: 'new-owner/new-name', mapNumber: 217 });
    expect(lookup).toHaveBeenCalledWith('old-opaque-id');
  });
  it('opens a ticket only through its current owning map', async () => {
    const node = issue(366, ['wayfinder:prototype'], { parent: map });
    const access = vi.fn(async () => true);
    expect(await resolveObjectDestination({ kind: 'ticket', id: 'node-366' }, async () => node, access))
      .toEqual({ kind: 'ticket', id: 'node-366', repo: 'new-owner/new-name', mapNumber: 217, ticketNumber: 366 });
    expect(access).toHaveBeenCalledWith(expect.objectContaining({ number: 217 }));
  });
  it('rejects inaccessible maps, unknown parents and foreign parents', async () => {
    expect(await resolveObjectDestination({ kind: 'map', id: 'node-217' }, async () => map, async () => false)).toBeNull();
    for (const parent of [null, issue(4, []), issue(4, ['wayfinder:map'], { repository: { nameWithOwner: 'other/map' } })]) {
      expect(await resolveObjectDestination({ kind: 'ticket', id: 'node-366' }, async () => issue(366, [], { parent }), async () => true)).toBeNull();
    }
  });
  it('requires prototype evidence and rejects GitHub objects of a different type', async () => {
    const link = { kind: 'prototype', id: 'node-366', canvas: 'prototypes/replies/index.html' } as const;
    expect(await resolveObjectDestination(link, async () => issue(366, ['wayfinder:task'], { parent: map }), async () => true)).toBeNull();
    expect(await resolveObjectDestination({ kind: 'map', id: 'node' }, async () => ({ ...map, __typename: 'PullRequest' }), async () => true)).toBeNull();
    expect(await resolveObjectDestination(link, async () => issue(366, ['wayfinder:prototype'], { parent: map }), async () => true)).toMatchObject({ kind: 'prototype', ticketNumber: 366 });
  });
  it('does not turn a partial or failed response into another destination', async () => {
    expect(await resolveObjectDestination({ kind: 'map', id: 'node' }, async () => ({ ...map, labels: { nodes: [], pageInfo: { hasNextPage: true } } }), async () => true)).toBeNull();
    await expect(resolveObjectDestination({ kind: 'map', id: 'node' }, async () => { throw new Error('offline'); }, async () => true)).rejects.toThrow('offline');
  });
  it('resolves a repository without assuming it has map permissions', async () => {
    const access = vi.fn(async () => false);
    expect(await resolveObjectDestination({ kind: 'repo', id: 'old-id' }, async () => ({ __typename: 'Repository', id: 'repo-id', nameWithOwner: 'new-owner/new-name' }), access))
      .toEqual({ kind: 'repo', id: 'repo-id', repo: 'new-owner/new-name' });
    expect(access).not.toHaveBeenCalled();
  });
});
