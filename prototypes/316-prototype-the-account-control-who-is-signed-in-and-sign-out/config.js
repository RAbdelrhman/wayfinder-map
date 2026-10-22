/*
  Wayfinder's canvas for ticket #316: the account control on the phone.
  Built on #223's picked screens (R-C2 Maps list, S-A sign-in), copied into variants/.
  Check with: node prototypes/316-prototype-the-account-control-who-is-signed-in-and-sign-out/tools/check.mjs
*/

// Every frame is the whole phone app; src stays a literal so Wayfinder can read each option's page.
const PHONE = { width: 390, height: 844, boardWidth: 300 };

window.CANVAS = {
  ticket: 316,
  title: 'The account control on the phone',
  question: 'What opens when you tap the avatar on the Maps screen, who is shown, and how do you sign out?',
  sampleState:
    'Signed in as Ramon Abdelrhman (@RAbdelrhman). Each frame is the whole clickable app from #223 (R-C2 Maps list, S-A sign-in), opened at one step of the option. Tap the avatar, then Sign out; signing out lands on the welcome screen, and Sign in with GitHub walks back in.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/mobile.css', 'variants/account.css'],
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
      title: 'Options',
      round: 1,
      sections: [
        {
          title: 'A · Account sheet',
          note: 'The avatar opens a bottom sheet, like #223’s Filter by sheet. Sign out asks again inside the same sheet.',
          items: [
            {
              id: 'A',
              name: 'Sheet open',
              src: 'variants/mobile.html?v=C&remix=filter&screen=repos&acct=A&open=menu', ...PHONE,
              note: {
                idea: 'A sheet slides up with your avatar, name and @login, “Signed in with GitHub on this phone”, Open profile on GitHub, and a red Sign out. Sign out turns the sheet into “Sign out of @RAbdelrhman?” with Sign out and Cancel. Revoking on GitHub is not mentioned.',
                pros: ['Same sheet pattern as Filter by, so nothing new to learn', 'Big targets, all within thumb reach', 'One accidental tap can’t sign you out'],
                cons: ['Two taps plus a confirm to sign out', 'A whole sheet for one action', 'Says nothing about GitHub keeping the authorization'],
              },
            },
            { id: 'A-confirm', name: 'Confirm in the sheet', src: 'variants/mobile.html?v=C&remix=filter&screen=repos&acct=A&open=confirm', ...PHONE, note: 'The second step of A. Cancel goes back to the profile in the same sheet.' },
            { id: 'A-out', name: 'Signed out', src: 'variants/mobile.html?v=C&remix=filter&screen=signin&acct=A&open=out', ...PHONE, note: 'After signing out: the S-A welcome with “Signed out of @RAbdelrhman.” above it.' },
          ],
        },
        {
          title: 'B · Menu under the avatar',
          note: 'The avatar opens a small menu anchored to it. Sign out asks again in a centred alert, like the system ones.',
          items: [
            {
              id: 'B',
              name: 'Menu open',
              src: 'variants/mobile.html?v=C&remix=filter&screen=repos&acct=B&open=menu', ...PHONE,
              note: {
                idea: 'A compact menu drops from the avatar: avatar, name and @login on top, then Open profile on GitHub and a red Sign out. Sign out opens an alert, “Sign out? Wayfinder will forget @RAbdelrhman’s GitHub sign-in on this phone.”, with Cancel and Sign out. Revoking on GitHub is not mentioned.',
                pros: ['Lightest: the Maps list stays visible behind it', 'The alert is the familiar iOS/Android pattern', 'Easy to add one or two items later'],
                cons: ['Top-right is the hardest corner to reach one-handed', 'Small menu text for who is signed in', 'Says nothing about GitHub keeping the authorization'],
              },
            },
            { id: 'B-confirm', name: 'Confirm alert', src: 'variants/mobile.html?v=C&remix=filter&screen=repos&acct=B&open=confirm', ...PHONE, note: 'The second step of B. Cancel closes everything and returns to the avatar.' },
            { id: 'B-out', name: 'Signed out', src: 'variants/mobile.html?v=C&remix=filter&screen=signin&acct=B&open=out', ...PHONE, note: 'Same signed-out welcome as A.' },
          ],
        },
        {
          title: 'C · Account screen',
          note: 'The avatar pushes a full Account screen. Sign out happens at once, with no confirm; the welcome screen then says how to revoke on GitHub.',
          items: [
            {
              id: 'C',
              name: 'Account screen',
              src: 'variants/mobile.html?v=C&remix=filter&screen=account&acct=C', ...PHONE,
              note: {
                idea: 'A pushed screen titled Account, with Back to Maps. A large avatar, name and @login; a GitHub group with “Signed in · With a device code · since Oct 20” and Open profile on GitHub; a “This phone” group with a red Sign out (“Forgets your GitHub sign-in on this phone”). Tapping Sign out signs out right away. The welcome screen then says “Signed out of @RAbdelrhman. GitHub still lists Wayfinder as authorized. Revoke it at github.com/settings/applications.”',
                pros: ['Room to say how and when you signed in', 'One tap to sign out; signing back in is cheap (a new code)', 'Tells you the honest truth about GitHub’s side, at the moment it matters'],
                cons: ['A whole screen for a little information', 'No confirm, so a stray tap signs you out', 'The revoke note may read as noise to most people'],
              },
            },
            { id: 'C-out', name: 'Signed out, with revoke note', src: 'variants/mobile.html?v=C&remix=filter&screen=signin&acct=C&open=out', ...PHONE, note: 'C has no confirm step. The notice on the welcome screen carries the GitHub revoke link.' },
          ],
        },
        {
          title: 'D · Settings screen',
          note: 'The avatar opens Settings, with Account at the top. Picking this folds #316 into #225, which owns the notification settings that would sit below it.',
          items: [
            {
              id: 'D',
              name: 'Settings, Account on top',
              src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=D', ...PHONE,
              note: {
                idea: 'A pushed Settings screen. Account: your avatar, name and @login, then a red Sign out, with fine print: “Signing out only forgets the sign-in on this phone. To remove Wayfinder’s access, revoke it at github.com/settings/applications.” Below, dashed slots mark where Notifications (#225) and Desktop pairing (#224) would go; their contents are not designed here. Sign out opens an action sheet: “Sign out of @RAbdelrhman? You’ll need a new code from GitHub to sign back in.” with Sign out and Cancel.',
                pros: ['One place for everything about the app, as it grows', 'Mirrors the desktop, where Sign out lives in Settings', 'The revoke note sits next to the button, before you act'],
                cons: ['The avatar opening “Settings” is less direct about who is signed in', 'Couples this ticket to #225 and #224’s designs', 'Empty sections until those tickets land'],
              },
            },
            { id: 'D-confirm', name: 'Confirm action sheet', src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=D&open=confirm', ...PHONE, note: 'The second step of D, a system-style action sheet.' },
            { id: 'D-out', name: 'Signed out', src: 'variants/mobile.html?v=C&remix=filter&screen=signin&acct=D&open=out', ...PHONE, note: 'Same signed-out welcome as A; the revoke note was already on the Settings screen.' },
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: "Sources: src/ui/styles.css tokens (plane, surface-1, text-*, hairline, gridline, accent, --state-failed for destructive, as the desktop .failure uses), #223’s picked phone parts (variants/mobile.css, mobile.js from prototype/223: R-C2 Maps list, S-A sign-in, .m-sheet, .m-row, .m-btn), the desktop account row and Sign out in src/ui/settings.ts and the account mark in src/ui/chrome.ts. No new tokens.\n\nChecked headless (Playwright Chromium, 390×844), every frame in light and dark: text contrast of every account element is ≥ 4.5:1 (Sign out red, notices, fine print, revoke link, slots, alert and action-sheet text); account buttons are ≥ 44px tall; no page errors.\n\nInteraction, checked by script: A and B open on the avatar with focus on the first item; Tab stays inside the open sheet, menu or dialog; Escape closes and returns focus to the avatar (D: to Sign out). B’s menu moves with arrow keys, and its alert focuses Cancel. Every option’s sign-out lands on the welcome screen with the notice focused, and Sign in walks back to Maps. C and D’s Back returns to Maps.\n\nSemantics: avatar is a button labelled “Account, signed in as RAbdelrhman” with aria-haspopup/aria-expanded (A, B); A is role=dialog aria-modal; B is role=menu with menuitems and a role=alertdialog confirm; D’s action sheet is a dialog; the signed-out notice is role=status.\n\nFindings: in dark mode the scrim behind B’s alert and D’s action sheet barely shows on the black plane; the dialogs still stand apart by surface colour. Profile photos are drawn as the initial only (the desktop falls back the same way). D’s Notifications and Desktop sections are dashed placeholders; their contents belong to #225 and #224.\n\nNot checked: real devices and native iOS/Android menus, alerts and action sheets (these frames imitate them), screen readers, large text, landscape, safe areas, sheet animation.",
            },
          ],
        },
      ],
    },
  ],
};
