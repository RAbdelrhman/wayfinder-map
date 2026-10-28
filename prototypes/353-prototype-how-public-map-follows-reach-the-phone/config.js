/*
  Wayfinder's canvas for ticket #353: how another author's public map reaches the phone's Maps list,
  and how that follow is removed. Prerequisite design for #229 on map #217.
  Built on #223's approved R-C2 Maps screen (styles copied from the #223/#316 boards into variants/mobile.css).
  Keeps #143's rules: maps are private unless the author adds `Visibility: public`, only public maps can be
  followed, follows are per GitHub login, and Wayfinder never writes to GitHub.
  Ramon selected round 2's A + B-share page as shown at 6c3d07f (#353 comment 6457376978); round 1's options stay for lineage.
  Round 3 asks one narrower question: round 2 shows a shared map's Follow / Unfollow twice on Public maps (on the checked
  card and on its repository row). It offers three minimal ways to show it once. Ramon called the duplicate redundant and
  delegated the pick ("Yes thats redundant choose one"); option 1, The card holds it, was chosen at 1957b79 and recorded
  in #353 comment 6457851959. Round 2 and the other round 3 options stay for lineage.
  Check with: node prototypes/353-prototype-how-public-map-follows-reach-the-phone/tools/check.mjs
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
                disposition: 'combine',
                feedback: 'Canvas notes on 8c01667, whole A page: "I like this overall". Combined with B-share in round 2, which Ramon selected.',
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
            { id: 'B-share', name: 'Optional: share from GitHub', src: 'variants/phone.html?o=B&s=share', ...PHONE, note: { idea: 'Wayfinder as a share target from GitHub\'s app or the browser, opening the checked preview. Drawn, not the real OS sheet. Can be left out.', disposition: 'combine', feedback: 'Canvas notes on 8c01667: "I like this share option". Combined with A in round 2, which Ramon selected.' } },
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
    {
      id: 'round-2',
      title: 'A + B-share',
      round: 2,
      question: 'Round 2 from your notes on 8c01667: A as it was, plus B\'s share from GitHub. Does the combination work, and does a shared link land in the right place?',
      sections: [
        {
          title: 'Browse and follow: A, unchanged',
          note: 'The same screens as A · Browse on the phone. B\'s paste field and Followed maps screen are not added.',
          items: [
            {
              id: 'R2-maps',
              name: 'Maps, with Find public maps',
              src: 'variants/phone.html?o=AB&s=maps', ...PHONE,
              note: {
                idea: 'A-maps unchanged: #223\'s R-C2 list with Find public maps at the end.',
                basedOn: 'A-maps',
                disposition: 'keep',
                feedback: 'Ramon selected this whole A + B-share page as shown at 6c3d07f: "looks good that was my choice" (#353 comment 6457376978), with the Canvas note "Looks good" on the page.',
              },
            },
            { id: 'R2-find', name: 'Public maps', src: 'variants/phone.html?o=AB&s=find', ...PHONE, note: { idea: 'A-find unchanged: other people\'s public maps by repository, each with Follow or Unfollow.', basedOn: 'A-find' } },
            { id: 'R2-repo', name: 'Look in another repository', src: 'variants/phone.html?o=AB&s=repo', ...PHONE, note: { idea: 'A-repo unchanged.', basedOn: 'A-repo' } },
            { id: 'R2-followed', name: 'Followed, back on Maps', src: 'variants/phone.html?o=AB&s=followed', ...PHONE, note: { idea: 'A-followed unchanged: the desktop\'s toast copy, and the map in Latest with its author.', basedOn: 'A-followed' } },
          ],
        },
        {
          title: 'Share from GitHub: B-share, landing in A',
          note: 'B-share\'s share target, drawn, not the real OS sheet. A has no Followed maps screen, so the shared link opens A\'s Public maps with B\'s checked preview on top. That landing spot is this round\'s assumption.',
          items: [
            { id: 'R2-share', name: 'Share sheet over GitHub', src: 'variants/phone.html?o=AB&s=share', ...PHONE, note: { idea: 'In GitHub\'s app or the browser, Share › Wayfinder. Tap Wayfinder to continue.', basedOn: 'B-share', pros: ['Follow straight from a map someone sent you'], cons: ['Native work: an Android intent filter and an iOS share extension'] } },
            { id: 'R2-shared', name: 'Shared map, checked', src: 'variants/phone.html?o=AB&s=shared', ...PHONE, note: { idea: 'Public maps opens with "Shared from GitHub" on top: B\'s preview of #198 with its author and progress, confirmed public, and Follow map. A\'s list continues underneath. Back returns to Maps.', basedOn: ['A-find', 'B-preview'] } },
            { id: 'R2-shared-following', name: 'Shared map you already follow', src: 'variants/phone.html?o=AB&s=shared-following', ...PHONE, note: { idea: 'Sharing #12, already followed: the card shows Unfollow, the same action as its row below.', basedOn: ['A-find', 'B-preview'] } },
          ],
        },
        {
          title: 'States',
          items: [
            { id: 'R2-shared-private', name: 'Shared map isn\'t public, and other checks', src: 'variants/phone.html?o=AB&s=shared-private', ...PHONE, note: { idea: 'B-private\'s check inside A\'s screen: a private map can\'t be followed, and the card says what its author would need to do. The same card covers your own map, a link that isn\'t a map, and an issue Wayfinder can\'t read.', basedOn: 'B-private' } },
            { id: 'R2-shared-offline', name: 'Shared while offline', src: 'variants/phone.html?o=AB&s=shared-offline', ...PHONE, note: { idea: 'B-offline\'s rule: the shared link waits until GitHub can confirm the map is public. A\'s offline banner and disabled Follow stay; Unfollow still works. The PC never matters.', basedOn: ['A-offline', 'B-offline'] } },
            { id: 'R2-offline', name: 'Offline', src: 'variants/phone.html?o=AB&s=offline', ...PHONE, note: { idea: 'A-offline unchanged.', basedOn: 'A-offline' } },
            { id: 'R2-hidden', name: 'A followed map stopped being public', src: 'variants/phone.html?o=AB&s=hidden', ...PHONE, note: { idea: 'A-hidden unchanged: off Maps, kept under "Followed, not public now" with Unfollow.', basedOn: 'A-hidden' } },
            { id: 'R2-account', name: 'Another GitHub account', src: 'variants/phone.html?o=AB&s=account', ...PHONE, note: { idea: 'A-account unchanged: follows belong to a login on this phone; the desktop keeps its own list.', basedOn: 'A-account' } },
            {
              id: 'R2-open',
              kind: 'note',
              name: 'What this round assumes',
              text: 'Taken from your notes: all of A, and B-share. Left out because your notes didn\'t mention them: B\'s paste field, its Followed maps screen and its Add a public map button. Assumed here and open to change: a shared link lands on Public maps with the check on top, and the share entry stays optional native work that A works without. Ramon selected this page as shown at 6c3d07f; the pick is recorded on R2-maps, and round 1\'s pages stay for comparison.',
            },
            {
              id: 'R2-review',
              kind: 'note',
              name: 'Design review',
              text: 'Same fixture and styles as round 1 (variants/follows.js with ?o=AB); round 1 pages are unchanged apart from recording your notes. Checked in Chrome at 390 × 844 in light and dark: every round 2 frame renders; Wayfinder in the share sheet opens Public maps with the checked card; Follow and Unfollow on the card and the rows stay in step; Back returns to Maps; offline disables Follow and keeps Unfollow. Not checked: screen readers, real devices, safe areas, large text, landscape, the OS share sheet (drawn, not native).',
            },
          ],
        },
      ],
    },
    {
      id: 'round-3',
      title: 'One Follow per map',
      round: 3,
      question: 'Round 2 (your pick) shows a shared map\'s Follow / Unfollow twice on Public maps: on the "Shared from GitHub" card and on the map\'s row in its repository. Which one place should hold it? The rest of A + B-share stays as you picked it.',
      sections: [
        {
          title: 'The same moment in each: #12 shared from GitHub, already followed',
          note: 'Round 2\'s R2-shared-following, then three alternatives. Each changes only where the shared map\'s button sits. Maps, Find public maps, Look in another repository, the share sheet and the other A + B-share states stay as they are.',
          items: [
            { id: 'R3-now', name: 'Round 2 as picked: two Unfollow buttons', src: 'variants/phone.html?o=AB&s=shared-following', ...PHONE, note: { idea: 'Unchanged, for reference: the card shows Unfollow for #12, and #12\'s row in octo-notes, further down, has Unfollow too. Both buttons do the same thing.', basedOn: 'R2-shared-following' } },
            {
              id: 'R3-card',
              name: '1 · The card holds it',
              src: 'variants/phone.html?o=AB&v=card&s=shared-following', ...PHONE,
              note: {
                idea: 'The checked card keeps Follow map / Unfollow. While the card is showing, the map\'s row leaves its repository list, and one line says the map is above.',
                basedOn: ['R2-shared', 'R2-shared-following'],
                pros: ['The button is where the share lands', 'Closest to round 2: only the duplicate row goes'],
                cons: ['The repository list is one map short while the card shows', 'Two kinds of Follow on one screen: a large button on the card, row buttons below'],
                disposition: 'keep',
                feedback: 'Chosen at 1957b79 on Ramon\'s delegation in the #229 hand-off conversation: "Yes thats redundant choose one". The card has the shared map\'s only Follow / Unfollow; its repository row is hidden while the card shows. Recorded in #353 comment 6457851959. Not Ramon\'s own pick among the three.',
              },
            },
            {
              id: 'R3-row',
              name: '2 · The row holds it',
              src: 'variants/phone.html?o=AB&v=row&s=shared-following', ...PHONE,
              note: {
                idea: 'The card reports the check (the map is public, and whether you follow it) but has no button. The map\'s own row is marked Shared, highlighted and scrolled into view, and its Follow / Unfollow is the only one.',
                basedOn: ['R2-shared', 'A-find'],
                pros: ['Every map on Public maps has the same kind of button, as on the desktop', 'The list stays complete'],
                cons: ['The button can be lower on the screen, so the screen scrolls to it', 'A map from a repository that isn\'t listed adds that repository as a group'],
              },
            },
            {
              id: 'R3-screen',
              name: '3 · Its own screen',
              src: 'variants/phone.html?o=AB&v=screen&s=shared-following', ...PHONE,
              note: {
                idea: 'Choosing Wayfinder in the share sheet opens a small Shared map screen with B\'s checked card and its one button. Public maps is A\'s list with no shared card. Back goes to Maps.',
                basedOn: ['B-preview', 'R2-shared'],
                pros: ['No screen shows a map twice', 'Public maps stays exactly as A drew it'],
                cons: ['One more screen to build', 'The other maps in the shared map\'s repository are a step away (Maps › Find public maps)'],
              },
            },
            {
              id: 'R3-open',
              kind: 'note',
              name: 'Why this round',
              text: 'Verifying round 2 found the shared map\'s Follow / Unfollow on both the card and its row on one screen, and #353 asks to avoid duplicate controls. You called the duplicate redundant and left the pick to us ("Yes thats redundant choose one"), so 1 · The card holds it is chosen (#353 comment 6457851959): A + B-share as you picked it, with one Follow per shared map. Options 2 and 3 and round 2 stay for comparison. Nothing is built. Each option\'s page shows the share, follow, already-followed, not-public and offline states.',
            },
            {
              id: 'R3-review',
              kind: 'note',
              name: 'Design review',
              text: 'Same fixture as rounds 1 and 2 (variants/follows.js, ?o=AB&v=card|row|screen). Without v it draws round 2 unchanged. Checked in Chrome at 390 × 844, light and dark: every round 3 screen has one Follow / Unfollow per map; Wayfinder in the share sheet lands where each option says; Follow and Unfollow update the card, the row and Maps; Back returns to Maps; offline disables Follow and keeps Unfollow. The row highlight adds an accent edge and a "Shared" tag, so it does not rely on colour alone. Not checked: screen readers, real devices, safe areas, large text, landscape, the OS share sheet (drawn, not native).',
            },
          ],
        },
      ],
    },
    {
      id: 'round-3-card',
      title: '1 · The card holds it',
      round: 3,
      sections: [
        {
          title: 'Share and follow',
          items: [
            { id: 'R3-card-share', name: 'Share sheet over GitHub', src: 'variants/phone.html?o=AB&v=card&s=share', ...PHONE, note: { idea: 'R2-share unchanged: Share › Wayfinder. Tap Wayfinder.', basedOn: 'R2-share' } },
            { id: 'R3-card-shared', name: 'Shared map, checked', src: 'variants/phone.html?o=AB&v=card&s=shared', ...PHONE, note: { idea: 'Public maps opens with the checked card for #198 and Follow map. #198 is not in the wayfinder-map list below, and a line says it is above. Follow, then Back to see it on Maps.', basedOn: 'R2-shared' } },
            { id: 'R3-card-shared-following', name: 'Shared map you already follow', src: 'variants/phone.html?o=AB&v=card&s=shared-following', ...PHONE, note: { idea: 'The card shows Unfollow for #12. octo-notes lists only #15, with a line saying #12 is above.', basedOn: 'R2-shared-following' } },
          ],
        },
        {
          title: 'States',
          items: [
            { id: 'R3-card-shared-private', name: 'Shared map isn\'t public, and other checks', src: 'variants/phone.html?o=AB&v=card&s=shared-private', ...PHONE, note: { idea: 'As in round 2: a message card with no button, so nothing repeats. The rows below are A\'s.', basedOn: 'R2-shared-private' } },
            { id: 'R3-card-shared-offline', name: 'Shared while offline', src: 'variants/phone.html?o=AB&v=card&s=shared-offline', ...PHONE, note: { idea: 'As in round 2: the card waits for GitHub and has no button. The rows keep their own Follow (disabled) and Unfollow.', basedOn: 'R2-shared-offline' } },
          ],
        },
      ],
    },
    {
      id: 'round-3-row',
      title: '2 · The row holds it',
      round: 3,
      sections: [
        {
          title: 'Share and follow',
          items: [
            { id: 'R3-row-share', name: 'Share sheet over GitHub', src: 'variants/phone.html?o=AB&v=row&s=share', ...PHONE, note: { idea: 'R2-share unchanged.', basedOn: 'R2-share' } },
            { id: 'R3-row-shared', name: 'Shared map, checked', src: 'variants/phone.html?o=AB&v=row&s=shared', ...PHONE, note: { idea: 'The card says #198 is public and points to its row. The #198 row in wayfinder-map is marked Shared and highlighted, and its Follow is the only one.', basedOn: 'R2-shared' } },
            { id: 'R3-row-shared-following', name: 'Shared map you already follow', src: 'variants/phone.html?o=AB&v=row&s=shared-following', ...PHONE, note: { idea: 'The card says you follow #12. The screen scrolls to octo-notes, where #12\'s row is highlighted with its one Unfollow.', basedOn: 'R2-shared-following' } },
          ],
        },
        {
          title: 'States',
          items: [
            { id: 'R3-row-shared-private', name: 'Shared map isn\'t public, and other checks', src: 'variants/phone.html?o=AB&v=row&s=shared-private', ...PHONE, note: { idea: 'As in round 2: a message card with no button. Nothing is highlighted.', basedOn: 'R2-shared-private' } },
            { id: 'R3-row-shared-offline', name: 'Shared while offline', src: 'variants/phone.html?o=AB&v=row&s=shared-offline', ...PHONE, note: { idea: 'As in round 2: the card waits for GitHub. Nothing is highlighted until the check passes.', basedOn: 'R2-shared-offline' } },
          ],
        },
      ],
    },
    {
      id: 'round-3-screen',
      title: '3 · Its own screen',
      round: 3,
      sections: [
        {
          title: 'Share and follow',
          items: [
            { id: 'R3-screen-share', name: 'Share sheet over GitHub', src: 'variants/phone.html?o=AB&v=screen&s=share', ...PHONE, note: { idea: 'R2-share, except the line under it says Wayfinder opens the shared map.', basedOn: 'R2-share' } },
            { id: 'R3-screen-shared', name: 'Shared map screen', src: 'variants/phone.html?o=AB&v=screen&s=shared', ...PHONE, note: { idea: 'A Shared map screen with the checked card for #198 and Follow map. Back goes to Maps, where #198 shows after Follow.', basedOn: ['R2-shared', 'B-preview'] } },
            { id: 'R3-screen-shared-following', name: 'Shared map you already follow', src: 'variants/phone.html?o=AB&v=screen&s=shared-following', ...PHONE, note: { idea: 'The same screen with Unfollow for #12. There is no list on it, so nothing repeats.', basedOn: 'R2-shared-following' } },
          ],
        },
        {
          title: 'States',
          items: [
            { id: 'R3-screen-shared-private', name: 'Shared map isn\'t public, and other checks', src: 'variants/phone.html?o=AB&v=screen&s=shared-private', ...PHONE, note: { idea: 'Round 2\'s message card, on the Shared map screen.', basedOn: 'R2-shared-private' } },
            { id: 'R3-screen-shared-offline', name: 'Shared while offline', src: 'variants/phone.html?o=AB&v=screen&s=shared-offline', ...PHONE, note: { idea: 'The Shared map screen with the offline card. Unfollow on Public maps still works offline.', basedOn: 'R2-shared-offline' } },
          ],
        },
      ],
    },
  ],
};
