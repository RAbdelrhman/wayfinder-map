import { describe, expect, it } from 'vitest';

import { prototypeHash, prototypeStepFromHash } from './prototypeRoutes.js';

describe('prototype routes', () => {
  it.each(['recent', 'browse', 'repository', 'map', 'help'] as const)('round-trips %s', (step) => {
    expect(prototypeStepFromHash(prototypeHash(step))).toBe(step);
  });

  it('opens Recent for an unknown, legacy, or absent hash', () => {
    expect(prototypeStepFromHash('')).toBe('recent');
    expect(prototypeStepFromHash('#home')).toBe('recent');
    expect(prototypeStepFromHash('#elsewhere')).toBe('recent');
  });
});
