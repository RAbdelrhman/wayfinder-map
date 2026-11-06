/*
  Wayfinder's canvas for ticket #366: typing a reply to a ticket's T3 Code thread from the phone,
  and confirming it before it is sent. Built on #224's chosen A (the Session tab on the ticket),
  #316's alert and #224 B's pairing-page layout; their CSS and #224's fixture are copied into variants/.
  Pairing stays #224/#335's, the transport #230's (and #367's), session viewing #232's.
  Check with: node prototypes/366-prototype-typed-replies-with-confirmation-from-the-phone/tools/check.mjs
*/

// Every frame is the whole phone app at one step; src stays a literal so Wayfinder can read each option's page.
const PHONE = { width: 390, height: 844, boardWidth: 240 };

window.CANVAS = {
  ticket: 366,
  title: 'Typed replies with confirmation from the phone',
  question: 'Which layout should the phone use to write a reply to a ticket’s T3 Code thread, check exactly where it goes and what it says, and send it?',
  sampleState:
    'Map #217. #230 was started from this phone at 10:02; T3 Code opened PR #341 at 10:31. At 10:33 you reply from #230’s Session tab: “Before I merge #341: add a test that the remote route also rejects an expired pairing secret…”. The phone is paired with RAMON‑PC. Each frame is the whole clickable app; nothing is really sent.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/mobile.css', 'variants/account.css', 'variants/session.css', 'variants/reply.css'],
    bodyClass: 'viz-root',
    surfaces: {
      plane: 'var(--plane)',
      surface: 'var(--surface-1)',
      line: 'var(--hairline)',
      text: 'var(--text-primary)',
      muted: 'var(--text-muted)',
    },
  },

  pages: [
    {
      id: 'overview',
      title: 'Overview',
      sections: [
        {
          title: 'Two layouts, at the confirmation',
          note: 'Both name the map, the ticket and the T3 thread, show the whole message, and send only on Send. Each option’s own page has every state.',
          items: [
            {
              id: 'R1',
              name: 'Reply bar',
              src: 'variants/phone.html?o=R1&s=confirm', ...PHONE,
              note: {
                disposition: 'keep',
                feedback: 'Ramon chose R1: "I like R1 because you can see the activity and previous messages while typing."',
                idea: 'The Session tab’s “Watch only” line becomes a reply field with Review. Review opens #316’s alert, widened: map, ticket and T3 thread, then the whole message, with Edit and Send. After Send the reply sits at the end of the history, and its state (Sending, Accepted, Not sent, Not confirmed) shows on it.',
                pros: ['Reply where you read the thread, like a chat', 'Fewest screens: a field and one alert', 'The reply’s state stays next to what T3 Code says after it'],
                cons: ['A long message makes a tall alert that scrolls', 'The field takes room from the history while you type', 'Failures show inside the history, so they scroll with it'],
              },
            },
            {
              id: 'R2',
              name: 'Reply page',
              src: 'variants/phone.html?o=R2&s=confirm', ...PHONE,
              note: {
                idea: 'The Session tab’s action bar gets “Reply to T3 Code”. Writing is its own page; Review reply opens Check reply, laid out like #224 B’s pairing pages: “Send to T3 Code on RAMON‑PC?”, Goes to (map, ticket, T3 thread), the message, then Send reply and Edit. The outcome is a page too; once accepted, the reply appears in the history.',
                pros: ['Room to write and read a long message', 'The check is a full page, hard to tap through', 'Uses the page layout you picked from B'],
                cons: ['Three screens between the history and Send', 'You can’t see the history while writing', 'A failed reply shows on its page, not in the history'],
              },
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              boardWidth: 340,
              text: "Sources: #366 (open, no blockers; blocks #367), map #217’s decisions, #224’s chosen A (Session tab, pinned status, “Watch only” bar) and B pairing pages, #316’s alert. Tokens: src/ui/styles.css via #224’s copied mobile.css, account.css and session.css; reply.css adds no colours. Shared phone frame: canvas/device.js (#226).\n\nChecked in installed Chrome (Playwright), all 22 frames in light and dark at 390×844 and 8 at 320×640: no page errors, no sideways scroll. Script checks: R1 Escape closes the alert and returns focus to the field; Tab stays inside the alert; Send runs Sending → Accepted; Send again and Check and send keep reply ID r‑7K2Q‑41FD; a changed thread blocks Send until it is checked again; R2 Back, Edit and Back to #230 work.\n\nBehaviour shown, not decided here: a reply is never queued while RAMON‑PC is out of reach (the draft stays on the phone); a reply checked against one thread is never sent to another. If those need to change, it is #367’s question.\n\nNot checked: real iOS and Android, the OS keyboard pushing the field up, safe areas, touch, screen readers, large text, and any real T3 Code or desktop answer.",
            },
          ],
        },
        {
          title: 'Out of scope in both',
          items: [
            {
              id: 'scope',
              kind: 'note',
              name: 'What this prototype leaves out',
              boardWidth: 300,
              text: 'No quick prompts or shortcuts (they come later). No answering T3 Code’s questions or approvals: those stay in T3 Code on the desktop. No new pairing screens: a removed phone points to #224’s Settings → Desktop. No new transport (#230/#367) or session view (#232).',
            },
          ],
        },
      ],
    },
    {
      id: 'r1',
      title: 'R1 · Reply bar',
      sections: [
        {
          title: 'Write and check',
          items: [
            { id: 'R1-session', name: 'Session tab, reply field', src: 'variants/phone.html?o=R1&s=session', ...PHONE, note: '#224 A’s Session tab at PR ready. The “Watch only” line is now a field and Review; the line above it names RAMON‑PC.' },
            { id: 'R1-compose', name: 'Writing', src: 'variants/phone.html?o=R1&s=compose', ...PHONE, note: 'The field grows to five lines, then scrolls. Review stays off while it is empty.' },
            { id: 'R1-confirm', name: 'Send this reply?', src: 'variants/phone.html?o=R1&s=confirm', ...PHONE, note: 'Map, ticket and T3 thread (title, thread ID, project and desktop), then the whole message. Edit or Escape returns to the field with the text kept.' },
          ],
        },
        {
          title: 'Send',
          items: [
            { id: 'R1-sending', name: 'Sending', src: 'variants/phone.html?o=R1&s=sending', ...PHONE, note: 'The reply joins the history with “Sending to RAMON‑PC…”; the field is off until it settles. Tap Send in R1-confirm to see it run.' },
            { id: 'R1-accepted', name: 'Accepted by T3 Code', src: 'variants/phone.html?o=R1&s=accepted', ...PHONE, note: '“T3 Code accepted it at 10:33. No answer yet.” Accepted means it is in the thread, not that T3 Code has done it; the run’s status stays PR ready until T3 Code moves.' },
          ],
        },
        {
          title: 'When it doesn’t go',
          items: [
            { id: 'R1-failed', name: 'Not sent', src: 'variants/phone.html?o=R1&s=failed', ...PHONE, note: 'RAMON‑PC answered that T3 Code didn’t get it, with the reason. Send again reuses the reply’s ID; Edit puts it back in the field.' },
            { id: 'R1-unknown', name: 'Not confirmed', src: 'variants/phone.html?o=R1&s=unknown', ...PHONE, note: 'No answer came back, so it is never shown as sent. Check and send resends with the same ID, so T3 Code adds it at most once.' },
          ],
        },
        {
          title: 'Can’t send',
          items: [
            { id: 'R1-offline', name: 'Desktop out of reach', src: 'variants/phone.html?o=R1&s=offline', ...PHONE, note: '#224’s “Can’t reach” line pins under the status; Review is off and the draft stays on the phone. Try now checks again.' },
            { id: 'R1-revoked', name: 'Phone removed', src: 'variants/phone.html?o=R1&s=revoked', ...PHONE, note: 'RAMON‑PC removed this phone. The draft is kept; Settings → Desktop is #224’s existing page for pairing again.' },
          ],
        },
        {
          title: 'The thread changed after the check',
          items: [
            { id: 'R1-changed', name: 'Thread changed', src: 'variants/phone.html?o=R1&s=changed', ...PHONE, note: 'A new thread was started for #230 after you checked. Nothing was sent. Review again opens the alert naming the new thread, highlighted.' },
            { id: 'R1-missing', name: 'Thread gone', src: 'variants/phone.html?o=R1&s=missing', ...PHONE, note: 'The thread was deleted and #230 has no other. Nothing was sent; Copy reply keeps the text usable.' },
          ],
        },
      ],
    },
    {
      id: 'r2',
      title: 'R2 · Reply page',
      sections: [
        {
          title: 'Write and check',
          items: [
            { id: 'R2-session', name: 'Session tab, Reply button', src: 'variants/phone.html?o=R2&s=session', ...PHONE, note: '#224 A’s Session tab at PR ready. The action bar names RAMON‑PC and has Reply to T3 Code.' },
            { id: 'R2-compose', name: 'Reply page', src: 'variants/phone.html?o=R2&s=compose', ...PHONE, note: 'To: the T3 thread. A large field for the message, then Review reply.' },
            { id: 'R2-confirm', name: 'Check reply', src: 'variants/phone.html?o=R2&s=confirm', ...PHONE, note: '“Send to T3 Code on RAMON‑PC?”, Goes to (map, ticket, T3 thread), the whole message, then Send reply and Edit.' },
          ],
        },
        {
          title: 'Send',
          items: [
            { id: 'R2-sending', name: 'Sending', src: 'variants/phone.html?o=R2&s=sending', ...PHONE, note: 'Send reply turns to “Sending…”; Edit and Back are off until it settles.' },
            { id: 'R2-accepted', name: 'Accepted by T3 Code', src: 'variants/phone.html?o=R2&s=accepted', ...PHONE, note: '“T3 Code has your reply”: accepted into the thread at 10:33, not answered yet. Back to #230 shows it in the history.' },
          ],
        },
        {
          title: 'When it doesn’t go',
          items: [
            { id: 'R2-failed', name: 'Not sent', src: 'variants/phone.html?o=R2&s=failed', ...PHONE, note: 'The reason from RAMON‑PC. Send again reuses the reply’s ID; Edit reply returns to the Reply page.' },
            { id: 'R2-unknown', name: 'Not confirmed', src: 'variants/phone.html?o=R2&s=unknown', ...PHONE, note: 'Never shown as sent. Check and send resends with the same ID; the ID is in the fine print.' },
          ],
        },
        {
          title: 'Can’t send',
          items: [
            { id: 'R2-offline', name: 'Desktop out of reach', src: 'variants/phone.html?o=R2&s=offline', ...PHONE, note: 'A notice heads the Reply page; the button reads “Review when RAMON‑PC is back”, with Try now. The draft stays.' },
            { id: 'R2-revoked', name: 'Phone removed', src: 'variants/phone.html?o=R2&s=revoked', ...PHONE, note: 'RAMON‑PC removed this phone. The draft is kept; Settings → Desktop is #224’s existing page.' },
          ],
        },
        {
          title: 'The thread changed after the check',
          items: [
            { id: 'R2-changed', name: 'Thread changed', src: 'variants/phone.html?o=R2&s=changed', ...PHONE, note: 'Check reply again, with the new thread highlighted. The button reads “Send to the new thread”, so the new target is confirmed before anything is sent.' },
            { id: 'R2-missing', name: 'Thread gone', src: 'variants/phone.html?o=R2&s=missing', ...PHONE, note: 'The thread row is struck through; Send is replaced by Copy reply.' },
          ],
        },
      ],
    },
  ],
};
