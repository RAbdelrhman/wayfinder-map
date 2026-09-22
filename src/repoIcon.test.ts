import { describe, expect, it, vi } from 'vitest';

import { githubOwnerAvatarUrl, iconContentType, resolveRepoIcon } from './repoIcon.js';

describe('iconContentType', () => {
  it('returns proper mime types', () => {
    expect(iconContentType('icon.svg')).toBe('image/svg+xml');
    expect(iconContentType('icon.ico')).toBe('image/x-icon');
    expect(iconContentType('icon.png')).toBe('image/png');
    expect(iconContentType('icon.jpg')).toBe('image/jpeg');
    expect(iconContentType('icon.jpeg')).toBe('image/jpeg');
    expect(iconContentType('icon.webp')).toBe('image/webp');
    expect(iconContentType('icon.unknown')).toBe('application/octet-stream');
  });
});

describe('githubOwnerAvatarUrl', () => {
  it('reads the owner avatar URL from GitHub repository metadata', async () => {
    const runGh = vi.fn(async () => 'https://avatars.githubusercontent.com/u/123?s=64\n');
    await expect(githubOwnerAvatarUrl('Energy-Control-Power-Lockout/ECPL-Lockstep', runGh)).resolves.toBe('https://avatars.githubusercontent.com/u/123?s=64');
    expect(runGh).toHaveBeenCalledWith(['api', 'repos/Energy-Control-Power-Lockout/ECPL-Lockstep', '--jq', '.owner.avatar_url']);
  });

  it('rejects non-GitHub image URLs from metadata', async () => {
    await expect(githubOwnerAvatarUrl('owner/repo', async () => 'https://example.com/logo.png')).resolves.toBeNull();
  });
});

describe('resolveRepoIcon', () => {
  it('returns null when GitHub has no owner avatar', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const result = await resolveRepoIcon('owner/repo', fetchFn, async () => null);
    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches the owner avatar returned by GitHub', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }));
    const result = await resolveRepoIcon('owner/repo', fetchFn, async () => 'https://avatars.githubusercontent.com/u/123?s=64');
    expect(result).toEqual({ contentType: 'image/png', data: Buffer.from([1, 2, 3]) });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://avatars.githubusercontent.com/u/123?s=64',
      expect.objectContaining({ headers: { 'User-Agent': 'Wayfinder' } }),
    );
  });
});
