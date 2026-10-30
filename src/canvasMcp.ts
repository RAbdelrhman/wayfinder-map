import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InlineCanvasService } from './inlineCanvasService.js';

export const CANVAS_RESOURCE = 'ui://wayfinder/canvas.html';

export function createCanvasMcp(service: InlineCanvasService, html: () => Promise<string>): McpServer {
  const server = new McpServer({ name: 'wayfinder-canvas', version: '1.0.0' });
  registerAppTool(server, 'open_canvas', {
    title: 'Open Wayfinder canvas',
    description: 'Embed a complete Wayfinder canvas with its existing feedback controls. Use the exact prototype destination, newest by default or pinned with rev. Feedback saves to the native prototype ticket; never substitute a screenshot or an individual screen.',
    inputSchema: z.object({ destination: z.string().max(5000) }),
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: CANVAS_RESOURCE } },
  }, async ({ destination }) => {
    const session = await service.open(destination);
    return { content: [{ type: 'text', text: `Canvas #${session.ticketNumber}, map #${session.mapNumber}, revision ${session.target.revision}. The embedded feedback controls post to this prototype ticket.` }], structuredContent: { session: session.id, repo: session.repo, map: session.mapNumber, ticket: session.ticketNumber, revision: session.target.revision } };
  });
  server.registerTool('post_canvas_feedback', {
    title: 'Post canvas feedback to Wayfinder',
    description: 'Post reviewed canvas feedback to the exact prototype ticket bound to this embedded canvas.',
    inputSchema: z.object({ session: z.string().min(1).max(3500), requestId: z.string().min(1).max(100), body: z.string().max(65_000) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ['app'] } },
  }, async ({ session, requestId, body }) => {
    const value = await service.post(session, requestId, body);
    return { content: [{ type: 'text', text: value.url }], structuredContent: value };
  });
  server.registerTool('notify_canvas_thread', {
    title: 'Send the posted canvas feedback link to T3 Code',
    description: 'Send only the already-posted feedback link into this prototype ticket\'s tracked T3 thread, when the user clicks Send to T3 Code.',
    inputSchema: z.object({ session: z.string().min(1).max(3500), url: z.string().url() }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ['app'] } },
  }, async ({ session, url }) => {
    const value = await service.notify(session, url);
    return { content: [{ type: 'text', text: 'Feedback link sent.' }], structuredContent: value };
  });
  registerAppResource(server, 'Wayfinder canvas', CANVAS_RESOURCE, {}, async () => ({ contents: [{ uri: CANVAS_RESOURCE, mimeType: RESOURCE_MIME_TYPE, text: await html() }] }));
  server.registerResource('Canvas session', new ResourceTemplate('wayfinder-canvas://session/{session}', { list: undefined }), {}, async (uri, { session }) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await service.restore(String(session))) }] }));
  return server;
}

export async function startCanvasMcp(origin = 'http://127.0.0.1:4479'): Promise<void> {
  const root = dirname(fileURLToPath(import.meta.url));
  await createCanvasMcp(new InlineCanvasService(origin), () => readFile(join(root, 'canvas-app.html'), 'utf8')).connect(new StdioServerTransport());
}
