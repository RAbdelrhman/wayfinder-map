/** What panning needs from the scroll container. An HTMLElement has all of it. */
export interface PanSurface extends EventTarget {
  scrollLeft: number;
  scrollTop: number;
  readonly classList: Pick<DOMTokenList, 'add' | 'remove'>;
  setPointerCapture(pointerId: number): void;
}

/**
 * Drag with the primary button to pan a scroll container. A press that `skip` accepts (a card)
 * is left alone so it still clicks. Any other press is claimed with preventDefault. Otherwise it
 * starts a text selection, and a press on selected text starts a native drag, which cancels the
 * pointer a few pixels in and stops the pan.
 */
export function bindPan(surface: PanSurface, skip: (target: EventTarget | null) => boolean): void {
  let from: { x: number; y: number; left: number; top: number } | null = null;

  surface.addEventListener('pointerdown', (event) => {
    const pointer = event as PointerEvent;
    if (pointer.button !== 0 || skip(pointer.target)) return;
    pointer.preventDefault();
    from = { x: pointer.clientX, y: pointer.clientY, left: surface.scrollLeft, top: surface.scrollTop };
    surface.classList.add('is-panning');
    surface.setPointerCapture(pointer.pointerId);
  });

  surface.addEventListener('pointermove', (event) => {
    if (from === null) return;
    const pointer = event as PointerEvent;
    surface.scrollLeft = from.left - (pointer.clientX - from.x);
    surface.scrollTop = from.top - (pointer.clientY - from.y);
  });

  for (const type of ['pointerup', 'pointercancel']) {
    surface.addEventListener(type, () => {
      from = null;
      surface.classList.remove('is-panning');
    });
  }
}
