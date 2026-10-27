import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

const source = readFileSync('prototypes/canvas/device.js', 'utf8');

describe('shared phone presentation', () => {
  it('fits on load and resize, never enlarges or flips in a tiny window, and initializes once', () => {
    const browser = new Window();
    try {
      browser.document.body.className = 'viz-root';
      const root = browser.document.createElement('main');
      root.id = 'app';
      root.setAttribute('data-canvas-device', 'phone');
      browser.document.body.append(root);
      const content = browser.document.createElement('span');
      content.id = 'canvas-device-style';
      root.append(content);
      browser.innerWidth = 1280;
      browser.innerHeight = 1000;
      browser.eval(source);
      const scale = (): number => Number(browser.document.documentElement.style.getPropertyValue('--device-fit'));
      expect(scale()).toBe(1);
      browser.innerHeight = 400;
      browser.dispatchEvent(new browser.Event('resize'));
      expect(scale()).toBeCloseTo(376 / 844);
      browser.innerWidth = 100;
      browser.innerHeight = 1000;
      browser.dispatchEvent(new browser.Event('resize'));
      expect(scale()).toBeCloseTo(76 / 390);
      browser.innerHeight = 10;
      browser.dispatchEvent(new browser.Event('resize'));
      expect(scale()).toBe(0);
      browser.eval(source);
      expect(browser.document.head.querySelectorAll('style[data-canvas-device-style="phone"]')).toHaveLength(1);
      expect(browser.document.getElementById('canvas-device-style')).toBe(content);
      expect(root.childElementCount).toBe(1);
      expect(root.hasAttribute('tabindex')).toBe(false);
    } finally { browser.close(); }
  });

  it.each([null, 'tablet', 'watch', 'desktop', ''])('preserves unmarked and other device pages (%s)', (preset) => {
    const browser = new Window();
    try {
      browser.document.body.className = 'viz-root';
      const root = browser.document.createElement('main');
      root.id = 'app';
      if (preset !== null) root.setAttribute('data-canvas-device', preset);
      browser.document.body.append(root);
      browser.eval(source);
      expect(browser.document.head.querySelector('style[data-canvas-device-style]')).toBeNull();
      expect(browser.document.documentElement.style.getPropertyValue('--device-fit')).toBe('');
    } finally { browser.close(); }
  });
});
