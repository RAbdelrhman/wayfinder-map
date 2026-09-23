import { describe, expect, it } from 'vitest';

import { homeContinueCardMarkup, homeErrorMarkup, homeLoadingMarkup } from './homeLanding.js';

describe('Home loading and error states', () => {
  it('renders loading placeholders for the three Home sections and progress', () => {
    const markup = homeLoadingMarkup();

    expect(markup).toContain('aria-label="Loading Home"');
    expect(markup).toContain('home-skeleton-card');
    expect(markup).toContain('home-skeleton-progress');
    expect(markup).toContain('Continue');
    expect(markup).toContain('In flight');
    expect(markup).toContain('Repositories');
  });

  it('shows the empty Destination sketch without an in-card create action', () => {
    const markup = homeContinueCardMarkup(null, true);

    expect(markup).toContain('destination-sketch');
    expect(markup).toContain('Maps you open will be ready here.');
    expect(markup).not.toContain('<a ');
    expect(markup).not.toContain('<button ');
  });

  it('blocks Continue while signed out and preserves cached repository links on error', () => {
    const signedOut = homeContinueCardMarkup(null, false);
    const error = homeErrorMarkup('GitHub is unavailable.', ['octo/wayfinder']);

    expect(signedOut).toContain('Account needed');
    expect(signedOut).toContain('Sign in to continue');
    expect(error).toContain('role="alert"');
    expect(error).toContain('GitHub is unavailable.');
    expect(error).toContain('href="/repos/octo/wayfinder"');
  });
});
