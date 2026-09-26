import { describe, expect, it } from 'vitest';

import { bindPan } from './pan.js';
import type { PanSurface } from './pan.js';

class FakeSurface extends EventTarget implements PanSurface {
  scrollLeft = 500;
  scrollTop = 300;
  readonly classes = new Set<string>();
  readonly classList = {
    add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
  };
  captured: number | null = null;
  setPointerCapture(pointerId: number): void {
    this.captured = pointerId;
  }
}

function pointer(surface: FakeSurface, type: string, clientX: number, clientY: number, button = 0): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), { button, clientX, clientY, pointerId: 7 });
  surface.dispatchEvent(event);
  return event;
}

function panned(skip = false): FakeSurface {
  const surface = new FakeSurface();
  bindPan(surface, () => skip);
  return surface;
}

describe('bindPan', () => {
  it('scrolls against the drag, so the map follows the pointer', () => {
    const surface = panned();
    pointer(surface, 'pointerdown', 100, 100);
    pointer(surface, 'pointermove', 60, 130);
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([540, 270]);
    expect(surface.captured).toBe(7);
    expect(surface.classes.has('is-panning')).toBe(true);
  });

  it('claims the press so no text selection or native drag starts and cancels the pan', () => {
    const surface = panned();
    expect(pointer(surface, 'pointerdown', 100, 100).defaultPrevented).toBe(true);
  });

  it('stops on pointerup and pointercancel', () => {
    for (const end of ['pointerup', 'pointercancel']) {
      const surface = panned();
      pointer(surface, 'pointerdown', 100, 100);
      pointer(surface, end, 100, 100);
      pointer(surface, 'pointermove', 0, 0);
      expect([surface.scrollLeft, surface.scrollTop]).toEqual([500, 300]);
      expect(surface.classes.has('is-panning')).toBe(false);
    }
  });

  it('leaves a press on a card alone so the card still clicks', () => {
    const surface = panned(true);
    const down = pointer(surface, 'pointerdown', 100, 100);
    pointer(surface, 'pointermove', 0, 0);
    expect(down.defaultPrevented).toBe(false);
    expect(surface.captured).toBeNull();
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([500, 300]);
  });

  it('ignores buttons other than the primary one', () => {
    const surface = panned();
    const down = pointer(surface, 'pointerdown', 100, 100, 2);
    pointer(surface, 'pointermove', 0, 0);
    expect(down.defaultPrevented).toBe(false);
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([500, 300]);
  });
});
