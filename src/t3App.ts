import { createHash, randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import { posix, win32 } from 'node:path';

/**
 * The desktop app's control socket, the one `t3 app <path>` talks to. Mirrors
 * resolveDesktopAppControlAddress in T3 Code's packages/shared/src/desktopAppControl.ts.
 */
export function appControlAddress(input: {
  platform: NodeJS.Platform;
  stateDir: string;
  tempDir: string;
  uid: number | undefined;
}): string {
  const stateHash = createHash('sha256').update(input.stateDir, 'utf8').digest('hex').slice(0, 24);
  if (input.platform === 'win32') return `\\\\.\\pipe\\t3code-app-${stateHash}`;
  const userKey = input.uid === undefined ? stateHash.slice(0, 12) : String(input.uid);
  return posix.join(input.tempDir, `t3code-${userKey}`, `${stateHash}.sock`);
}

/** The state directory T3 Code hashes into that address: `<T3CODE_HOME or ~/.t3>/userdata`. */
export function stateDirFor(baseDir: string, platform: NodeJS.Platform): string {
  return (platform === 'win32' ? win32 : posix).resolve(baseDir, 'userdata');
}

export interface OpenedWorkspace {
  projectId: string;
  threadId: string;
}

const RESPONSE_TIMEOUT_MS = 17_000;
const MAX_RESPONSE_BYTES = 65_536;

/**
 * Ask the desktop app to open `workspaceRoot` on a fresh thread, creating the project
 * if it has none. The app answers with one line of JSON on the same connection.
 */
export function openWorkspace(address: string, workspaceRoot: string, platform: NodeJS.Platform): Promise<OpenedWorkspace> {
  const request = { version: 1, requestId: randomUUID(), type: 'open-workspace', workspaceRoot, platform };

  return new Promise<OpenedWorkspace>((resolve, reject) => {
    const socket = connect(address);
    let buffer = '';
    const fail = (error: Error): void => {
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(RESPONSE_TIMEOUT_MS, () => fail(new Error('the desktop app did not answer')));
    socket.on('error', (error) => fail(new Error(`desktop app unreachable (${error.message})`)));
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > MAX_RESPONSE_BYTES) return fail(new Error('desktop app reply too large'));
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      socket.end();
      try {
        resolve(parseResponse(buffer.slice(0, newline), request.requestId));
      } catch (error) {
        reject(error as Error);
      }
    });
  });
}

function parseResponse(line: string, requestId: string): OpenedWorkspace {
  const reply = JSON.parse(line) as {
    requestId?: unknown;
    ok?: unknown;
    projectId?: unknown;
    threadId?: unknown;
    message?: unknown;
  };
  if (reply.requestId !== requestId) throw new Error('desktop app answered a different request');
  if (reply.ok !== true) throw new Error(typeof reply.message === 'string' ? reply.message : 'desktop app refused');
  return { projectId: String(reply.projectId), threadId: String(reply.threadId) };
}
