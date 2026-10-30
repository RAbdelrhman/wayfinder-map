import { mapAppLink, parseMapAppLink } from '../../../src/appLinks';

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  const target = parseMapAppLink(path);
  if (target) return mapAppLink(target.repo, target.mapNumber).replace('wayfinder://', '/');
  try {
    const url = new URL(path);
    return url.hostname === 'expo-sharing' || url.protocol === 'wayfinder:' ? '/' : path;
  } catch {
    return path;
  }
}
