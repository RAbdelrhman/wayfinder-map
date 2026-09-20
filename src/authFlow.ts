import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

export type AuthFlowStatus = 'idle' | 'waiting' | 'complete' | 'failed';

export interface AuthFlowState {
  status: AuthFlowStatus;
  code: string | null;
  url: string | null;
  error: string | null;
}

export function parseAuthChallenge(output: string): Pick<AuthFlowState, 'code' | 'url'> {
  return {
    code: output.match(/one-time code:\s*([A-Z0-9-]+)/i)?.[1] ?? null,
    url: output.match(/https:\/\/github\.com\/login\/device/i)?.[0] ?? null,
  };
}

type AuthChild = ChildProcessByStdio<null, Readable, Readable>;

export class AuthFlow {
  private child: AuthChild | null = null;
  private state: AuthFlowState = { status: 'idle', code: null, url: null, error: null };

  snapshot(): AuthFlowState {
    return { ...this.state };
  }

  start(args: readonly string[]): AuthFlowState {
    if (this.child !== null) return this.snapshot();
    this.state = { status: 'waiting', code: null, url: null, error: null };
    const env = { ...process.env };
    delete env['GH_BROWSER'];
    const child = spawn('gh', [...args], {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    let output = '';
    const read = (chunk: Buffer | string): void => {
      output += chunk.toString();
      const { code, url } = parseAuthChallenge(output);
      this.state = { ...this.state, code, url };
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.once('error', (error) => {
      this.state = { status: 'failed', code: null, url: null, error: error.message };
      this.child = null;
    });
    child.once('exit', (code) => {
      this.state = code === 0
        ? { ...this.state, status: 'complete', error: null }
        : { ...this.state, status: 'failed', error: output.trim() || `GitHub CLI exited with code ${String(code)}.` };
      this.child = null;
    });
    return this.snapshot();
  }

  cancel(): void {
    this.child?.kill();
    this.child = null;
    this.state = { status: 'idle', code: null, url: null, error: null };
  }
}
