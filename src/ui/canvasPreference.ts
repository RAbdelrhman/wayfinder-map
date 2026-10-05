export type CanvasSize = 'full' | 'pane' | 'float';
const KEY = 'wayfinder-map:canvas-size';

export function isCanvasSize(value: unknown): value is CanvasSize {
  return value === 'full' || value === 'pane' || value === 'float';
}

export function canvasSize(): CanvasSize {
  try {
    const value = localStorage.getItem(KEY);
    return isCanvasSize(value) ? value : 'full';
  } catch {
    return 'full';
  }
}

export function saveCanvasSize(size: CanvasSize): void {
  try {
    localStorage.setItem(KEY, size);
  } catch {
    /* Session still works without storage. */
  }
}
