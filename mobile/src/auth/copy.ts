import type { FailureReason } from './deviceFlow';

// "That code expired" is the wording the user saw in the prototype; the other reasons follow its shape.
export const failureCopy: Record<FailureReason, { title: string; body: string }> = {
  expired: { title: 'That code expired', body: 'GitHub codes last 15 minutes. Get a new one and try again.' },
  denied: { title: 'Sign-in was cancelled', body: 'You said no on GitHub. Get a new code if you want to try again.' },
  rejected: {
    title: 'GitHub turned this down',
    body: 'This build of Wayfinder isn’t set up for GitHub sign-in. Get a new code to try again; if it keeps failing, see docs/mobile-sign-in.md.',
  },
  network: { title: 'Couldn’t reach GitHub', body: 'Check your connection, then get a new code.' },
  storage: {
    title: 'Couldn’t save the token',
    body: 'Wayfinder couldn’t store the token in this phone’s secure storage. Get a new code to try again.',
  },
};

/** "14:52" for the time left on a code; never negative. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
