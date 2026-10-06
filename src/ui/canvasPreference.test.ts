import { afterEach, expect, it, vi } from 'vitest';
import { canvasSize, saveCanvasSize } from './canvasPreference.js';

afterEach(() => vi.unstubAllGlobals());

it('defaults to full window and remembers all three approved opening sizes', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  expect(canvasSize()).toBe('full');
  for (const size of ['pane', 'float', 'full'] as const) {
    saveCanvasSize(size);
    expect(canvasSize()).toBe(size);
  }
  values.set('wayfinder-map:canvas-size', 'route');
  expect(canvasSize()).toBe('full');
});

it('keeps the viewer usable when browser storage is unavailable', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  });
  expect(canvasSize()).toBe('full');
  expect(() => saveCanvasSize('pane')).not.toThrow();
});
