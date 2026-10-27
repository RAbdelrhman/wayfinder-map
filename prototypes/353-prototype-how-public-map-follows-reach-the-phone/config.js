/*
  Wayfinder's canvas for ticket #353: how another author's public map reaches the phone's Maps list,
  and how that follow is removed. Prerequisite design for #229 on map #217.
  Built on #223's approved R-C2 Maps screen (styles copied from the #223/#316 boards into variants/mobile.css).
  Keeps #143's rules: maps are private unless the author adds `Visibility: public`, only public maps can be
  followed, follows are per GitHub login, and Wayfinder never writes to GitHub.
  No option is chosen here. Check with: node prototypes/353-prototype-how-public-map-follows-reach-the-phone/tools/check.mjs
*/

// Every frame is the whole clickable phone at one step; src stays a literal so Wayfinder can read each option's page.
const PHONE = { width: 390, height: 844, boardWidth: 240 };

window.CANVAS = {
  ticket: 353,
  title: 'How public map follows reach the phone',
  question: 'How does someone else\'s public map get onto the phone\'s Maps list, and how is it unfollowed, with the PC off, after a visibility change, and across accounts and devices?',
  sampleState:
    'Signed in as @RAbdelrhman with three own maps. Other authors\' maps: @tess-k\'s public #198 in wayfinder-map; @mona\'s public #12 and #15 and private #9 in mona/octo-notes. #12 is already followed. Every frame is the whole clickable app; Follow, Unfollow, Paste and Back work.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/mobile.css', 'variants/follows.css'],
    bodyClass: 'viz-root',
    surfaces: { plane: 'var(--plane)', surface: 'var(--surface-1)', line: 'var(--hairline)', text: 'var(--text-primary)', muted: 'var(--text-muted)' },
  },

  pages: [
    {
      id: 'overview',
      title: 'Overview',
      round: 1,
      sections: [
        {
          title: 'Three options, at the same moment',
          note: 'The Maps screen after following @mona\'s #12. Rows, search, Filter by and the avatar are #223\'s R-C2 unchanged, except that a followed map\'s row adds its author (· @mona). Each option\'s page shows every step and state.',
          items: [
            {
              id: 'A',
              name: 'Browse public maps on the phone',
              src: 'variants/phone.html?o=A&s=maps', ...PHONE,
              note: {
                idea: 'A "Find public maps" button under the Maps list opens Public maps: other people\'s public maps, grouped by the repositories where you have maps or already follow one, each with the desktop\'s Follow / Unfollow button. A field looks in any other owner/repo. Follows are saved on this phone, per GitHub login, and read straight from GitHub, so the PC can be off.',
                pros: ['Same idea and buttons as the desktop\'s Public maps list (#148)', 'Works with the PC off; no pairing, no new service, nothing written to GitHub', 'You can find maps you didn\'t know about in your own repositories'],
                cons: ['The phone\'s follows and the desktop\'s are separate lists', 'Finding a map in a repo you have never touched needs you to type owner/repo', 'Listing public maps costs a GitHub search per repository'],
              },
            },
            {
              id: 'B',
              name: 'Add a map by its link',
              src: 'variants/phone.html?o=B&s=maps', ...PHONE,
              note: {
                idea: 'An "Add a public map" button opens Followed maps: paste a map\'s GitHub link (or owner/repo#12), see a preview that confirms it is public, then Follow. The same screen lists what you follow, each with Unfollow. Optionally, Wayfinder appears in the phone\'s share sheet so you can send a map from GitHub\'s app or the browser. Saved on this phone, per login.',
                pros: ['Exact: you follow the map someone sent you, nothing to browse', 'Works with the PC off; no pairing or new service', 'One screen holds adding, the list and Unfollow'],
                cons: ['No discovery: you need the link first', 'Separate from the desktop\'s follows', 'The share-sheet entry is native work (Android intent filter, iOS share extension); paste alone works without it'],
              },
            },
            {
              id: 'C',
              name: 'Mirror the desktop\'s follows',
              src: 'variants/phone.html?o=C&s=maps', ...PHONE,
              note: {
                idea: 'The phone has no follow controls. The paired desktop sends its follows.json list over the #222 connection; the phone keeps the last copy and reads the maps from GitHub, so they still update with the PC off. A note under the list says where follows come from and when they last synced.',
                pros: ['One list across desktop and phone, nothing to set up twice', 'No new phone screens; Maps stays exactly as approved', 'Unfollow already exists on the desktop'],
                cons: ['Needs pairing (#224, #230), which isn\'t built yet; until then no followed maps reach the phone', 'Following or unfollowing needs the desktop; changes reach the phone only when it\'s on', 'Phone and desktop must use the same GitHub account'],
              },
            },
            {
              id: 'ruled-out',
              kind: 'note',
              name: 'Left out, and combinations',
              text: 'Not shown because they break the map\'s rules: syncing follows through a GitHub gist, star or label (#143: Wayfinder stays read-only on GitHub) and a hosted sync service (#217: no hosted service in v1). A and B can be combined (browse plus paste), and either can later add C\'s mirror. Pick any of these in your notes; nothing here is chosen.',
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: 'Sources: #223 R-C2 screen and styles (copied from the #316 board), mobile/src/maps/MapsScreen.tsx, cache.ts parseFollows (per-login follows), desktop Public maps copy in src/ui/repositoryView.ts and the Follow toasts in src/ui/home.ts. Checked in Chrome at 390 × 844 in light and dark: every frame renders; Follow, Unfollow, Paste, share target and Back work; buttons are 44px targets with visible focus; offline Follow buttons are disabled with a banner saying why. Not checked: screen readers, real devices, safe areas, large text, landscape, the OS share sheet (drawn, not native).',
            },
          ],
        },
      ],
    },
    {
      id: 'option-a',
      title: 'A · Browse on the phone',
      round: 1,
      sections: [
        {
          title: 'Find and follow',
          items: [
            { id: 'A-maps', name: 'Maps, with Find public maps', src: 'variants/phone.html?o=A&s=maps', ...PHONE, note: { idea: 'The approved Maps list. The only addition is a quiet button and one line at the end of the list.' } },
            { id: 'A-find', name: 'Public maps', src: 'variants/phone.html?o=A&s=find', ...PHONE, note: { idea: 'Grouped by repository: ones with your maps, then ones where you already follow a map. Each row has the desktop\'s Follow or Unfollow. Private maps never appear.' } },
            { id: 'A-repo', name: 'Look in another repository', src: 'variants/phone.html?o=A&s=repo', ...PHONE, note: { idea: 'Typing owner/repo lists that repository\'s public maps by other authors.' } },
            { id: 'A-followed', name: 'Followed, back on Maps', src: 'variants/phone.html?o=A&s=followed', ...PHONE, note: { idea: 'After Follow, the desktop\'s toast copy; the map is in the Latest list with its author.' } },
          ],
        },
        {
          title: 'States',
          items: [
            { id: 'A-offline', name: 'Offline', src: 'variants/phone.html?o=A&s=offline', ...PHONE, note: { idea: 'Public maps from the last fetch. Follow is disabled (it needs GitHub to confirm the map is public); Unfollow still works because it only changes this phone. The PC never matters.' } },
            { id: 'A-hidden', name: 'A followed map stopped being public', src: 'variants/phone.html?o=A&s=hidden', ...PHONE, note: { idea: 'It drops off Maps (#147). Public maps keeps it under "Followed, not public now" with Unfollow; if the author makes it public again, it comes back.' } },
            { id: 'A-account', name: 'Another GitHub account', src: 'variants/phone.html?o=A&s=account', ...PHONE, note: { idea: 'Follows belong to a login. Signed in as @ramon-work, nothing is followed; @RAbdelrhman\'s list waits on the phone. The desktop keeps its own list, so a map followed there isn\'t here.' } },
          ],
        },
      ],
    },
    {
      id: 'option-b',
      title: 'B · Add by link',
      round: 1,
      sections: [
        {
          title: 'Add and follow',
          items: [
            { id: 'B-maps', name: 'Maps, with Add a public map', src: 'variants/phone.html?o=B&s=maps', ...PHONE, note: { idea: 'The approved Maps list with a quiet button and one line at the end.' } },
            { id: 'B-add', name: 'Followed maps', src: 'variants/phone.html?o=B&s=add', ...PHONE, note: { idea: 'A link field with Paste on top, the maps you follow below, each with Unfollow.' } },
            { id: 'B-preview', name: 'Pasted link, checked', src: 'variants/phone.html?o=B&s=preview', ...PHONE, note: { idea: 'Wayfinder reads the issue from GitHub and shows the map, its author and progress, and that it is public, before Follow.' } },
            { id: 'B-share', name: 'Optional: share from GitHub', src: 'variants/phone.html?o=B&s=share', ...PHONE, note: { idea: 'Wayfinder as a share target from GitHub\'s app or the browser, opening the checked preview. Drawn, not the real OS sheet. Can be left out.' } },
          ],
        },
        {
          title: 'States',
          items: [
            { id: 'B-private', name: 'Not public, and other checks', src: 'variants/phone.html?o=B&s=private', ...PHONE, note: { idea: 'A private map can\'t be followed and says what its author would need to do. The other messages: your own map, not a map link, can\'t read the issue.' } },
            { id: 'B-offline', name: 'Offline', src: 'variants/phone.html?o=B&s=offline', ...PHONE, note: { idea: 'A pasted link waits until GitHub can confirm it is public; Unfollow works offline. The PC never matters.' } },
            { id: 'B-hidden', name: 'A followed map stopped being public', src: 'variants/phone.html?o=B&s=hidden', ...PHONE, note: { idea: 'Off Maps; kept on Followed maps with Unfollow until it is public again.' } },
            { id: 'B-account', name: 'Another GitHub account', src: 'variants/phone.html?o=B&s=account', ...PHONE, note: { idea: 'Per-login lists on this phone; the desktop\'s list is separate.' } },
          ],
        },
      ],
    },
    {
      id: 'option-c',
      title: 'C · Desktop\'s follows',
      round: 1,
      sections: [
        {
          title: 'Synced',
          items: [
            { id: 'C-maps', name: 'Maps, synced', src: 'variants/phone.html?o=C&s=maps', ...PHONE, note: { idea: 'Follows come from the paired desktop; a note says so and when they last synced. Following and unfollowing stay on the desktop\'s Public maps list.' } },
            { id: 'C-pcoff', name: 'PC off', src: 'variants/phone.html?o=C&s=pcoff', ...PHONE, note: { idea: 'The last list the desktop sent keeps working; the maps themselves still update from GitHub. A desktop follow made while the phone is away arrives on the next connection.' } },
          ],
        },
        {
          title: 'States',
          items: [
            { id: 'C-unpaired', name: 'Not paired', src: 'variants/phone.html?o=C&s=unpaired', ...PHONE, note: { idea: 'No followed maps until the phone is paired; the note points to Settings › Desktop, whose pairing flow #224 owns.' } },
            { id: 'C-hidden', name: 'A followed map stopped being public', src: 'variants/phone.html?o=C&s=hidden', ...PHONE, note: { idea: 'Off Maps; a note names it and says to unfollow on the desktop.' } },
            { id: 'C-account', name: 'Desktop on another account', src: 'variants/phone.html?o=C&s=account', ...PHONE, note: { idea: 'The desktop\'s follows belong to its login, so they aren\'t shown when the phone uses a different account.' } },
          ],
        },
      ],
    },
  ],
};
