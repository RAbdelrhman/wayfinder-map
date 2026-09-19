import { describe, expect, it } from 'vitest';

import { createMapPrompt, prototypeHash, prototypeStepFromHash } from './prototypeRoutes.js';

describe('prototype routes', () => {
  it.each(['recent', 'browse', 'repository', 'map', 'create', 'help'] as const)('round-trips %s', (step) => {
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
});
