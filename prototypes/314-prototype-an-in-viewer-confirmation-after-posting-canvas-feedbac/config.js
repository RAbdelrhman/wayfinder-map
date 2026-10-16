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

// Round 2 remixes: the same frames as a direction, built from B with A's Copy message.
const REMIX_STATES = [
  ['done', 'After the click', '&t3=done', 'What the bar says once the button has done its job.'],
  ['nothread', 'No tracked thread', '&thread=0', 'Wayfinder doesn’t know this ticket’s T3 Code thread: the button is A’s Copy message for T3 Code.'],
  ['pane', 'Side pane', '&size=pane', 'Posted, in the side pane beside the map.'],
  ['repost', 'Post the same notes again', '', 'Unchanged from B: a dialog asks before posting a second copy.'],
];
const remix = (id, name, base, note) => ({
  title: `${id} · ${name}`,
  note: `Based on B and A. "Try it" starts at Review: Post, then use the bar's button.`,
  items: [
    { id, name: `${name} · Posted`, src: `${base}&state=posted`, ...FRAME, note },
    { id: `${id}-try`, name: 'Try it: Review → Post → T3 Code button', src: `${base}&state=review${id === 'E' ? '&t3fail=1' : ''}`, ...FRAME, note: id === 'E' ? 'Interactive. Post, then Send to T3 Code: the first send fails as if T3 Code were closed; Try sending again works.' : 'Interactive. Post, then Copy message and open T3 Code.' },
    ...REMIX_STATES.map(([key, label, extra, text]) => ({ id: `${id}-${key}`, name: label, src: `${base}&state=${key === 'repost' ? 'repost' : 'posted'}${extra}`, ...FRAME, note: text })),
    ...(id === 'E' ? [{ id: 'E-fail', name: 'T3 Code not running', src: `${base}&state=posted&t3=fail`, ...FRAME, note: 'The send failed: the notes are on GitHub; Copy message and Try sending again.' }] : []),
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
          disposition: 'combine',
          feedback: 'User, Wayfinder canvas notes on #314 (2026-10-16, issuecomment-6205185665), on A5: "I like this copy message for T3 Code." Agreed in the #314 thread: A combines into B, giving it Copy message for T3 Code. Built as D and E (round 2).',
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
          disposition: 'combine',
          feedback: 'User, Wayfinder canvas notes on #314 (2026-10-16, issuecomment-6205185665): "I think altogether I like option B but if we could mix this copy message for T3 Code and open that specific thread at the same time. If we could even post the message with one button that would be nice." On B5: "I like this style of side pane." and "I like the open in T3 code button." Agreed in the #314 thread: B is the base, combined with A. Built as D (copy and open) and E (send to the thread) in round 2.',
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
          feedback: 'Not chosen. No notes on C in the #314 review (2026-10-16); the user confirmed in the thread that an option left without notes was not picked. Kept unchanged for comparison.',
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
                'Round 2 (D, E): 18 frames (posted, after the click, no tracked thread, side pane, side pane after the click, repost, send failed, sending, side pane send failed) in light and dark, plus 900×700: no page errors, no overflow, contrast at or above 4.5:1. Flows run: D Post → Copy message and open T3 Code announces it and focuses the bar heading; E Post → Send to T3 Code shows Sending… (aria-busy), the first send fails as a role=alert amber bar with Copy message and Try sending again, and the retry reads "sent to T3 Code". Opening the thread and sending into it are simulated (toast); the real send would use the T3 server call that hand-offs use (src/t3Api.ts dispatch, thread.turn.start), which was not exercised here.\n\n' +
                'Not checked: screen reader output (NVDA/VoiceOver), the floating window size, 200% zoom, touch, Windows high contrast, the installed desktop app.',
            },
          ],
        },
      ],
    },
    {
      title: 'Round 2 · B with Copy message',
      id: 'round-2',
      round: 2,
      question: 'B’s bar with A’s Copy message, opening the exact T3 Code thread in the same click. Should that click copy the message for you to paste (D), or send it into the thread itself (E)?',
      sections: [
        remix('D', 'Copy and open (B + A)', 'variants/viewer.html?dir=B2', {
          basedOn: ['B', 'A'],
          idea: 'B’s green bar, unchanged in style and in the side pane. The single button is "Copy message and open T3 Code": it copies "Canvas notes are posted on #292: <exact comment link>" (A’s Copy message) and opens that ticket’s T3 Code thread with the existing Open in T3 Code path. The bar shows the message it copies. After the click it reads "Message copied and your T3 Code thread for #292 is open. Paste it there to continue." If Wayfinder doesn’t know the thread, the button is A’s plain Copy message for T3 Code.',
          pros: [
            'You stay in control: nothing appears in the thread until you paste and send it',
            'Uses only paths the app already has (clipboard, Open in T3 Code)',
            'You can add your own words before sending',
          ],
          cons: [
            'Still two steps: click, then paste in T3 Code',
            'If you forget to paste, the agent never hears about the notes',
            'Overwrites whatever was on your clipboard',
          ],
        }),
        remix('E', 'Send to thread (B + A)', 'variants/viewer.html?dir=B3', {
          basedOn: ['B', 'A'],
          idea: 'B’s green bar with one button, "Send to T3 Code". It posts "Canvas notes are posted on #292: <exact comment link>" into that ticket’s T3 Code thread as your message (the same T3 server call hand-offs use to start a thread), then offers Open T3 Code thread. The bar shows what it will send before you click. Sending shows "Sending…"; success reads "Posted to GitHub · #292 · sent to T3 Code". If T3 Code isn’t running the bar turns amber with Copy message and Try sending again; the notes stay on GitHub either way. If Wayfinder doesn’t know the thread, the button is Copy message for T3 Code.',
          pros: [
            'One click: the agent gets the link and starts reading the notes right away',
            'Nothing to forget or paste; this is the #292 double-post fixed at the root',
            'You can still open the thread to watch it pick them up',
          ],
          cons: [
            'Starts an agent turn in the thread; if the agent is mid-task, the message lands while it works',
            'New production code: the viewer has to call the T3 server for an existing thread, and handle T3 being closed',
            'Only works when Wayfinder tracked the hand-off for this ticket',
          ],
        }),
      ],
    },
  ],
};
