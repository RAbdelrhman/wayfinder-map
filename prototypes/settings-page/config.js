window.CANVAS = {
  "title": "Settings page",
  "question": "Should Settings show one category at a time, or all settings on one scrolling page?",
  "sampleState": "Safe demo account and model choices. Every preference changes only this preview. No GitHub changes or T3 tasks are started. Both layouts move theme and model defaults into Settings and remove their separate sidebar buttons.",
  "base": {
    "stylesheets": [
      "../../src/ui/styles.css"
    ],
    "bodyClass": "viz-root",
    "surfaces": {
      "plane": "var(--plane)",
      "surface": "var(--surface-1)",
      "line": "var(--hairline)",
      "text": "var(--text-primary)",
      "muted": "var(--text-muted)"
    }
  },
  "pages": [
    {
      "id": "settings-page",
      "title": "Settings page",
      "round": 1,
      "question": "Should Settings show one category at a time, or all settings on one scrolling page?",
      "sampleState": "Safe demo account and model choices. Every preference changes only this preview. No GitHub changes or T3 tasks are started. Both layouts move theme and model defaults into Settings and remove their separate sidebar buttons.",
      "sections": [
        {
          "title": "A dedicated page for Settings",
          "note": "Same Wayfinder styles and settings in both options. Open each full size, switch categories, change theme, and expand Calibration.",
          "items": [
            {
              "id": "settings-A",
              "name": "A · Categories",
              "src": "variants/settings-page.html",
              "width": 1280,
              "height": 900,
              "boardWidth": 600,
              "note": {
                "idea": "A dedicated Settings page with a category menu. Tasks & models combines the default tier, concurrency limit, per-tier model choices and Auto rating. Appearance, Notifications, Progress and Account each get their own section. Changes save as you go; Calibration sits under Advanced.",
                "pros": [
                  "Shorter pages with a clear place for every setting",
                  "Room for model choices without squeezing controls into the modal",
                  "Category links can open a specific part of Settings directly"
                ],
                "cons": [
                  "Changing preferences across categories takes another click",
                  "A second menu sits beside the main application sidebar"
                ],
                "disposition": "keep",
                "feedback": "The user chose A: \"I like A\". Implement the category layout as a dedicated Settings page."
              }
            },
            {
              "id": "settings-B",
              "name": "B · One scrolling page",
              "src": "variants/settings-page.html?layout=single",
              "width": 1280,
              "height": 900,
              "boardWidth": 600,
              "note": {
                "idea": "A dedicated Settings page with all categories stacked in one column. The links at the top jump to a section. Appearance comes first, then task defaults and models, notifications, progress and the account.",
                "pros": [
                  "Every preference is on the same page",
                  "Easy to browse or use browser Find",
                  "No second vertical menu"
                ],
                "cons": [
                  "A long page once model defaults and notifications are included",
                  "Account and progress require scrolling or a jump link"
                ]
              }
            },
            {
              "id": "settings-review",
              "kind": "note",
              "name": "Design review",
              "text": "Sources inspected: src/ui/settings.ts, settings.test.ts, chrome.ts, navigation.ts, home.html, startNext.ts, progress.ts and styles.css. Uses the actual Wayfinder stylesheet, semantic colour tokens, segmented controls and buttons. Existing cap choices (2, 4, 6, 8) and goals (3, 5, 8) are retained. All demo changes stay in the page.\n\nChecked in Chromium: both layouts in light and dark mode; theme and tier selection; model-rating picker; Calibration expansion and shadow-model picker; notification checkboxes; all five categories at 900×620 and 390×844 with no horizontal overflow; visible keyboard focus; desktop screenshots at 1280×900 and a mobile screenshot. Canvas config and 14 canvas tests passed. Typecheck, lint and 92 Vitest files with 1,157 tests passed.\n\nNo new colour tokens were added. Text uses the existing palette; a fresh contrast audit was not run. Not checked: installed Electron app, screen reader output, forced colours, real saving and API failures. This is a design preview; the application Settings modal has not been replaced yet."
            }
          ]
        }
      ]
    }
  ]
};
