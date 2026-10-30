/** Portable identity rules shared by the server and native viewer. */
export function prototypeTicketNumber(branch: string): number | null {
  const match = /^prototype\/(\d+)(?:-|$)/.exec(branch);
  return match === null ? null : Number(match[1]);
}

export function canvasEntries(openable: readonly string[], files: readonly string[]): string[] {
  const all = new Set(files);
  return [...new Set(openable.filter(file => /(?:^|\/)index\.html$/i.test(file) && all.has(file.replace(/index\.html$/i, 'config.js'))))];
}
