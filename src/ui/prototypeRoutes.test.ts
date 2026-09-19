import { describe, expect, it } from 'vitest';

import {
  createMapPrompt,
  desktopHash,
  desktopStateFromHash,
  prototypeHash,
  prototypeStepFromHash,
} from './prototypeRoutes.js';

describe('prototype routes', () => {
  it.each(['recent', 'browse', 'repository', 'map', 'create', 'desktop', 'help'] as const)('round-trips %s', (step) => {
    expect(prototypeStepFromHash(prototypeHash(step))).toBe(step);
  });

  it('opens Recent for an unknown, legacy, or absent hash', () => {
    expect(prototypeStepFromHash('')).toBe('recent');
    expect(prototypeStepFromHash('#home')).toBe('recent');
    expect(prototypeStepFromHash('#elsewhere')).toBe('recent');
  });

  it('composes the simple T3 Code map prompt', () => {
    expect(createMapPrompt('RAbdelrhman/wayfinder-map', '  Ship the desktop app.  ')).toBe(
      'Repository: RAbdelrhman/wayfinder-map\n\nWhat I want to accomplish:\nShip the desktop app.',
    );
  });

  it.each(['menu', 'loading', 'restored', 'missing-gh', 'signed-out', 'error', 'quit-confirm', 'stopped'] as const)(
    'round-trips the %s desktop state',
    (state) => {
      expect(prototypeStepFromHash(desktopHash(state))).toBe('desktop');
      expect(desktopStateFromHash(desktopHash(state))).toBe(state);
    },
  );

  it('falls back to the desktop menu for an unknown state', () => {
    expect(desktopStateFromHash('#desktop/unknown')).toBe('menu');
  });
});
