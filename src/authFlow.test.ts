import { describe, expect, it } from 'vitest';

import { AuthFlow, parseAuthChallenge } from './authFlow.js';

describe('AuthFlow', () => {
  it('starts idle and can be cancelled without a child process', () => {
    const flow = new AuthFlow();
    expect(flow.snapshot()).toEqual({ status: 'idle', code: null, url: null, error: null });
    flow.cancel();
    expect(flow.snapshot().status).toBe('idle');
  });

  it('extracts the device code and URL from gh output', () => {
    expect(parseAuthChallenge('! First copy your one-time code: 32C0-AA8C\nOpen this URL to continue in your web browser: https://github.com/login/device')).toEqual({
      code: '32C0-AA8C',
      url: 'https://github.com/login/device',
    });
  });
});
