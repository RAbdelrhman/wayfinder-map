import type { ObjectLink } from './objectLinks.js';
import { validObjectId } from './objectLinks.js';

export const OBJECT_NODE_QUERY = `query WayfinderDestination($id: ID!) {
  node(id: $id) {
    __typename
    ... on Repository { id nameWithOwner }
    ... on Issue {
      id number body author { login } repository { nameWithOwner }
      labels(first: 100) { nodes { name } pageInfo { hasNextPage } }
      parent {
        id number body author { login } repository { nameWithOwner }
        labels(first: 100) { nodes { name } pageInfo { hasNextPage } }
      }
    }
  }
}`;

export type ObjectMap = { id: string; repo: string; number: number; body: string; author: string | null };
export type ObjectDestination =
  | { kind: 'repo'; id: string; repo: string }
  | { kind: 'map'; id: string; repo: string; mapNumber: number }
  | { kind: 'ticket' | 'prototype'; id: string; repo: string; mapNumber: number; ticketNumber: number };

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

function repoName(value: unknown): string | null {
  const name = record(value)?.['nameWithOwner'];
  return typeof name === 'string' && /^[\w.-]+\/[\w.-]+$/.test(name)
    && name.split('/').every(part => part !== '.' && part !== '..') ? name : null;
}

function issue(value: unknown): (ObjectMap & { labels: string[] }) | null {
  const raw = record(value);
  if (!raw) return null;
  const repo = repoName(raw['repository']);
  const id = raw['id'];
  const number = raw['number'];
  const body = raw['body'];
  const labels = record(raw['labels']);
  const nodes = labels?.['nodes'];
  const author = raw['author'] === null ? null : record(raw['author'])?.['login'];
  if (!repo || typeof id !== 'string' || !validObjectId(id) || typeof number !== 'number'
    || !Number.isSafeInteger(number) || number <= 0 || typeof body !== 'string'
    || (author !== null && typeof author !== 'string') || !Array.isArray(nodes)
    || record(labels?.['pageInfo'])?.['hasNextPage'] !== false) return null;
  const names = nodes.map(node => record(node)?.['name']);
  if (!names.every(name => typeof name === 'string')) return null;
  return { id, repo, number, body, author, labels: names as string[] };
}

/** Always resolve using the current viewer; a link or old cache never grants access. */
export async function resolveObjectDestination(
  link: ObjectLink,
  lookupNode: (id: string) => Promise<unknown>,
  canViewMap: (map: ObjectMap) => Promise<boolean>,
  labels: { mapLabel: string; typePrefix: string } = { mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:' },
): Promise<ObjectDestination | null> {
  const node = record(await lookupNode(link.id));
  if (!node) return null;
  if (link.kind === 'repo') {
    const repo = repoName(node);
    const id = node['id'];
    return node['__typename'] === 'Repository' && repo && typeof id === 'string' && validObjectId(id)
      ? { kind: 'repo', id, repo } : null;
  }
  if (node['__typename'] !== 'Issue') return null;
  const target = issue(node);
  if (!target) return null;
  if (link.kind === 'map') {
    return target.labels.includes(labels.mapLabel) && await canViewMap(target)
      ? { kind: 'map', id: target.id, repo: target.repo, mapNumber: target.number } : null;
  }
  const parent = issue(node['parent']);
  if (!parent || !parent.labels.includes(labels.mapLabel)
    || parent.repo.toLowerCase() !== target.repo.toLowerCase()
    || target.labels.includes(labels.mapLabel)
    || (link.kind === 'prototype' && !target.labels.includes(`${labels.typePrefix}prototype`))
    || !await canViewMap(parent)) return null;
  return { kind: link.kind, id: target.id, repo: target.repo, mapNumber: parent.number, ticketNumber: target.number };
}
