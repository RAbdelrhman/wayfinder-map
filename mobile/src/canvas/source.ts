import type { MobileGithub } from '../maps/github';

export async function canvasSourceRef(api: Pick<MobileGithub, 'prototypeRefs'>, repo: string, ticket: number, revision?: string, signal?: AbortSignal) {
  if (revision) {
    if (!/^[a-f\d]{40}$/i.test(revision)) throw new Error('Invalid prototype revision.');
    return { branch: `prototype/${ticket}`, sha: revision.toLowerCase() };
  }
  return (await api.prototypeRefs(repo, ticket, signal))[0] ?? null;
}

/** Offline data may satisfy a fixed destination only when its identity matches. */
export function matchesCanvasRequest(saved: { sha: string; board: string }, requested: { revision?: string; board?: string }): boolean {
  return (!requested.revision || saved.sha.toLowerCase() === requested.revision.toLowerCase())
    && (!requested.board || saved.board === requested.board);
}
