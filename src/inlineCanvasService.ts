import { createHash } from 'node:crypto';
import { z } from 'zod';
import { bundleInlineCanvas } from './inlineCanvasBundle.js';
import type { InlineCanvasBundle } from './inlineCanvasBundle.js';
import { parseObjectAppLink, objectAppLink, objectWebPath } from './objectLinks.js';
import type { ObjectLink } from './objectLinks.js';
import { parseHttpsObjectLink } from './httpsLinks.js';
import { parsePrototypeFilePath } from './prototypes.js';
import { CANVAS_NOTES_MARKER, canvasNotesComment, isCanvasNotesComment, isTicketCommentUrl } from './canvasNotes.js';
import type { CanvasMark } from './canvasNotes.js';
import type { PinnedCanvasRoute } from './canvasDestination.js';
import { fetchBranchFile } from './github.js';

const resolvedSchema = z.object({ repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), mapNumber: z.number().int().positive(), ticketNumber: z.number().int().positive(), canvas: z.object({ url: z.string(), title: z.string(), github: z.string(), ticket: z.number().int().positive(), file: z.null(), page: z.string().optional(), variant: z.string().optional() }) });
const markSchema = z.object({ type: z.enum(['note', 'pin', 'element', 'color']), page: z.string(), option: z.string().nullable(), note: z.string().max(10_000), x: z.number().min(0).max(1).optional(), y: z.number().min(0).max(1).optional(), near: z.string().max(1000).nullable().optional(), element: z.string().max(1000).optional(), selector: z.string().max(4000).optional(), from: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), to: z.string().regex(/^#[0-9a-f]{6}$/i).optional() });

export interface InlineCanvasSession {
  id: string;
  target: Extract<ObjectLink, { kind: 'prototype' }>;
  repo: string;
  mapNumber: number;
  ticketNumber: number;
  route: PinnedCanvasRoute;
  bundle: InlineCanvasBundle;
}

/** A trusted MCP-side adapter. The sandbox never receives gh credentials or a general HTTP proxy. */
export class InlineCanvasService {
  private readonly sessions = new Map<string, InlineCanvasSession>();
  private readonly writes = new Map<string, { digest: string; result: Promise<{ url: string; handOffId: string | null }> }>();
  readonly origin: string;
  constructor(origin: string, private readonly request: typeof fetch = fetch) {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Wayfinder must be a local HTTP origin.');
    this.origin = url.origin;
  }
  private async json(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.request(this.origin + path, { ...init, signal: AbortSignal.timeout(60_000), redirect: 'error' });
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(typeof value === 'object' && value !== null && 'error' in value ? String(value.error) : 'Wayfinder could not complete the request.');
    return value;
  }
  private async resolve(target: Extract<ObjectLink, { kind: 'prototype' }>) {
    return resolvedSchema.parse(await this.json('/api/canvas-destination?' + new URLSearchParams({ target: objectAppLink(target) })));
  }
  async open(destination: string): Promise<InlineCanvasSession> {
    let target = parseHttpsObjectLink(destination) ?? parseObjectAppLink(destination);
    if (!target || target.kind !== 'prototype') throw new Error('Use a Wayfinder prototype destination.');
    if (!target.revision) {
      const response = await this.request(this.origin + objectWebPath(target), { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
      const location = response.headers.get('location');
      if (response.status !== 302 || !location) throw new Error('The newest canvas could not be resolved.');
      const next = new URL(location, this.origin);
      if (next.origin !== this.origin) throw new Error('Invalid canvas redirect.');
      const path = next.searchParams.get('canvas');
      const file = path ? parsePrototypeFilePath(new URL(path, this.origin).pathname) : null;
      if (!file?.sha || file.file !== target.canvas) throw new Error('The newest canvas has no immutable revision.');
      target = { ...target, revision: file.sha };
    }
    target = { ...target, revision: target.revision!.toLowerCase() };
    const resolved = await this.resolve(target);
    const asset = parsePrototypeFilePath(resolved.canvas.url);
    if (!asset?.sha || asset.sha !== target.revision || asset.repo !== resolved.repo || asset.file !== target.canvas || resolved.canvas.ticket !== resolved.ticketNumber) throw new Error('Canvas identity does not match its destination.');
    // This is a restorable address, not an authorization token. Every open still
    // resolves the GitHub ID through the signed-in app before reading cached data.
    const id = Buffer.from(JSON.stringify({ target: objectAppLink(target), repo: resolved.repo, map: resolved.mapNumber, ticket: resolved.ticketNumber })).toString('base64url');
    if (id.length > 3500) throw new Error('This canvas destination is too long to embed.');
    const cached = this.sessions.get(id);
    if (cached) return cached;
    const bundle = await bundleInlineCanvas(asset.file, path => fetchBranchFile(resolved.repo, asset.sha!, path));
    const route: PinnedCanvasRoute = { url: resolved.canvas.url, title: resolved.canvas.title, github: resolved.canvas.github, ticket: resolved.ticketNumber, file: null, ...(resolved.canvas.page !== undefined ? { page: resolved.canvas.page } : {}), ...(resolved.canvas.variant !== undefined ? { variant: resolved.canvas.variant } : {}) };
    const session: InlineCanvasSession = { id, target, repo: resolved.repo, mapNumber: resolved.mapNumber, ticketNumber: resolved.ticketNumber, route, bundle };
    if (this.sessions.size >= 8) this.sessions.delete(this.sessions.keys().next().value!);
    this.sessions.set(session.id, session);
    return session;
  }
  async restore(id: string): Promise<InlineCanvasSession> {
    if (id.length > 3500 || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid embedded canvas address.');
    const saved = z.object({ target: z.string().max(5000), repo: z.string(), map: z.number().int().positive(), ticket: z.number().int().positive() }).parse(JSON.parse(Buffer.from(id, 'base64url').toString('utf8')));
    const target = parseObjectAppLink(saved.target);
    if (!target || target.kind !== 'prototype' || !target.revision) throw new Error('The embedded canvas must keep its reviewed revision.');
    const session = await this.open(saved.target);
    if (session.id !== id) throw new Error('The canvas moved. Reopen it before posting feedback.');
    return session;
  }
  async notify(id: string, url: string): Promise<{ sent: true; handOffId: string }> {
    const session = await this.restore(id);
    if (!isTicketCommentUrl(session.repo, session.ticketNumber, url) || !url.includes('#issuecomment-')) throw new Error('Use the posted feedback comment.');
    return z.object({ sent: z.literal(true), handOffId: z.string() }).parse(await this.json(`/api/repos/${session.repo}/canvas-thread`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: session.ticketNumber, url }) }));
  }
  post(id: string, requestId: string, body: string): Promise<{ url: string; handOffId: string | null }> {
    if (!/^[\w-]{1,100}$/.test(requestId) || !isCanvasNotesComment(body)) throw new Error('Invalid canvas feedback.');
    const digest = createHash('sha256').update(body).digest('hex');
    const key = `${id}:${requestId}`;
    const previous = this.writes.get(key);
    if (previous) {
      if (previous.digest !== digest) throw new Error('A feedback retry cannot change its message.');
      return previous.result;
    }
    const result = this.restore(id).then(session => this.save(session, body));
    this.writes.set(key, { digest, result });
    // A completed operation is reused after a lost tool response. A rejected
    // operation never retries itself; another explicit user post is required.
    void result.catch(() => this.writes.delete(key));
    return result;
  }
  private async save(session: InlineCanvasSession, body: string): Promise<{ url: string; handOffId: string | null }> {
    const at = body.lastIndexOf(CANVAS_NOTES_MARKER);
    const raw = z.object({ branch: z.string(), sha: z.string(), source: z.enum(['engine', 'dom', 'page', 'none']), pins: z.array(markSchema).min(1).max(200) }).parse(JSON.parse(body.slice(at + CANVAS_NOTES_MARKER.length).replace(/\s*-->\s*$/, '')));
    const asset = parsePrototypeFilePath(session.route.url)!;
    if (raw.sha !== session.target.revision || raw.branch !== asset.branch) throw new Error('Feedback belongs to another canvas version.');
    const marks: CanvasMark[] = raw.pins.map(mark => {
      const page = session.bundle.pages.find(page => page.id === mark.page);
      const option = page?.items.find(option => option.id === mark.option);
      if (!page || (mark.option !== null && !option)) throw new Error('Feedback names an unknown canvas page or frame.');
      if (mark.type === 'pin' && (mark.x === undefined || mark.y === undefined)) throw new Error('A pin needs its position.');
      if (mark.type === 'color' && (!mark.from || !mark.to)) throw new Error('A colour change needs both colours.');
      const result: CanvasMark = { type: mark.type, page: mark.page, option: mark.option, note: mark.note, pageTitle: page.title, optionName: option?.name ?? null };
      for (const key of ['element', 'selector', 'from', 'to'] as const) if (mark[key] !== undefined) result[key] = mark[key];
      for (const key of ['x', 'y'] as const) if (mark[key] !== undefined) result[key] = mark[key];
      if (mark.near !== undefined) result.near = mark.near;
      return result;
    });
    const comment = canvasNotesComment({ branch: asset.branch, sha: asset.sha!, source: raw.source, pages: session.bundle.pages.map(page => page.id), options: Object.fromEntries(session.bundle.pages.map(page => [page.id, page.items.map(item => item.id)])) }, marks);
    const value = z.object({ url: z.string(), handOffId: z.string().nullable().optional() }).parse(await this.json(`/api/repos/${session.repo}/canvas-notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: session.ticketNumber, body: comment }) }));
    if (!isTicketCommentUrl(session.repo, session.ticketNumber, value.url)) throw new Error('Wayfinder returned a comment on another ticket.');
    return { url: value.url, handOffId: value.handOffId ?? null };
  }
}
