import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('rejects malformed URL paths and keeps serving the canvas', async () => {
  const script = fileURLToPath(new URL('../../prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/tools/serve.mjs', import.meta.url));
  const server = spawn(process.execPath, [script, '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const canvasUrl = await new Promise<string>((resolve, reject) => {
      let output = '';
      server.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = /Canvas: (http:\/\/[^\s]+)/.exec(output);
        const url = match?.[1];
        if (url) resolve(url);
      });
      server.once('error', reject);
      server.once('exit', (code) => reject(new Error(`Preview exited before readiness: ${code}`)));
    });
    const origin = new URL(canvasUrl).origin;
    for (const path of ['/%', '/%ZZ', '/%E0%A4%A']) {
      const response = await fetch(origin + path);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Bad request');
    }
    const canvas = await fetch(canvasUrl);
    expect(canvas.status).toBe(200);
    expect(canvas.headers.get('content-security-policy')).toContain('sandbox allow-scripts');
    expect(await canvas.text()).toContain('config.js');
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
}, 15_000);
