import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineCanvasService } from './inlineCanvasService.js';
import { canvasNotesComment } from './canvasNotes.js';
import { prototypeFileUrl } from './prototypes.js';
import { objectAppLink } from './objectLinks.js';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('./github.js', () => ({ fetchBranchFile: read }));
const sha = 'a'.repeat(40), repo = 'octo/repo', canvas = 'prototypes/42/index.html';
const target = { kind: 'prototype' as const, id: 'real-test-id', canvas, revision: sha };
const url = prototypeFileUrl(repo, 'prototype/42', canvas, sha);
const route = { url, title: '#42 Home', github: 'https://github.com/octo/repo/issues/42', file: null, ticket: 42 };
const resolved = { repo, mapNumber: 20, ticketNumber: 42, canvas: route };
const body = (page = 'home', option: string | null = 'A') => canvasNotesComment({ branch: 'prototype/42', sha, source: 'engine', pages: ['home'], options: { home: ['A'] } }, [{ type: 'note', page, pageTitle: 'Home', option, optionName: 'A', note: 'Test feedback' }]);
beforeEach(() => {
  read.mockImplementation(async (_repo: string, _sha: string, file: string) => Buffer.from(file.endsWith('config.js') ? 'window.CANVAS={ticket:42,pages:[{id:"home",title:"Home",sections:[{items:[{id:"A",name:"A",kind:"note"},{id:"B",name:"B",kind:"components"}]}]}]};' : '<html><head></head><body>Canvas</body></html>'));
});
function fixture() {
  const request = vi.fn<typeof fetch>(async input => new Response(JSON.stringify(String(input).includes('/api/canvas-destination') ? resolved : { url: 'https://github.com/octo/repo/issues/42#issuecomment-123', handOffId: null }), { status: 200 }));
  return { request, service: new InlineCanvasService('http://127.0.0.1:4479', request) };
}
describe('MCP canvas feedback scope', () => {
  it('rejects remote origins and non-canvas destinations', async () => {
    expect(() => new InlineCanvasService('https://evil.test')).toThrow('local');
    await expect(fixture().service.open('https://evil.test/open/prototype/id')).rejects.toThrow('prototype destination');
  });
  it('posts canonical feedback only to its bound ticket, after fresh ownership validation', async () => {
    const { service, request } = fixture();
    const session = await service.open(objectAppLink(target));
    const posted = await service.post(session.id, 'request-1', body('home', 'B'));
    expect(posted.url).toContain('#issuecomment-123');
    const call = request.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(call[0]).toBe('http://127.0.0.1:4479/api/repos/octo/repo/canvas-notes');
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ ticket: 42 });
    expect(request.mock.calls.filter(([input]) => String(input).includes('/api/canvas-destination'))).toHaveLength(2);
    expect(read.mock.calls.every(([, commit]) => commit === sha)).toBe(true);
  });
  it('deduplicates retries and refuses changing the text of an already-started request', async () => {
    const { service, request } = fixture();
    const session = await service.open(objectAppLink(target));
    const note = body('home', 'B');
    await Promise.all([service.post(session.id, 'r1', note), service.post(session.id, 'r1', note)]);
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(() => service.post(session.id, 'r1', note.replace('Test feedback', 'Changed'))).toThrow('cannot change');
  });
  it('blocks unknown frames, changed versions and moved tickets without writing', async () => {
    const { service, request } = fixture();
    const session = await service.open(objectAppLink(target));
    await expect(service.post(session.id, 'bad-page', body('elsewhere', 'B'))).rejects.toThrow('unknown');
    await expect(service.post(session.id, 'bad-version', body('home', 'B').replaceAll(sha, 'b'.repeat(40)))).rejects.toThrow('another canvas version');
    request.mockResolvedValueOnce(new Response(JSON.stringify({ ...resolved, mapNumber: 21 })));
    await expect(service.post(session.id, 'moved', body('home', 'B'))).rejects.toThrow('moved');
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
  it('does not report a failed save as posted', async () => {
    const { service, request } = fixture();
    const session = await service.open(objectAppLink(target));
    request.mockImplementation(async (_input, init) => new Response(JSON.stringify(init?.method === 'POST' ? { error: 'GitHub refused' } : resolved), { status: init?.method === 'POST' ? 502 : 200 }));
    await expect(service.post(session.id, 'failed', body('home', 'B'))).rejects.toThrow('GitHub refused');
  });
  it('restores the exact pinned canvas after the MCP process restarts, with a fresh access check', async () => {
    const first = fixture();
    const opened = await first.service.open(objectAppLink(target));
    const second = fixture();
    const restored = await second.service.restore(opened.id);
    expect(restored.target).toEqual(target);
    expect(restored.id).toBe(opened.id);
    expect(second.request).toHaveBeenCalled();
    await expect(second.service.restore('..')).rejects.toThrow('Invalid');
  });
  it('normalizes an uppercase SHA before binding the immutable canvas', async () => {
    const { service } = fixture();
    const session = await service.open(objectAppLink({ ...target, revision: sha.toUpperCase() }));
    expect(session.target.revision).toBe(sha);
  });
});
