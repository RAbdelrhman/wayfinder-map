/**
 * Whether a click landed outside every container. It reads the event's path rather than
 * `contains(event.target)`: a trigger that re-renders its own markup on click leaves the
 * target detached, and `contains` would call that click outside and close what it opened.
 */
export function clickedOutside(event: Pick<Event, 'composedPath'>, ...containers: readonly EventTarget[]): boolean {
  const path = event.composedPath();
  return !containers.some((container) => path.includes(container));
}
