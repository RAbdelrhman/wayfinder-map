import { describe, expect, it } from 'vitest';

import { clickedOutside } from './outsideClick.js';

const target = (): EventTarget => new EventTarget();

describe('clickedOutside', () => {
  it('is false when a container was on the path at dispatch, even if the target has since been detached', () => {
    const anchor = target();
    const detachedLabel = target();
    expect(clickedOutside({ composedPath: () => [detachedLabel, anchor] }, anchor)).toBe(false);
  });

  it('is true when no container is on the path', () => {
    const anchor = target();
    expect(clickedOutside({ composedPath: () => [target(), target()] }, anchor)).toBe(true);
  });

  it('checks every container', () => {
    const sidebar = target();
    const topbar = target();
    expect(clickedOutside({ composedPath: () => [target(), topbar] }, sidebar, topbar)).toBe(false);
  });
});
