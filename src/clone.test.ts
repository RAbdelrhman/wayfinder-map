import { describe, expect, it, vi } from 'vitest';

import { cloneRepository } from './clone.js';

describe('cloneRepository', () => {
  it('clones the requested GitHub repository into the selected destination', async () => {
    const command = vi.fn(async () => undefined);

    await expect(cloneRepository('octo/one', 'clones/one', command)).resolves.toMatch(/clones[\\/]one$/);
    expect(command).toHaveBeenCalledWith('https://github.com/octo/one.git', expect.stringMatching(/clones[\\/]one$/));
  });

  it('requires a valid repository and a destination', async () => {
    await expect(cloneRepository('not a repo', 'target')).rejects.toMatchObject({
      kind: 'invalid-repository',
      statusCode: 400,
    });
    await expect(cloneRepository('octo/one', '  ')).rejects.toMatchObject({ kind: 'destination', statusCode: 400 });
  });

  it('explains that a non-empty target folder cannot be used', async () => {
    const command = vi.fn(async () => {
      throw Object.assign(new Error('git clone failed'), {
        stderr: "fatal: destination path 'C:/projects/one' already exists and is not an empty directory.",
      });
    });

    await expect(cloneRepository('octo/one', 'C:/projects/one', command)).rejects.toMatchObject({
      kind: 'destination',
      statusCode: 400,
      message: 'Choose an empty folder for the clone.',
    });
  });

  it('reports an authentication failure without exposing git output', async () => {
    const command = vi.fn(async () => {
      throw Object.assign(new Error('git clone failed'), {
        stderr: 'fatal: Authentication failed for https://github.com/octo/one.git',
      });
    });

    await expect(cloneRepository('octo/one', 'target', command)).rejects.toMatchObject({
      kind: 'authentication',
      statusCode: 502,
      message: 'GitHub could not access octo/one. Check your GitHub sign-in and repository access.',
    });
  });

  it('reports a network failure with a retryable message', async () => {
    const command = vi.fn(async () => {
      throw Object.assign(new Error('git clone failed'), { stderr: 'fatal: Could not resolve host: github.com' });
    });

    await expect(cloneRepository('octo/one', 'target', command)).rejects.toMatchObject({
      kind: 'network',
      statusCode: 502,
      message: 'Could not reach GitHub. Check your network and try again.',
    });
  });
});
