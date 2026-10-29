/*
  Wayfinder's canvas for ticket #359: followed public maps the phone can't show, because GitHub no longer returns them,
  they are no longer labelled as maps, or the phone is offline with no saved details. Prerequisite design for #229 on map #217.
  Starts from the selected #223 R-C2 Maps screen and #353's A + B-share with round 3 option 1 (the card holds the one
  Follow / Unfollow). Styles are copied from the #353 board (variants/mobile.css, follows.css).
  Rules kept: one Follow / Unfollow per map on a screen; follows are per GitHub login on this phone; Wayfinder never writes
  to GitHub; a follow it can't read shows only the saved owner/repo#number, never cached details; only a readable map
  without `Visibility: public` is called private.
  Option A is kept by Ramon; B and C remain undecided. Round 2 (page round-2-a) applies only his pinned edits to A. Check with: node prototypes/359-prototype-unreadable-followed-maps-on-the-phone/tools/check.mjs
*/

// Every frame is the whole clickable phone at one state; src stays a literal so Wayfinder can read each option's page.
const PHONE = { width: 390, height: 844, boardWidth: 240 };

window.CANVAS = {
  ticket: 359,
  title: 'Followed maps the phone can\'t show',
  question: 'When GitHub stops returning a followed map, or the phone is offline with nothing saved, where does that follow show on the phone, what does it say, and where is its one Unfollow?',
  sampleState:
    'Signed in as @RAbdelrhman. Follows on this phone: @mona\'s #12 (readable), @tess-k\'s #198 (readable, now private), and three GitHub no longer shows: mona/octo-notes#21 (issue not returned), kai-r/trailhead#3 (repository not returned) and RAbdelrhman/wayfinder-map#201 (no longer labelled a map). Offline adds jo-park/garden-planner#8 with no saved details. Unfollow, Back and the C sheet work.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/mobile.css', 'variants/follows.css', 'variants/unread.css'],
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
          title: 'Three options, at the same moment: where the follows Wayfinder can\'t show are listed',
          note: 'In every option the Maps list (#223 R-C2) drops a follow it can\'t show, and a notice under the list counts them. A reference row shows only owner/repo#number and why; the confirmed-private row is #353\'s, unchanged. Each option\'s page shows every state in order.',
          items: [
            {
              id: 'A',
              name: 'In its repository',
              src: 'variants/phone.html?o=A&s=unknown', ...PHONE,
              note: {
                disposition: 'keep',
                feedback: 'Ramon chose Keep A and confirmed in the T3 thread: unreadable follows stay in their repository group, show only the saved reference and reason, keep one Unfollow, distinguish unknown access from confirmed private, and restore normal details when access returns. Wayfinder viewer notes at 44d0be5 (issue comment 6482312876, Overview frame A): "I like A I choose A"; center the Follow button for #15 Search rewrite; remove octo-notes\' "You follow a map here" label, recipes-app\'s "Has your maps" label, the fine print under Public maps, and the reason line on kai-r/trailhead#3. Drawn on the Round 2 page "A remix" (round-2-a), approved in Wayfinder comment 6509471879 and confirmed Keep Round 2 A in T3. Ramon then approved centering #3 icon, reference and Unfollow while keeping its reason removed.',
                idea: 'On Public maps, a follow Wayfinder can\'t read stays in its repository\'s group, as a reference row (#21) with the reason and its Unfollow. A repository GitHub no longer returns keeps a group holding just its references. #353\'s "Followed, not public now" section stays above, unchanged.',
                pros: ['Each follow stays where you\'d look for it, beside the repository\'s other maps', 'No new section or screen; the row uses the same Unfollow button as every other row', 'Closest to what PR #358 built, now with a reason line instead of a bare number'],
                cons: ['Rows that can\'t be opened sit between rows that can', 'A repository that\'s gone still gets a group, only to hold references', 'Unknown and private follows are in different places on the screen'],
              },
            },
            {
              id: 'B',
              name: 'Its own section',
              src: 'variants/phone.html?o=B&s=unknown', ...PHONE,
              note: {
                idea: 'Public maps gains one section, "Followed, can\'t show now", right under #353\'s "Followed, not public now". Each row shows the full owner/repo#number, the reason and Unfollow. The repository groups keep only maps Wayfinder can read.',
                pros: ['Everything that needs a decision is at the top, together', 'Private and unknown sit next to each other but under different headings and icons', 'Repository groups stay as #353 drew them'],
                cons: ['Two "Followed, …" sections can look alike at a glance', 'A follow moves away from its repository while it can\'t be read', 'Public maps is longer before you reach maps to follow'],
              },
            },
            {
              id: 'C',
              name: 'A sheet from Maps',
              src: 'variants/phone.html?o=C&s=unknown', ...PHONE,
              note: {
                idea: 'Public maps stays exactly as #353 chose it. Tapping the notice on Maps opens a sheet, "Followed maps not showing", that lists the not-public follows and the ones Wayfinder can\'t read, each with its Unfollow.',
                pros: ['Public maps is unchanged', 'One place answers "where did my map go?", reached from where it went missing', 'Close and Escape return to Maps'],
                cons: ['A new sheet to build', '#198 has Unfollow on the sheet and on Public maps (one per screen, but two places)', 'Easy to miss if you never tap the notice'],
              },
            },
            {
              id: 'states',
              kind: 'note',
              name: 'States on each option\'s page',
              text: 'In order: Maps with the notice; can\'t read, not a map now and confirmed private side by side; offline with no saved details; a link to an unreadable follow shared from GitHub (R3 option 1\'s card holds the one Unfollow, and the list it left says "#21 is above, under Shared from GitHub." when other rows remain); after Unfollow; recovery when GitHub answers again; another GitHub account. Wording never says private unless GitHub returned the map without Visibility: public. Ramon confirmed Keep A; B and C have no disposition.',
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: 'Sources: #359, #353 (A + B-share at 6c3d07f, R3 option 1 at 1957b79, board on main) and #223 R-C2 styles copied from the #353 board; PR #358 head 243b749 (PublicMapsScreen.tsx bare #21 row, resourceFailure.ts dropping saved details on 401/404, discovery.ts 403/404/410 as unavailable); open #217 tickets (#229 consumes this; no other open ticket touches Public maps). Checked in installed Chrome at 390 × 844, light and dark, all 21 option/state screens: no page errors; at most one Follow / Unfollow per map on every screen; no unreadable row or card says "private"; Unfollow on a reference works offline and updates the notice; the shared card loses its button after Unfollow and the group line goes; the notice moves focus to the Public maps heading; C\'s sheet is a modal dialog, focuses Close, keeps Tab inside, and Escape or the scrim returns focus to the notice; buttons are 44px targets (drawn 34px, #353\'s look). New text contrast is at least 5.28:1 light and 6.04:1 dark. No sideways scroll at 320 × 640, 844 × 390 or 1280 × 800. Board, Present, Escape and the theme toggle work. Findings fixed: the notice called an unlabelled issue "can\'t read"; the group line was below the fold, so A and B add a scrolled frame. Known: offline Follow is a 0.45-opacity disabled button inherited from #353; long references wrap mid-name. Not checked: real devices, screen readers, safe areas, large text, native share sheet, Wayfinder\'s in-app viewer.',
            },
          ],
        },
      ],
    },
    {
      id: 'option-a',
      title: 'A · In its repository',
      round: 1,
      sections: [
        {
          title: 'Seeing what isn\'t showing',
          items: [
            { id: 'A-maps', name: 'Maps, with the notice', src: 'variants/phone.html?o=A&s=maps', ...PHONE, note: { idea: 'R-C2 unchanged, except the notice under Latest: "4 followed maps aren\'t showing · 1 not public now · 2 can\'t be read · 1 not a map now". It opens Public maps.' } },
            { id: 'A-unknown', name: 'Can\'t read, not a map, private', src: 'variants/phone.html?o=A&s=unknown', ...PHONE, note: { idea: '#198 stays under "Followed, not public now" with its title (GitHub returned it, so private is confirmed). #201 sits in wayfinder-map, #21 in octo-notes beside #12 and #15, and trailhead keeps a group for #3. Each shows its reason; none says private.' } },
            { id: 'A-offline', name: 'Offline, no saved details', src: 'variants/phone.html?o=A&s=offline', ...PHONE, note: { idea: '#353\'s offline banner. garden-planner#8 was followed but never loaded, so its group holds only the reference with "No saved details". Unfollow works offline.' } },
          ],
        },
        {
          title: 'Removing and recovering',
          items: [
            { id: 'A-shared', name: 'Shared link to an unreadable follow', src: 'variants/phone.html?o=A&s=shared', ...PHONE, note: { idea: 'Sharing github.com/mona/octo-notes/issues/21 from GitHub: R3 option 1\'s card holds the reason and the only Unfollow. octo-notes still lists #12 and #15, with "#21 is above, under Shared from GitHub."' } },
            { id: 'A-shared-line', name: 'Same screen, at octo-notes', src: 'variants/phone.html?o=A&s=shared&at=moved', ...PHONE, note: { idea: 'Scrolled down: octo-notes keeps #12 and #15, then R3 option 1\'s line "#21 is above, under Shared from GitHub." #21 has no second Unfollow on this screen.' } },
            { id: 'A-unfollowed', name: 'After Unfollow', src: 'variants/phone.html?o=A&s=unfollowed', ...PHONE, note: { idea: '#21 is gone from octo-notes; the toast names it by reference: "Unfollowed mona/octo-notes#21." Only this phone changes.' } },
            { id: 'A-recovered', name: 'GitHub answers again', src: 'variants/phone.html?o=A&s=recovered', ...PHONE, note: { idea: 'Back online, and kai-r/trailhead is readable again: #8 and #3 turn back into normal rows with titles, and return to Maps. The notice is gone.' } },
            { id: 'A-account', name: 'Another GitHub account', src: 'variants/phone.html?o=A&s=account', ...PHONE, note: { idea: '#353\'s account banner. @ramon-work has no follows; @RAbdelrhman\'s, readable or not, wait on the phone.' } },
          ],
        },
      ],
    },
    {
      id: 'option-b',
      title: 'B · Its own section',
      round: 1,
      sections: [
        {
          title: 'Seeing what isn\'t showing',
          items: [
            { id: 'B-maps', name: 'Maps, with the notice', src: 'variants/phone.html?o=B&s=maps', ...PHONE, note: { idea: 'The same notice as A; it opens Public maps.' } },
            { id: 'B-unknown', name: 'Can\'t read, not a map, private', src: 'variants/phone.html?o=B&s=unknown', ...PHONE, note: { idea: '"Followed, not public now" (#198, titled), then "Followed, can\'t show now" with mona/octo-notes#21, kai-r/trailhead#3 and RAbdelrhman/wayfinder-map#201, each with its reason. Repository groups list only readable maps.' } },
            { id: 'B-offline', name: 'Offline, no saved details', src: 'variants/phone.html?o=B&s=offline', ...PHONE, note: { idea: 'The section is titled "Followed, waiting for GitHub" and holds garden-planner#8 with Unfollow.' } },
          ],
        },
        {
          title: 'Removing and recovering',
          items: [
            { id: 'B-shared', name: 'Shared link to an unreadable follow', src: 'variants/phone.html?o=B&s=shared', ...PHONE, note: { idea: 'The card holds #21\'s only Unfollow. "Followed, can\'t show now" keeps #3 and #201, with "#21 is above, under Shared from GitHub."' } },
            { id: 'B-shared-line', name: 'Same screen, at the section', src: 'variants/phone.html?o=B&s=shared&at=moved', ...PHONE, note: { idea: 'Scrolled down: "Followed, can\'t show now" keeps #3 and #201, then "#21 is above, under Shared from GitHub."' } },
            { id: 'B-unfollowed', name: 'After Unfollow', src: 'variants/phone.html?o=B&s=unfollowed', ...PHONE, note: { idea: 'The section is one row shorter; the toast names the reference.' } },
            { id: 'B-recovered', name: 'GitHub answers again', src: 'variants/phone.html?o=B&s=recovered', ...PHONE, note: { idea: 'The section disappears; #8 and #3 are back in their repository groups and on Maps.' } },
            { id: 'B-account', name: 'Another GitHub account', src: 'variants/phone.html?o=B&s=account', ...PHONE, note: { idea: 'As A: per-login follows, nothing to show for @ramon-work.' } },
          ],
        },
      ],
    },
    {
      id: 'option-c',
      title: 'C · A sheet from Maps',
      round: 1,
      sections: [
        {
          title: 'Seeing what isn\'t showing',
          items: [
            { id: 'C-maps', name: 'Maps, with the notice', src: 'variants/phone.html?o=C&s=maps', ...PHONE, note: { idea: 'The same notice, but it opens a sheet on Maps instead of going to Public maps.' } },
            { id: 'C-unknown', name: 'The sheet: not public, can\'t show', src: 'variants/phone.html?o=C&s=unknown', ...PHONE, note: { idea: '"Not public now" (#198, titled) and "Can\'t show now" (#21, #3, #201 by reference, with reasons), each with Unfollow. Close or Escape returns focus to the notice.' } },
            { id: 'C-offline', name: 'Offline, no saved details', src: 'variants/phone.html?o=C&s=offline', ...PHONE, note: { idea: 'Maps says it is showing what the phone saved; the sheet lists garden-planner#8 under "Waiting for GitHub".' } },
          ],
        },
        {
          title: 'Removing and recovering',
          items: [
            { id: 'C-shared', name: 'Shared link to an unreadable follow', src: 'variants/phone.html?o=C&s=shared', ...PHONE, note: { idea: 'Public maps as #353 chose it, with the card holding #21\'s only Unfollow. Public maps never lists references in C, so no row moves and no "is above" line is needed; #353\'s line still applies to readable maps.' } },
            { id: 'C-unfollowed', name: 'After Unfollow', src: 'variants/phone.html?o=C&s=unfollowed', ...PHONE, note: { idea: 'The sheet stays open, one row shorter, with the toast. Unfollowing the last row closes it.' } },
            { id: 'C-recovered', name: 'GitHub answers again', src: 'variants/phone.html?o=C&s=recovered', ...PHONE, note: { idea: 'Maps shows #8 and #3 again, and the notice is gone.' } },
            { id: 'C-account', name: 'Another GitHub account', src: 'variants/phone.html?o=C&s=account', ...PHONE, note: { idea: 'The account banner shows on Maps; there is no notice for @ramon-work.' } },
          ],
        },
      ],
    },
    {
      id: 'round-2-a',
      title: 'A remix',
      round: 2,
      question: 'Option A with only the edits pinned on its Overview frame. Do they read right on every state?',
      sections: [
        {
          title: 'What changed from A',
          note: 'A\'s screens in A\'s order, with the same phone presentation and data. Only the five pinned elements change; the headings, rows and groups around them stay.',
          items: [
            {
              id: 'R2-edits',
              kind: 'note',
              name: 'Pinned edits applied',
              text: 'From the Wayfinder notes on A at 44d0be5 (issue comment 6482312876): 1. Follow for #15 Search rewrite is centered in its row (it sat at the top). 2. "You follow a map here" is removed from the octo-notes heading. 3. "Has your maps" is removed from the recipes-app heading. 4. The fine print under Public maps ("Only maps their authors marked public. Follows are saved on this phone…") is removed. 5. The reason line on kai-r/trailhead#3 ("Can\'t read this repository. GitHub didn\'t return…") is removed; #3 keeps its icon, reference and Unfollow. Unpinned text is unchanged: "Has your maps" on wayfinder-map, "You follow a map here" on trailhead and garden-planner, the reasons on #21, #201 and #8, the #21 card, and the fine print on Maps.',
            },
            {
              id: 'R2-review',
              kind: 'note',
              name: 'Design review',
              text: 'Sources: Wayfinder notes comment 6482312876 on #359; its five selectors resolved in installed Chrome on variants/phone.html?o=A&s=unknown at 44d0be5 to the #15 Follow button, the octo-notes and recipes-app heading labels, the Public maps fine print and #3\'s reason line. Edits are keyed by map or repository (&r=2 in variants/unread.js), not by DOM position, so they hold on every state; the Overview, A, B and C pages are unchanged (all 23 of their screens render the same markup as 44d0be5). Checked in installed Chrome at 390 × 844, light and dark, all 8 Round 2 screens: no page errors; each pinned element is gone, or centered, wherever it appears, and every unpinned label and reason is still there; at most one Follow / Unfollow per map; Tab reaches all 8 controls on the pinned screen with a visible focus ring; no sideways scroll at 320 × 640, 844 × 390 or 1280 × 800. No colors or text were added, so contrast is A\'s. Findings, left as pinned for Ramon to judge: #3 now shows no reason, so its row reads "#3", an icon and Unfollow, and a screen reader hears no reason either; only #15\'s button is centered, so it sits lower than #12\'s Unfollow in the same group; heading labels and reasons now differ from group to group. Not checked: real devices, screen readers, safe areas, large text, Wayfinder\'s in-app viewer.',
            },
          ],
        },
        {
          title: 'Seeing what isn\'t showing',
          items: [
            { id: 'R2-maps', name: 'Maps, with the notice', src: 'variants/phone.html?o=A&r=2&s=maps', ...PHONE, note: { basedOn: ['A', 'A-maps'], idea: 'The same as A-maps: none of the pinned elements are on Maps. Kept so the flow reads in order.' } },
            { id: 'R2-unknown', name: 'Can\'t read, not a map, private', src: 'variants/phone.html?o=A&r=2&s=unknown', ...PHONE, note: { disposition: 'keep', feedback: 'Ramon approved Round 2 A and explicitly chose to center the bare #3 row, keeping its reason removed. Viewer comment 6509471879 and subsequent T3 confirmations.', basedOn: ['A', 'A-unknown'], idea: 'The pinned frame. #15\'s Follow is centered; octo-notes and recipes-app lose their heading labels; #3 shows only its reference and Unfollow; the fine print under the list is gone.', pros: ['Shorter, quieter group headings', 'The list ends at the last group'], cons: ['#3 no longer says why it can\'t be shown, while #21 and #201 still do', 'wayfinder-map and trailhead keep their labels, so headings differ'] } },
            { id: 'R2-offline', name: 'Offline, no saved details', src: 'variants/phone.html?o=A&r=2&s=offline', ...PHONE, note: { basedOn: ['A', 'A-offline'], idea: 'As A-offline, with the edits where they appear. garden-planner#8 keeps its reason; it was not pinned.' } },
          ],
        },
        {
          title: 'Removing and recovering',
          items: [
            { id: 'R2-shared', name: 'Shared link to an unreadable follow', src: 'variants/phone.html?o=A&r=2&s=shared', ...PHONE, note: { basedOn: ['A', 'A-shared'], idea: 'As A-shared. The #21 card is unchanged; the group edits apply below it.' } },
            { id: 'R2-shared-line', name: 'Same screen, at octo-notes', src: 'variants/phone.html?o=A&r=2&s=shared&at=moved', ...PHONE, note: { basedOn: ['A', 'A-shared-line'], idea: 'As A-shared-line: octo-notes has no label, #15 is centered, and "#21 is above, under Shared from GitHub." stays.' } },
            { id: 'R2-unfollowed', name: 'After Unfollow', src: 'variants/phone.html?o=A&r=2&s=unfollowed', ...PHONE, note: { basedOn: ['A', 'A-unfollowed'], idea: 'As A-unfollowed, with the same edits.' } },
            { id: 'R2-recovered', name: 'GitHub answers again', src: 'variants/phone.html?o=A&r=2&s=recovered', ...PHONE, note: { basedOn: ['A', 'A-recovered'], idea: 'As A-recovered. #3 is a titled row again, so there is no reason line to remove; the other edits apply.' } },
            { id: 'R2-account', name: 'Another GitHub account', src: 'variants/phone.html?o=A&r=2&s=account', ...PHONE, note: { basedOn: ['A', 'A-account'], idea: 'As A-account, with the edits where they appear.' } },
          ],
        },
      ],
    },
  ],
};
