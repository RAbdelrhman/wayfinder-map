export function updateChannel(arch: string): 'latest-arm64' | 'latest-x64' {
  return arch === 'arm64' ? 'latest-arm64' : 'latest-x64';
}

export function shouldEnableUpdates(packaged: boolean, version: string, stableRelease: boolean): boolean {
  return packaged && stableRelease && !version.includes('-');
}
