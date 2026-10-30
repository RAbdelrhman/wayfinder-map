import { mapAppLink, parseMapAppLink } from '../../../src/appLinks';
import { objectWebPath, parseObjectAppLink } from '../../../src/objectLinks';

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  const object = parseObjectAppLink(path);
  if (object) return objectWebPath(object);
  const target = parseMapAppLink(path);
  if (target) return mapAppLink(target.repo, target.mapNumber).replace('wayfinder://', '/');
  try {
    const url = new URL(path);
    return url.hostname === 'expo-sharing' || url.protocol === 'wayfinder:' ? '/' : path;
  } catch {
    return path;
  }
}
