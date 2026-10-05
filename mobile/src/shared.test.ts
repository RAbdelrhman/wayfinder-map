import { describe, expect, it } from 'vitest';
import { parseMapBody } from './shared';

describe('shared map logic', () => {
  it('parses a map body with the desktop parser', () => {
    const body = [
      '## Destination',
      '',
      'An Expo Wayfinder app.',
      '',
      '## Decisions so far',
      '',
      '- Code lives in `mobile/`.',
      '',
      '## Fog',
      '',
      '- How the phone reaches the PC.',
    ].join('\n');

    expect(parseMapBody(body)).toEqual({
      destination: 'An Expo Wayfinder app.',
      notes: '',
      decisions: '- Code lives in `mobile/`.',
      fog: '- How the phone reaches the PC.',
      outOfScope: '',
    });
  });
});
