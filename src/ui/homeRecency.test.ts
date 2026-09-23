import { describe, expect, it } from 'vitest';

import { LAST_OPENED_MAP_KEY, RECENT_REPOSITORIES_KEY, REPOSITORY_OPENED_KEY, readHomeRecency, recordMapOpened, recordRepositoryOpened } from './homeRecency.js';

class MemoryStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('Home recency', () => {
  it('records repository and map opens without changing the existing recent-repository format', () => {
    const storage = new MemoryStorage();
    storage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(['octo/first']));

    recordMapOpened('Octo/Wayfinder', 42, Date.parse('2026-09-20T12:00:00.000Z'), storage);

    expect(JSON.parse(storage.getItem(RECENT_REPOSITORIES_KEY) ?? 'null')).toEqual(['Octo/Wayfinder', 'octo/first']);
    expect(JSON.parse(storage.getItem(REPOSITORY_OPENED_KEY) ?? 'null')).toEqual({ 'octo/wayfinder': '2026-09-20T12:00:00.000Z' });
    expect(JSON.parse(storage.getItem(LAST_OPENED_MAP_KEY) ?? 'null')).toEqual({
      repo: 'Octo/Wayfinder',
      mapNumber: 42,
      openedAt: '2026-09-20T12:00:00.000Z',
    });
  });

  it('reads valid recency and ignores malformed stored values', () => {
    const storage = new MemoryStorage();
    storage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(['octo/first', 'invalid', 'octo/FIRST']));
    storage.setItem(REPOSITORY_OPENED_KEY, '{broken');
    storage.setItem(LAST_OPENED_MAP_KEY, JSON.stringify({ repo: 'octo/first', mapNumber: -1, openedAt: 'yesterday' }));

    expect(readHomeRecency(storage)).toEqual({
      repositories: ['octo/first'],
      repositoryOpenedAt: {},
      lastOpenedMap: null,
    });
  });

  it('moves a newly opened repository to the front and caps recent entries', () => {
    const storage = new MemoryStorage();
    storage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(['o/a', 'o/b', 'o/c', 'o/d', 'o/e', 'o/f', 'o/g', 'o/h']));

    recordRepositoryOpened('o/c', Date.parse('2026-09-20T12:00:00.000Z'), storage);

    expect(readHomeRecency(storage).repositories).toEqual(['o/c', 'o/a', 'o/b', 'o/d', 'o/e', 'o/f', 'o/g', 'o/h']);
  });
});
