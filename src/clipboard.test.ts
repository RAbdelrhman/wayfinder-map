import { describe, expect, it } from 'vitest';

import { clipboardCommands } from './clipboard.js';

describe('clipboardCommands', () => {
  it('tries Wayland first, then both X11 tools, on Linux', () => {
    expect(clipboardCommands('linux').map(([command]) => command)).toEqual(['wl-copy', 'xclip', 'xsel']);
  });

  it('has one writer on Windows and macOS', () => {
    expect(clipboardCommands('win32').map(([command]) => command)).toEqual(['powershell']);
    expect(clipboardCommands('darwin').map(([command]) => command)).toEqual(['pbcopy']);
  });
});
