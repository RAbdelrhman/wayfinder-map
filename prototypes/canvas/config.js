/*
  Wayfinder's canvas for ticket #44: what starting a new map should feel like.
  Paths are relative to index.html. Check with: node prototypes/canvas/tools/check.mjs
*/

// Inline icons for the component sheet (the pages use Kit.icons from variants/wayfinder.js).
const svg = (d) =>
  `<svg class="i" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CHECK = svg('<path d="M20 6 9 17l-5-5"/>');
const FOLDER = svg(
  '<path d="M4 20a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1V10"/><path d="m3.6 19.6 2.3-7.2a1 1 0 0 1 1-.7h13.5a1 1 0 0 1 1 1.3l-2 6.3a1 1 0 0 1-1 .7H4"/>',
);
const ALERT = svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>');
const EXTERNAL = svg('<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>');
const COPY = svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>');

const CLONE_CHECKING = `<div class="nm-clone is-checking"><span class="nm-spin"></span><span class="grow">Looking for a local clone of wayfinder-map…</span></div>`;
const CLONE_READY = `<div class="nm-clone is-ready">${CHECK}<span class="grow">Runs in <code>C:\\Users\\ramon\\code\\wayfinder-map</code></span><button type="button" class="linkish">Change</button></div>`;
const CLONE_CHOOSE = `<div class="nm-clone is-choose">${FOLDER}<span class="grow">Found 2 clones. Which one should T3 Code use?</span></div>
  <div class="nm-clone-pick"><label class="nm-radio"><input type="radio" name="k" checked /><code>C:\\Users\\ramon\\code\\podcontrol</code></label>
  <label class="nm-radio"><input type="radio" name="k" /><code>D:\\work\\podcontrol-old</code></label>
  <div class="nm-row"><button type="button" class="primary">Use this clone</button><button type="button" class="ghost">${FOLDER}Another folder…</button></div></div>`;
const CLONE_MISSING = `<div class="nm-clone is-missing">${ALERT}<span class="grow">No local clone of ecpl-lockstep yet. T3 Code needs one to work in.</span></div>
  <div class="nm-clone-pick"><div class="nm-row"><button type="button" class="primary">${FOLDER}Choose a folder…</button><button type="button" class="ghost">Clone it for me</button></div>
  <p class="nm-hint">You can still copy the prompt and run it yourself. "Clone it for me" asks where the clone goes, every time.</p></div>`;

const HANDING_OFF = `<div class="nm-result is-working"><div class="nm-result-head"><span class="nm-spin"></span><strong>Handing off to T3 Code…</strong></div>
  <ol class="nm-steps"><li class="is-done">${CHECK}Writing the prompt</li><li class="is-now"><span class="nm-bullet"></span>Opening a worktree in wayfinder-map</li>
  <li><span class="nm-bullet"></span>Starting the planning thread</li></ol></div>`;
const HANDED_OFF = `<div class="nm-result is-done"><div class="nm-result-head">${CHECK}<strong>Planning thread started</strong><span class="nm-when">just now</span></div>
  <p>T3 Code is interviewing you about the goal. Answer there; the map shows up in Wayfinder once the issues exist.</p>
  <dl class="nm-facts"><dt>Repository</dt><dd>RAbdelrhman/wayfinder-map</dd><dt>Worktree</dt><dd><code>C:\\Users\\ramon\\code\\wayfinder-map</code></dd>
  <dt>Branch</dt><dd><code>wayfinder/new-map-draft-mode</code></dd><dt>Model</dt><dd>Mid · Opus 5 · high</dd></dl>
  <div class="nm-row"><a class="primary" href="#">${EXTERNAL}Open in T3 Code</a><button type="button" class="ghost">${COPY}Copy prompt</button><span class="grow"></span><a class="linkish" href="#">Back to Home</a></div></div>`;

const R1 = 'R1 (#36) on this flow:';

window.CANVAS = {
  ticket: 44,
  title: 'Start a new map',
  question:
    'What should starting a new map feel like? Three flows, each covering the repo, the local clone (#32), the goal, ticket vs. map (#31), and the moment of handing off.',
  sampleState:
    'Fake data. Try the repos: wayfinder-map has a clone ready, podcontrol has two to pick from, ecpl-lockstep has none.',

  // Wayfinder's real stylesheet (R2's tokens) plus the pieces the three flows share.
  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/new-map.css'],
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
      title: 'Flows',
      sections: [
        {
          title: 'Chosen: goal first',
          note: 'C, updated with the decisions so far. Maps only: a single ticket is not started from here. Press ▶ to try it full size.',
          items: [
            {
              id: 'C',
              name: 'From the + button',
              src: 'variants/new-map-c.html',
              note: {
                idea:
                  'A composer like a chat box. Nothing is preselected: the repo chip reads "Choose a repository" and Start says why it is disabled. With exactly one clone it settles by itself; otherwise the clone line opens under the composer and collapses into a green chip once settled. The model is a quiet chip with the same Simple / Mid / Hard tiers as a ticket.',
                pros: [
                  'Familiar chat-box shape; type, Ctrl+Enter',
                  'Only one thing to decide up front: the goal',
                  `${R1} map-first, model tucked away, one repo context, durable hand-off result`,
                ],
                cons: ['"Clone it for me" is new server work', 'The hand-off steps need progress events (#55)'],
              },
            },
            {
              id: 'R',
              name: 'From a repository page',
              src: 'variants/new-map-c.html?repo=RAbdelrhman/wayfinder-map',
              note: {
                idea: 'The same page opened from a repository: that repo is preselected and its clone is checked straight away.',
                pros: ['The only case where a repo is preselected'],
                cons: [],
              },
            },
            {
              id: 'P',
              name: 'After Start: the map being planned',
              src: 'variants/new-map-planning.html',
              note: {
                idea:
                  'Start takes you straight to the new map. It lives at a temporary route (/repos/<repo>/maps/draft-<id>) until T3 Code creates the map issue, then moves to the real one. The hand-off card sits on top and the tickets fill in as they are drafted. Use the prototype button at the bottom right to see them arrive.',
                pros: ['You land where the map will be, not on a dead-end result', 'Home can list it as "Being planned"'],
                cons: ['Needs a temporary route and a draft record keyed by the planning thread', 'Overlaps #45 (what you see after leaving)'],
              },
            },
          ],
        },
        {
          title: 'Not chosen',
          note: 'Kept for comparison. These still show the single-ticket path that C dropped.',
          items: [
            {
              id: 'A',
              name: 'One page, map first',
              src: 'variants/new-map-a.html',
              note: {
                idea:
                  "Today's page, focused: one form for a map, with the repo, clone, goal and model in order. A single ticket is a link under the form that swaps the goal for an issue field. Readiness checks sit next to the button, which says why it's disabled. After the hand-off, the form is replaced by a result that stays on the page.",
                pros: [
                  'Closest to what exists; smallest build',
                  'Everything visible at once, action never below the fold',
                  `${R1} map path is primary, model is behind "Model: Mid", one repo context, disabled reason next to the action`,
                ],
                cons: ['Single tickets feel like an afterthought', 'Still a form: says little about what happens next until you press it'],
              },
            },
            {
              id: 'B',
              name: 'Stepped',
              src: 'variants/new-map-b.html',
              note: {
                idea:
                  'A five-step walk: repository, where it runs, map or ticket, the goal or issue, then review and hand off. The stepper keeps each answer visible and editable. The review step shows the exact prompt before anything reaches T3 Code, and the stepper ends on "Handed off".',
                pros: [
                  'Clone problems get their own step instead of an inline warning',
                  'Review step makes the hand-off deliberate and inspectable',
                  `${R1} one question at a time, map vs. ticket asked once, streamed readiness per step`,
                ],
                cons: ['Five clicks for the common case (repo with a clone ready)', 'Heaviest to build, and slow for repeat use'],
              },
            },
          ],
        },
      ],
    },
    {
      title: 'Shared pieces',
      question: 'The same pieces sit inside every flow. React to them separately from the flow you pick.',
      sections: [
        {
          title: 'Local clone (#32)',
          note: 'One line that says where T3 Code will work, and fixes itself in place. Replaces the separate hint, select and button.',
          items: [
            {
              id: 'K',
              kind: 'components',
              name: 'Clone states',
              columns: 2,
              width: 900,
              note: {
                idea: 'Checking, ready, several found, none found. Amber uses --state-blocked, green uses --state-frontier: no new colours.',
                pros: ['Always says why the button is disabled', 'Copy prompt stays open when there is no clone'],
                cons: ['"Clone it for me" is new server work'],
              },
              items: [
                { label: 'Checking', html: CLONE_CHECKING },
                { label: 'Ready', html: CLONE_READY },
                { label: 'Several clones', html: CLONE_CHOOSE },
                { label: 'No clone', html: CLONE_MISSING },
              ],
            },
          ],
        },
        {
          title: 'The moment of handing off',
          note: 'Replaces the toast. It sits at the top of the new map while it is being planned (P).',
          items: [
            {
              id: 'H',
              kind: 'components',
              name: 'Hand-off',
              columns: 2,
              width: 900,
              note: {
                idea: 'Steps tick off while T3 Code starts, then a result with the thread, worktree, branch and a way back.',
                pros: ['R1 P0: a durable result with a thread link, not a toast', 'One verb across the app: "Open in T3 Code"'],
                cons: ['The step list needs progress events from the server (#55). Until then it ships as one spinner line.'],
              },
              items: [
                { label: 'Handing off', html: HANDING_OFF },
                { label: 'Handed off', html: HANDED_OFF },
              ],
            },
          ],
        },
      ],
    },
  ],
};
