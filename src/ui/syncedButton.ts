/**
 * The topbar's Synced button is just its refresh icon. "Synced 2m ago" lives in the tooltip and the
 * accessible name, and the button hides until there is a time to show.
 */
export function setSyncedLabel(button: HTMLElement, text: string): void {
  const label = button.querySelector<HTMLElement>('.synced-label');
  if (label !== null) label.textContent = text;
  button.title = text === '' ? 'Resync from GitHub' : `${text} · Click to resync`;
  button.setAttribute('aria-label', text === '' ? 'Resync from GitHub' : `Resync from GitHub. ${text}`);
}

const spins = new WeakMap<HTMLElement, number>();

/** Starts the icon spinning. Stopping lets the current turn finish, so the icon never snaps back mid-turn. */
export function setSyncedBusy(button: HTMLElement, busy: boolean): void {
  const turn = (spins.get(button) ?? 0) + 1;
  spins.set(button, turn);
  const svg = button.querySelector('.synced-icon svg');
  if (busy || svg === null || !button.classList.contains('is-busy')) {
    button.classList.toggle('is-busy', busy);
    return;
  }
  const stop = (): void => {
    if (spins.get(button) === turn) button.classList.remove('is-busy');
  };
  svg.addEventListener('animationiteration', stop, { once: true });
  // Reduced motion has no spin to finish, and a lost event must not leave it spinning.
  window.setTimeout(stop, 1000);
}
