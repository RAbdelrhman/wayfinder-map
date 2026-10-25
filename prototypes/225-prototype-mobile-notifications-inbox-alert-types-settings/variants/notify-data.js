/*
  Fake inbox history for #225, as the paired desktop would sync it. Loaded after mobile-data.js.
  Labels are the desktop's own: KIND_LABEL (src/ui/notifications.ts) for alerts and pushes,
  NOTIFICATION_LABEL (src/ui/settings.ts) for the switches, eventSummary (src/ui/mapEventInbox.ts) for activity.
*/
window.NOTIFY = {
  // src/notificationTypes.ts NOTIFICATION_KINDS order. push: false = never pushed (Ready to start).
  kinds: [
    { kind: 'unblocked', label: 'Ready to start', setting: 'Tickets become ready', hint: 'An unblocked ticket can be started from the map.', push: false, icon: 'arrow' },
    { kind: 'threadWaiting', label: 'T3 Code needs you', setting: 'T3 Code needs you', hint: 'A thread is waiting for input or approval.', push: true, icon: 'reply' },
    { kind: 'failingCi', label: 'CI is failing', setting: 'CI is failing', hint: 'A ticket PR has failing checks.', push: true, icon: 'xcircle' },
    { kind: 'reviewReady', label: 'PR ready for review', setting: 'A PR is ready for review', hint: 'Checks passed and the PR is waiting for review.', push: true, icon: 'pr' },
    { kind: 'handOffError', label: 'Hand-off error', setting: 'A hand-off has an error', hint: 'T3 Code reported an error, including a usage limit.', push: true, icon: 'alert' },
    { kind: 'stalled', label: 'Ticket stalled', setting: 'A ticket stalled', hint: 'A ticket crossed one of the stall settings.', push: true, icon: 'clock' },
    { kind: 'prototypeReady', label: 'Prototype ready to review', setting: 'A prototype is ready', hint: 'A prototype branch or snapshot changed.', push: true, icon: 'beaker' },
  ],
  map: { repo: 'RAbdelrhman/wayfinder-map', number: 217, title: 'A Wayfinder mobile app' },
  syncedAt: '9:12 AM',
  // Newest first. type 'needs' = a needs-you alert; 'activity' = map activity (never pushed).
  rows: [
    { id: 'n1', type: 'needs', kind: 'threadWaiting', ticket: 223, title: 'Prototype the following screens: sign-in, repos, map view, ticket detail', at: 'now', day: 'Today', clock: '9:41', read: false },
    { id: 'n2', type: 'needs', kind: 'failingCi', ticket: 228, title: 'Sign in to GitHub on the phone', at: '18 min ago', day: 'Today', clock: '9:23', read: false },
    { id: 'a1', type: 'activity', event: 'ticket-next', ticket: 227, summary: '#227 Scaffold the Expo app in mobile/ with shared map code is ready to start', at: '25 min ago', day: 'Today', clock: '9:16', read: false, icon: 'arrow' },
    { id: 'a2', type: 'activity', event: 'pr-merged', ticket: 221, summary: 'PR #263 merged for #221 Can prototype canvases render on a phone?', at: '40 min ago', day: 'Today', clock: '9:01', read: false, away: true, icon: 'merge' },
    { id: 'n3', type: 'needs', kind: 'handOffError', ticket: 220, title: 'What does T3 Code expose for watching a running thread from another device?', at: '2 h ago', day: 'Today', clock: '7:38', read: false },
    { id: 'n4', type: 'needs', kind: 'reviewReady', ticket: 219, title: 'Which push path can deliver needs-you alerts to a phone?', at: '3 h ago', day: 'Today', clock: '6:50', read: true },
    { id: 'n5', type: 'needs', kind: 'stalled', ticket: 152, title: 'Calibrate the effort tiers', at: 'Yesterday', day: 'Yesterday', clock: '4:12 PM', read: true, map: { repo: 'RAbdelrhman/wayfinder-map', number: 140, title: 'Auto model picking' } },
    { id: 'a3', type: 'activity', event: 'ticket-closed', ticket: 221, summary: '#221 Can prototype canvases render on a phone? closed', at: 'Yesterday', day: 'Yesterday', clock: '3:55 PM', read: true, icon: 'check' },
  ],
};

Object.assign(Kit.icons, {
  reply: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11h.01M13 11h.01M17 11h.01"/>',
  xcircle: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  pr: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7"/><path d="M18 15.5V9a3 3 0 0 0-3-3h-3"/><path d="m14 3.5-2.5 2.5 2.5 2.5"/>',
  alert: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  merge: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7"/><path d="M6 8.5a6 6 0 0 0 6 3.5h3.5"/>',
  cloudoff: '<path d="m3 3 18 18"/><path d="M8.5 6.3A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.4 7.2"/><path d="M17 19H7a5 5 0 0 1-1.6-9.7"/>',
});
