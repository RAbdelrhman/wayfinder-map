import { Directory, File, Paths } from 'expo-file-system';
import type { CanvasStorage } from './download';

export function canvasFiles(login: string, repo: string, map: number, ticket: number, revision: string): CanvasStorage {
  if (!/^[a-z\d-]+$/i.test(login) || !/^[\w.-]+\/[\w.-]+$/.test(repo)
    || !Number.isSafeInteger(map) || map < 1 || !Number.isSafeInteger(ticket) || ticket < 1
    || !/^(?:[a-f\d]{40}|latest)$/i.test(revision)) throw new Error('Invalid canvas location.');
  const root = new Directory(Paths.cache, 'wayfinder-canvases', login.toLowerCase(),
    repo.toLowerCase().replace('/', '--'), String(map), String(ticket), revision);
  const file = (path: string) => {
    if (!path || /[\\%?#:]/.test(path) || [...path].some(character => character.charCodeAt(0) < 32)
      || path.split('/').some(part => !part || part === '.' || part === '..'))
      throw new Error('Invalid canvas file path.');
    return new File(root, path);
  };
  return {
    has: path => file(path).exists,
    text: path => file(path).text(),
    base64: path => file(path).base64(),
    write(path, contents) {
      const target = file(path);
      target.parentDirectory.create({ intermediates: true, idempotent: true });
      target.create({ overwrite: true });
      target.write(contents);
    },
    uri: path => path ? file(path).uri : `${root.uri.replace(/\/$/, '')}/`,
  };
}

export function removeCanvasFiles(login: string, repo: string, map: number, ticket: number): void {
  const location = canvasFiles(login, repo, map, ticket, 'latest').uri('');
  const root = new Directory(location).parentDirectory;
  if (root.exists) root.delete();
}
