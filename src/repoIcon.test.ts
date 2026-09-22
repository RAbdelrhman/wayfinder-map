import { describe, expect, it } from 'vitest';
import { iconContentType, resolveRepoIcon } from './repoIcon.js';

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

describe('resolveRepoIcon', () => {
  it('returns null when no candidate exists locally or remotely', async () => {
    const fakeFetch = async () => new Response('Not found', { status: 404 });
    const result = await resolveRepoIcon('owner/repo', undefined, undefined, null, fakeFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it('fetches remote icon if candidate is found on GitHub', async () => {
    const fakeFetch = async (url: string | URL | Request) => {
      if (String(url).includes('public/favicon.ico')) {
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };
    const result = await resolveRepoIcon('owner/repo', undefined, undefined, null, fakeFetch as unknown as typeof fetch);
    expect(result).not.toBeNull();
    expect(result?.contentType).toBe('image/x-icon');
    expect(result?.data).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('checks the repository logo locations used by ECPL-style Next apps', async () => {
    const requested: string[] = [];
    const fakeFetch = async (url: string | URL | Request) => {
      requested.push(String(url));
      if (String(url).endsWith('/public/ecpl_logo.png')) {
        return new Response(new Uint8Array([5, 6, 7]), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const result = await resolveRepoIcon('owner/repo', undefined, undefined, null, fakeFetch as unknown as typeof fetch);

    expect(result?.contentType).toBe('image/png');
    expect(result?.data).toEqual(Buffer.from([5, 6, 7]));
    expect(requested).toContain('https://raw.githubusercontent.com/owner/repo/HEAD/public/ecpl_logo.png');
  });
});
