import { spawn } from 'node:child_process';

type ClipboardCommand = readonly [command: string, args: readonly string[]];

/** Clipboard writers to try in order. Linux has no single one, so try Wayland, then the two X11 tools. */
export function clipboardCommands(platform: NodeJS.Platform): readonly ClipboardCommand[] {
  if (platform === 'win32') return [['powershell', ['-NoProfile', '-NonInteractive', '-Command', '$input | Set-Clipboard']]];
  if (platform === 'darwin') return [['pbcopy', []]];
  return [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
  ];
}

function pipeTo([command, args]: ClipboardCommand, text: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${String(code)}`))));
    child.stdin.end(text, 'utf8');
  });
}

/** Put `text` on the system clipboard using whatever the platform ships with. */
export async function copyToClipboard(text: string): Promise<void> {
  const errors: string[] = [];
  for (const candidate of clipboardCommands(process.platform)) {
    try {
      await pipeTo(candidate, text);
      return;
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  throw new Error(errors.join('; '));
}
