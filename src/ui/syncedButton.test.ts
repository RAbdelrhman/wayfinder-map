// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSyncedBusy, setSyncedLabel } from './syncedButton.js';

function button(): HTMLButtonElement {
  const element = document.createElement('button');
  element.innerHTML = '<span class="synced-icon"><svg></svg></span><span class="synced-label"></span>';
  return element;
}

describe('the Synced button', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the time in the tooltip and the accessible name', () => {
    const synced = button();
    setSyncedLabel(synced, 'Synced 2m ago');
    expect(synced.querySelector('.synced-label')?.textContent).toBe('Synced 2m ago');
    expect(synced.title).toBe('Synced 2m ago · Click to resync');
    expect(synced.getAttribute('aria-label')).toBe('Resync from GitHub. Synced 2m ago');
    setSyncedLabel(synced, '');
    expect(synced.title).toBe('Resync from GitHub');
    expect(synced.getAttribute('aria-label')).toBe('Resync from GitHub');
  });

  it('finishes the current turn before it stops spinning', () => {
    const synced = button();
    setSyncedBusy(synced, true);
    expect(synced.classList.contains('is-busy')).toBe(true);
    setSyncedBusy(synced, false);
    expect(synced.classList.contains('is-busy')).toBe(true);
    synced.querySelector('svg')?.dispatchEvent(new Event('animationiteration'));
    expect(synced.classList.contains('is-busy')).toBe(false);
  });

  it('stops anyway when the turn never reports, and keeps spinning for a newer sync', () => {
    const synced = button();
    setSyncedBusy(synced, true);
    setSyncedBusy(synced, false);
    vi.advanceTimersByTime(1000);
    expect(synced.classList.contains('is-busy')).toBe(false);

    setSyncedBusy(synced, true);
    setSyncedBusy(synced, false);
    setSyncedBusy(synced, true);
    vi.advanceTimersByTime(1000);
    expect(synced.classList.contains('is-busy')).toBe(true);
  });
});
