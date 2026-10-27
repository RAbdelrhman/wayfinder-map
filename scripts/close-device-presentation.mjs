import { rm } from 'node:fs/promises';

/** Release every test resource even when an earlier shutdown step fails. */
export async function closeDevicePresentation(browser, server, fixture) {
  try {
    await browser?.close();
  } finally {
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
      }
    } finally {
      // Caller supplies its mkdtemp-created absolute fixture, never a repo path.
      await rm(fixture, { recursive: true, force: true });
    }
  }
}
