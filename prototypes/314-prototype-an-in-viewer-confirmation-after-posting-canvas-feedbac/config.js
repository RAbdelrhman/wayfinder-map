// #314: how the canvas viewer confirms feedback went to GitHub. Every frame is variants/viewer.html
// on the shipped D4 viewer; ?dir= picks the direction, ?state= the moment.
const FRAME = { width: 1280, height: 800, boardWidth: 440 };
const src = (dir, state, extra = '') => `variants/viewer.html?dir=${dir}&state=${state}${extra}`;
const STATES = [
  ['posting', 'Posting', '', 'The Post button names GitHub before and while it posts. The marks stay put.'],
  ['failed', 'Failed', '', 'GitHub did not answer. The notes stay, with Try again and a link to check the ticket first, since a timeout may still have posted.'],
  ['repost', 'Post the same notes again', '', 'What happens when the person tries to post notes that are already on GitHub.'],
  ['posted', 'Side pane', '&size=pane', 'Posted, in the side pane beside the map.'],
];
const direction = (dir, name, note) => ({
  title: `${dir} · ${name}`,
  note: 'The first frame is the posted state. "Try it" starts at Review: Post fails once, then Try again posts.',
  items: [
    { id: dir, name: `${name} · Posted`, src: src(dir, 'posted'), ...FRAME, note },
    { id: `${dir}1`, name: 'Try it: Review → Post → fail → Try again', src: src(dir, 'review', '&fail=1'), ...FRAME, note: `Interactive. Press Post: it fails once, then Try again posts and shows ${dir}'s confirmation.` },
    ...STATES.map(([state, label, extra, text], i) => ({ id: `${dir}${i + 2}`, name: label, src: src(dir, state, extra), ...FRAME, note: text })),
  ],
});

