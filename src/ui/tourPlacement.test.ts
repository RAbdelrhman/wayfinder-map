import { describe, expect, it } from 'vitest';

import { CARD_WIDTH, placeCard } from './tourPlacement.js';
import type { Box, CardPlacement } from './tourPlacement.js';

/** A card whose text wraps taller as it narrows, like the real one. */
const heightAt = (width: number): number => 160 + Math.round(36_000 / width);

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const cardBox = (spot: CardPlacement): Box => ({ x: spot.x, y: spot.y, w: spot.w, h: spot.maxH ?? heightAt(spot.w) });

describe('placeCard', () => {
  it('puts the card beside ticket #6 at 1280×800 instead of over it (#238)', () => {
    const hole = { x: 474, y: 246, w: 196, h: 118 };
    const spot = placeCard(hole, { view: { w: 1280, h: 800 }, sheet: false, heightAt });
    expect(spot).toMatchObject({ x: 684, y: 246, w: CARD_WIDTH, maxH: null });
  });

  it('puts the card under the right end of a wide target when it fits there', () => {
    const hole = { x: 300, y: 60, w: 620, h: 200 };
    const spot = placeCard(hole, { view: { w: 1280, h: 800 }, sheet: false, heightAt });
    expect(spot).toMatchObject({ x: 920 - CARD_WIDTH, y: 274, maxH: null });
  });

  it('narrows the card to fit beside a target that leaves no room above or below (the planning panel)', () => {
    const hole = { x: 302, y: 166, w: 732, h: 404 };
    const spot = placeCard(hole, { view: { w: 1280, h: 800 }, sheet: false, heightAt });
    expect(spot.w).toBe(302 - 14 - 12);
    expect(spot.x + spot.w).toBe(302 - 14);
    expect(spot.maxH).toBeNull();
  });

  it('keeps the narrow-screen sheet at the bottom when it fits under the target', () => {
    const spot = placeCard({ x: 8, y: 60, w: 374, h: 200 }, { view: { w: 390, h: 844 }, sheet: true, heightAt });
    expect(spot).toMatchObject({ x: 8, w: 374, maxH: null });
    expect(spot.y + heightAt(374)).toBe(844 - 8);
  });

  it('moves the sheet to the top when the target is low, as Open in T3 Code is at step 7', () => {
    const spot = placeCard({ x: 18, y: 570, w: 354, h: 70 }, { view: { w: 390, h: 844 }, sheet: true, heightAt });
    expect(spot).toMatchObject({ x: 8, y: 8, maxH: null });
  });

  it('cuts the card to the tallest free side, to scroll inside, when no side holds all of it', () => {
    const spot = placeCard({ x: 2, y: 144, w: 356, h: 458 }, { view: { w: 360, h: 640 }, sheet: true, heightAt });
    expect(spot).toMatchObject({ y: 8, maxH: 144 - 14 - 8 });
  });

  it('never covers the target or leaves the window, wherever the target is', () => {
    const views = [{ w: 1440, h: 900 }, { w: 1280, h: 800 }, { w: 1024, h: 768 }, { w: 900, h: 600 }, { w: 761, h: 700 }];
    for (const view of views) {
      for (let x = 0; x < view.w; x += 60) {
        for (let y = 0; y < view.h; y += 60) {
          for (const [w, h] of [[120, 60], [200, 120], [400, 300], [740, 420], [view.w - x, 80]] as const) {
            const hole = { x, y, w: Math.min(w, view.w - x), h: Math.min(h, view.h - y) };
            const spot = placeCard(hole, { view, sheet: false, heightAt });
            const card = cardBox(spot);
            const where = JSON.stringify({ view, hole, card });
            expect(overlaps(card, hole), where).toBe(false);
            expect(card.x >= 0 && card.y >= 0 && card.x + card.w <= view.w && card.y + card.h <= view.h, where).toBe(true);
          }
        }
      }
    }
  });
});
