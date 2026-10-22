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
                disposition: 'change',
                feedback: 'I think the profile at the top right is the right idea but should open up a settings page not a sheet that slides up.',
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
            {
              id: 'B-confirm', name: 'Confirm alert', src: 'variants/mobile.html?v=C&remix=filter&screen=repos&acct=B&open=confirm', ...PHONE,
              note: { idea: 'The second step of B. Cancel closes everything and returns to the avatar.', disposition: 'keep', feedback: 'This is how I want the sign out modal to look.' },
            },
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
                disposition: 'combine',
                feedback: 'I like the style of this page it looks good and matches the look i am looking for.',
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
                disposition: 'combine',
                feedback: 'I like the idea of having a settings page but what you designed is ugly.',
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
              text: "Sources: src/ui/styles.css tokens (plane, surface-1, text-*, hairline, gridline, accent, --state-failed for destructive, as the desktop .failure uses), #223’s picked phone parts (variants/mobile.css, mobile.js from prototype/223: R-C2 Maps list, S-A sign-in, .m-sheet, .m-row, .m-btn), the desktop account row and Sign out in src/ui/settings.ts and the account mark in src/ui/chrome.ts. No new tokens.\n\nChecked headless (Playwright Chromium, 390×844), every frame in light and dark: text contrast of every account element is ≥ 4.5:1 (Sign out red, notices, fine print, revoke link, slots, alert and action-sheet text); account buttons are ≥ 44px tall; no page errors.\n\nInteraction, checked by script: A and B open on the avatar with focus on the first item; Tab stays inside the open sheet, menu or dialog; Escape closes and returns focus to the avatar (D: to Sign out). B’s menu moves with arrow keys, and its alert focuses Cancel. Every option’s sign-out lands on the welcome screen with the notice focused, and Sign in walks back to Maps. C and D’s Back returns to Maps.\n\nSemantics: avatar is a button labelled “Account, signed in as RAbdelrhman” with aria-haspopup/aria-expanded (A, B); A is role=dialog aria-modal; B is role=menu with menuitems and a role=alertdialog confirm; D’s action sheet is a dialog; the signed-out notice is role=status.\n\nFindings: in dark mode the scrim behind B’s alert and D’s action sheet barely shows on the black plane; the dialogs still stand apart by surface colour. Profile photos are drawn as the initial only (the desktop falls back the same way). D’s Notifications and Desktop sections are dashed placeholders; their contents belong to #225 and #224.\n\nNot checked: real devices and native iOS/Android menus, alerts and action sheets (these frames imitate them), screen readers, large text, landscape, safe areas, sheet animation.\n\nRound 2 (E, F), checked the same way at 390×844 in light and dark: every row title, subtitle, section title and alert text ≥ 4.5:1; the avatar opens Settings; Sign out opens B’s alert with focus on Cancel; Escape returns focus to Sign out; signing out lands on the welcome notice; no page errors. F’s Notifications and Desktop rows only toast which ticket designs them. Not checked for round 2: the same list as round 1. Round 3 (G-a, G-b, G-c), checked the same way in light and dark: the Settings title is centred on the screen (x = 195 of 390); Back is 44px tall and its border lines up with the cards at 16px; every section title, row and bar text is at least 4.5:1; Sign out opens B’s alert with Cancel focused and lands on the signed-out welcome; Back returns to Maps; no page errors. The new bar applies to round 3 only, so earlier rounds stay as they were.",
            },
          ],
        },
      ],
    },
    {
      title: 'Round 2 · Settings page',
      round: 2,
      question: 'From your notes: the avatar opens a Settings page (A, D), in C’s look, and Sign out is confirmed with B’s alert. Should Settings hold only the account, or also show where Notifications and Desktop go?',
      sections: [
        {
          title: 'Settings page in C’s style, B’s sign-out alert',
          note: 'Tap the avatar on Maps to open Settings, then Sign out. Both frames start on Maps’ Settings page; the confirm frames show B’s alert over it.',
          items: [
            {
              id: 'E',
              name: 'Settings, account only',
              src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=E', ...PHONE,
              note: {
                idea: 'The avatar pushes Settings. It is C’s Account page under a Settings title: large avatar, name and @login; a GitHub group (Signed in · With a device code · since Oct 20, Open profile on GitHub); a “This phone” group with a red Sign out. Sign out opens B’s alert: “Sign out? Wayfinder will forget @RAbdelrhman’s GitHub sign-in on this phone.” Cancel / Sign out. Revoking on GitHub is not mentioned.',
                pros: ['Exactly the parts you liked, nothing else', 'No empty placeholders', '#225 and #224 can add their rows later without a redesign'],
                cons: ['A Settings page that only holds the account until #225 and #224 land'],
                basedOn: ['A', 'B-confirm', 'C', 'D'],
              },
            },
            { id: 'E-confirm', name: 'Settings, account only · Confirm', src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=E&open=confirm', ...PHONE, note: { idea: 'B’s alert over E. Cancel returns focus to Sign out; Sign out lands on the welcome screen with “Signed out of @RAbdelrhman.”', basedOn: ['B-confirm', 'E'] } },
            {
              id: 'F',
              name: 'Settings, with app rows',
              src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=F', ...PHONE,
              note: {
                idea: 'E, plus an App group between GitHub and This phone with two rows in the same style: Notifications (Designed in #225) and Desktop (Pairing is designed in #224). They replace D’s dashed boxes; tapping one only says which ticket designs it.',
                pros: ['Shows where the next settings will live, in the look you liked', 'No dashed boxes'],
                cons: ['Two rows that lead nowhere until #225 and #224 are built', 'Places those sections before their own tickets decide them'],
                basedOn: ['A', 'B-confirm', 'C', 'D'],
                disposition: 'change',
                feedback: 'Settings title: fix centering. GitHub, App and This phone section titles: this is a bad category name. Maps back button: something about its placement feels weird or off.',
              },
            },
            { id: 'F-confirm', name: 'Settings, with app rows · Confirm', src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=F&open=confirm', ...PHONE, note: { idea: 'B’s alert over F.', basedOn: ['B-confirm', 'F'] } },
          ],
        },
      ],
    },
    {
      title: 'Round 3 · Section names',
      round: 3,
      question: 'F with your fixes: Settings is centred, Back lines up with the content, and the sections get new names. Which naming works?',
      sections: [
        {
          title: 'F, fixed: centred title, Back on the content edge',
          note: 'All three share the new top bar: the title sits in the true centre of the screen, and Back’s left edge lines up with the cards (16px) instead of hugging the screen edge. Sign out still opens B’s alert.',
          items: [
            {
              id: 'G-a',
              name: 'Account / Preferences',
              src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=G&names=a', ...PHONE,
              note: {
                idea: "Sections are named Account (Signed in, Open profile on GitHub) and Preferences (Notifications, Desktop). Sign out sits alone in its own untitled group at the bottom, as iOS Settings does.",
                pros: ["Plain words people know from other apps","Sign out is set apart, so it’s hard to hit by mistake"],
                cons: ["“Preferences” is vague for two rows"],
                disposition: 'keep',
                feedback: 'G-a is my choice',
                basedOn: 'F',
              },
            },
            {
              id: 'G-b',
              name: 'No section names',
              src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=G&names=b', ...PHONE,
              note: {
                idea: "No section titles at all. The same three groups (account, app rows, Sign out) are separated by space only; the profile at the top says whose account it is.",
                pros: ["Nothing to name wrong","Cleanest look, closest to C’s page"],
                cons: ["Groups are less scannable once #225 and #224 add more rows"],
                basedOn: 'F',
              },
            },
            {
              id: 'G-c',
              name: 'Account / Notifications and desktop',
              src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=G&names=c', ...PHONE,
              note: {
                idea: "Two sections: Account holds Signed in, Open profile on GitHub and Sign out together; Notifications and desktop holds the two app rows.",
                pros: ["Everything about the account in one place","The second title says exactly what is in it"],
                cons: ["Sign out sits inside a group with other rows","Long second title"],
                basedOn: 'F',
              },
            },
            { id: 'G-confirm', name: 'Account / Preferences · Confirm', src: 'variants/mobile.html?v=C&remix=filter&screen=settings&acct=G&names=a&open=confirm', ...PHONE, note: { idea: 'B’s alert over the fixed page (same in all three).', basedOn: ['B-confirm', 'G-a'] } },
          ],
        },
      ],
    },
  ],
};
