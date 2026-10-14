/*
  Where the tour's Spotlight card goes (#296): beside, below or above the highlighted target,
  never over it. On a narrow screen the card is a full-width sheet, at the bottom unless only
  the top has room. When no side has room for the whole card, it takes the tallest free side
  and scrolls inside.
*/

export interface Box { x: number; y: number; w: number; h: number }

export interface CardPlacement {
  x: number;
  y: number;
  w: number;
  /** Set when the card is cut to this height and scrolls. */
  maxH: number | null;
}

export interface PlacementOptions {
  /** The window's size. */
  view: { w: number; h: number };
  /** True when the card is a full-width sheet (narrow screens). */
  sheet: boolean;
  /** The card's height when laid out at a given width. */
  heightAt: (width: number) => number;
}

export const CARD_WIDTH = 360;
/** The narrowest a card beside its target may get before that side counts as full. */
const MIN_CARD_WIDTH = 260;
const GAP = 14;

type Side = 'below' | 'above' | 'right' | 'left';

/** The free area on one side of the target, inside the window's margin. */
function region(side: Side, hole: Box, view: { w: number; h: number }, margin: number): Box {
  const right = view.w - margin;
  const bottom = view.h - margin;
  if (side === 'below') { const y = hole.y + hole.h + GAP; return { x: margin, y, w: right - margin, h: bottom - y }; }
  if (side === 'above') return { x: margin, y: margin, w: right - margin, h: hole.y - GAP - margin };
  if (side === 'right') { const x = hole.x + hole.w + GAP; return { x, y: margin, w: right - x, h: bottom - margin }; }
  return { x: margin, y: margin, w: hole.x - GAP - margin, h: bottom - margin };
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(value, high));

export function placeCard(hole: Box, { view, sheet, heightAt }: PlacementOptions): CardPlacement {
  const margin = sheet ? 8 : 12;
  // A wide target reads best with the card under its right end; otherwise beside it.
  const sides: Side[] = sheet ? ['below', 'above'] : hole.w > 480 ? ['below', 'right', 'left', 'above'] : ['right', 'left', 'below', 'above'];
  const options = sides.map((side) => {
    const free = region(side, hole, view, margin);
    const w = sheet ? view.w - 2 * margin : Math.min(CARD_WIDTH, free.w);
    return { side, free, w };
  }).filter((option) => option.free.h > 0 && option.w >= (sheet ? 0 : MIN_CARD_WIDTH));

  const position = (side: Side, free: Box, w: number, h: number): { x: number; y: number } => {
    if (sheet) return { x: margin, y: side === 'below' ? free.y + free.h - h : free.y };
    if (side === 'right' || side === 'left') {
      const x = side === 'right' ? free.x : free.x + free.w - w;
      return { x, y: clamp(hole.y, free.y, free.y + free.h - h) };
    }
    const x = clamp(hole.w > 480 ? hole.x + hole.w - w : hole.x, free.x, free.x + free.w - w);
    return { x, y: side === 'below' ? free.y : free.y + free.h - h };
  };

  for (const { side, free, w } of options) {
    const h = heightAt(w);
    if (h <= free.h) return { ...position(side, free, w, h), w, maxH: null };
  }
  // No side holds the whole card: the tallest one gets it, cut to fit, scrolling inside.
  const tallest = options.reduce<(typeof options)[number] | null>((best, option) => (best === null || option.free.h > best.free.h ? option : best), null);
  if (tallest === null) return { x: margin, y: margin, w: Math.min(CARD_WIDTH, view.w - 2 * margin), maxH: null };
  return { ...position(tallest.side, tallest.free, tallest.w, tallest.free.h), w: tallest.w, maxH: tallest.free.h };
}

/** The part of `element` that can be seen: its box cut by every scrolling or clipping ancestor and the window. */
export function visibleBox(element: Element, view: Window): Box {
  let { left, top, right, bottom } = element.getBoundingClientRect();
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const style = view.getComputedStyle(parent);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const clip = parent.getBoundingClientRect();
    left = Math.max(left, clip.left);
    top = Math.max(top, clip.top);
    right = Math.min(right, clip.right);
    bottom = Math.min(bottom, clip.bottom);
  }
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, view.innerWidth);
  bottom = Math.min(bottom, view.innerHeight);
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
}