window.CANVAS = {
  title: 'Confirm posted canvas feedback in the viewer',
  question: 'After you post canvas notes, how should the viewer show that they went to GitHub, where exactly, and that you continue in your T3 Code thread?',
  sampleState: 'The #292 canvas (Keyboard shortcuts) with three notes on option A1; the canvas picture is a stand-in. The comment link is the real first #292 canvas-notes comment.',
  ticket: 314,
  pages: [
    {
      title: 'Directions',
      round: 'Baseline',
      sections: [
        direction('A', 'Receipt in the panel', {
          idea: 'The panel turns into a receipt. Heading "Posted to GitHub · #292", then a "Comment on GitHub" card naming the ticket title, with "View comment on GitHub" linking to the exact comment. Under it, a tinted "Next: continue in T3 Code" block: "Return to your T3 Code thread to continue" and a Copy message for T3 Code button (the comment link in a sentence to paste). What was posted folds away under a disclosure. The toolbar chip reads "Posted to GitHub · #292". If you open Review again on unchanged notes, Post becomes a disabled "Already posted" with the link; changing a note posts an update as a new comment.',
          pros: [
            'Closest to the shipped D4 Posted panel: same place, same close/reopen, small code change',
            'Destination, exact link and next step are all in one place you can reread',
            'Re-posting identical notes is blocked outright, so a double post cannot happen by accident',
            'Copy message works whether or not Wayfinder knows the T3 Code thread',
          ],
          cons: [
            'If the panel is closed (or you are on the Canvas tab in the side pane), only the toolbar chip says it posted',
            'Copy-then-switch is two steps; nothing opens the thread for you',
            'Longest reading of the three: four blocks in a 340 px panel',
          ],
        }),
        direction('B', 'Bar over the canvas', {
          idea: 'The panel closes and a green bar spans the top of the canvas: "Posted to GitHub · #292 — Return to your T3 Code thread to continue. The agent doesn’t see these notes until you tell it." It has View comment (exact link) and Open in T3 Code, the same control Home already uses to open a hand-off’s thread. When Wayfinder has no tracked thread for the ticket, Open in T3 Code becomes Copy link. The bar stays until dismissed; the toolbar chip stays after. Posting identical notes again asks first, in a dialog with Cancel focused: "Post these notes again?"',
          pros: [
            'The loudest confirmation: you see it without the panel, in full window and side pane',
            'One click to the T3 Code thread when the hand-off is tracked, using a control the app already has',
            'A deliberate second copy is still possible, but never by accident',
          ],
          cons: [
            'Covers the top of the canvas until dismissed',
            'Open in T3 Code only works when Wayfinder tracked the hand-off; otherwise it falls back to Copy link',
            'A dialog is heavier than A’s disabled button, and is one more thing to build and test',
            'Closing the panel on post moves your focus away from where you were working',
          ],
        }),
        direction('C', 'Toolbar chip and popover', {
          idea: 'The lightest change. After posting, the panel goes back to the list and the toolbar chip "Posted to GitHub · #292" opens a small popover under it: the ticket title, View comment and Copy link, then "Return to your T3 Code thread to continue." The popover closes on Esc or a click elsewhere; the chip reopens it. While posting, the chip says "Posting to GitHub · #292…"; a failure turns it into "Not posted · #292" with Try again. Review stays disabled on unchanged notes, with "Already on #292" and the link in the panel footer.',
          pros: [
            'Smallest footprint: nothing covers the canvas or replaces the panel',
            'The chip is always visible in full window, so the confirmation is a click away later',
            'Posting state, success and failure all live in one spot',
          ],
          cons: [
            'A popover is easy to dismiss and miss, which is how #292 was double-posted',
            'The side pane has no room for the chip in the toolbar, so it needs its own row there',
            'No step-by-step guidance: one line about T3 Code',
          ],
        }),
        {
          title: 'Review',
          items: [
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text:
                'Sources: src/ui/styles.css (linked directly: tokens --surface-1, --plane, --hairline, --text-*, --state-*, --handoff-*, --accent-*; .vw/.vw-bar, .cf-panel, .cf-gh, .cf-chip, .cf-banner, .cf-ok, .primary/.ghost/.iconbtn/.segmented), src/ui/canvasFeedback.ts (panel, review, posted and toolbar markup copied; post() keeps notes on error), src/ui/canvasViewer.ts (shell), src/server.ts canvas-notes route and src/github.ts postIssueComment (returns the comment html_url, so an exact link is available), src/ui/homeLanding.ts (existing Open in T3 Code via data-open-handoff, reused by B). New pieces are only the p314-* classes in variants/viewer.css.\n\n' +
                'Shared change in all three: Review copy and the Post button name GitHub ("Post to GitHub · #292", "It does not go to your T3 Code thread").\n\n' +
                'Checked (Playwright Chromium, 1280×800, served under the canvas sandbox CSP): every direction in review, posting, posted, failed and repost, full window and side pane, light and dark (42 frames), plus posted at 900×700. No page or console errors. No horizontal overflow in the bar, popover, panel, toolbar or dialog. Text contrast computed against the composited background for every confirmation element (bar, popover, receipt, banner, chip, dialog, panel buttons): all at or above 4.5:1 in both themes.\n\n' +
                'Flows run: Review → Post (fails once) → Try again → posted, in A, B and C. Posting says "Posting to GitHub…" with aria-busy and announces it in a polite live region; failure is a role=alert banner (A), bar (B) or popover (C) with focus on Try again (A, B) or the popover (C); success announces "Posted to GitHub, #292. Return to your T3 Code thread to continue." and moves focus to the receipt heading (A), the bar heading (B) or the popover (C). C: Esc closes the popover and focus returns to the chip; a click outside closes it. B: the post-again check is a native modal dialog with Cancel focused; Esc closes it and focus returns to Post. A: Tab order through the receipt runs close, ticket link, View comment on GitHub, Copy message for T3 Code, What was posted, Start new feedback.\n\n' +
                'Findings fixed during review: C swallowed the first Post click (the outside-click handler repainted under it); C’s repost footer overflowed the 340 px panel; Start new feedback wrapped. Open findings: C’s popover covers part of the panel in the side pane; B’s bar takes about 60 px of canvas until dismissed (wraps to 2 lines at 900 px); Copy link and Copy message are simulated (toast), as the canvas sandbox has no clipboard.\n\n' +
                'Not checked: screen reader output (NVDA/VoiceOver), the floating window size, 200% zoom, touch, Windows high contrast, the installed desktop app.',
            },
          ],
        },
      ],
    },
  ],
};
