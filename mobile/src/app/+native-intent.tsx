import { mapAppLink, parseMapAppLink } from '../../../src/appLinks';

/** Normalize the same native destination on cold starts and foreground URL events. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (!/^wayfinder:/i.test(path)) return path;
  const target = parseMapAppLink(path);
  return target === null ? '/' : mapAppLink(target.repo, target.mapNumber).replace('wayfinder://', '/');
}
