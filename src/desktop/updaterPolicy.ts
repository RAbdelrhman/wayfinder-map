export function updateChannel(arch: string): 'latest-arm64' | 'latest-x64' {
  return arch === 'arm64' ? 'latest-arm64' : 'latest-x64';
}

export function shouldEnableUpdates(packaged: boolean, version: string, signedRelease: boolean): boolean {
  return packaged && signedRelease && !version.includes('-');
}
