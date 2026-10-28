export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    return new URL(path).hostname === 'expo-sharing' ? '/' : path;
  } catch {
    return path;
  }
}
