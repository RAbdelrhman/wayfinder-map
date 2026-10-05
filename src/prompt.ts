import { PROTOTYPE_BRANCH_PREFIX } from './prototypes.js';
import type { Ticket, TicketType, WayfinderMap } from './types.js';

export const DEFAULT_TEMPLATE = `Pick up wayfinder ticket #{{ticketNumber}} on the "{{mapTitle}}" map.

Repo:    {{repo}}
Map:     #{{mapNumber}} {{mapTitle}} ({{mapUrl}})
Ticket:  #{{ticketNumber}} {{ticketTitle}}
Type:    {{ticketType}}
State:   {{ticketState}}{{blockedLine}}
Link:    {{ticketUrl}}

Where the map is heading:
{{destination}}

What the ticket says:
{{ticketBody}}

{{worktreeSteps}}
{{typeSteps}}
{{mapRules}}

Never run \`git stash\` in a shared checkout. If you need to check whether a
failure predates your changes, create a throwaway worktree from HEAD and test
there.

Once you are in the dedicated worktree, claim the ticket before doing ticket
work. Close it the way the wayfinder flow does: answer in a comment, close it,
then add the context pointer to the map's Decisions-so-far. File any follow-up
tickets as sub-issues of map #{{mapNumber}}, labeled like its other tickets, so
they land on the map rather than in its fog.
`;

export const DEFAULT_STANDALONE_TEMPLATE = `Pick up ticket #{{ticketNumber}} in {{repo}}.

Repo:    {{repo}}
Ticket:  #{{ticketNumber}} {{ticketTitle}}
Type:    {{ticketType}}
State:   {{ticketState}}{{blockedLine}}
Link:    {{ticketUrl}}

What the ticket says:
{{ticketBody}}

{{worktreeSteps}}
{{typeSteps}}
Never run \`git stash\` in a shared checkout. If you need to check whether a
failure predates your changes, create a throwaway worktree from HEAD and test
there.

Once you are in the dedicated worktree, claim the ticket before doing ticket
work. Close it when work is completed.
`;

export const DEFAULT_NEW_MAP_TEMPLATE = `Start a new wayfinder map in {{repo}}.

What the user wants to accomplish:
{{goal}}

Turn this into a map. A map is plain GitHub issues, so no particular skill is
needed. If a wayfinder skill is installed you may use it, as long as the issues
come out in the format below.
1. Interview the user as needed, one question at a time with your recommended
   answer, until the destination, scope, decisions so far, and fog are clear.
   Also ask whether the map should stay private (the default: only its author
   sees it in Wayfinder) or be public, so others in the repository can follow it.
   The user is in this thread; never invent their answers.
2. Draft the map and its tickets and show them to the user before creating
   anything. Tickets are research, prototype, grilling, or task, each one small
   enough to close on its own, with the tickets that block it named.
   The user sees every UI before it is chosen, so a ticket that adds or
   changes UI needs a prototype ticket that shows that UI. Tickets that change
   the same part of the app (the same screen, control or code) need one
   another in a chain, so only one of them is ever next.
3. Once the user agrees, create the GitHub issues with \`gh\`, creating any
   missing labels first:
   - one map issue labeled \`{{mapLabel}}\` whose body has \`## Destination\`,
     \`## Notes\`, \`## Decisions so far\`, \`## Fog\` and \`## Out of scope\`
     sections. If the user chose public, add a line reading exactly
     \`Visibility: public\` to the body; leave it out for a private map;
   - one issue per ticket labeled \`{{typePrefix}}<type>\` with \`## Question\`
     and \`## Done when\` sections, added as a sub-issue of the map, with its
     blockers recorded as GitHub blocked-by relationships.
   Use the user's goal as the map issue title, normalizing whitespace only.
   Wayfinder uses that title to move the planning page to the new map route.
4. Reply with the map's link, whether it is private or public, and the ticket
   numbers.

Do not start work on any ticket. Planning the map is the whole job here.
`;

const STATE_WORDS: Record<Ticket['state'], string> = {
  done: 'closed',
  blocked: 'blocked',
  claimed: 'claimed',
  frontier: 'open, unblocked, unclaimed',
};

/** A worktree T3 Code already made for the thread, so the prompt should not ask for another. */
export interface PreparedWorktree {
  branch: string;
  baseBranch: string;
}

export interface PromptInput {
  repo: string;
  map?: WayfinderMap | null | undefined;
  ticket: Ticket;
  template?: string | null | undefined;
  worktree?: PreparedWorktree | null | undefined;
}

export interface NewMapPromptInput {
  repo: string;
  goal: string;
  /** The labels the map and its tickets get, so Wayfinder can find them afterwards. */
  mapLabel: string;
  typePrefix: string;
  template?: string | null | undefined;
}

const WORKTREE_STEPS = `Before you claim the ticket or change any files, create and enter a dedicated
git worktree from the target repo's current HEAD:
  Worktree: {{worktreeName}}
  Branch:   {{branchName}}
If the worktree cannot be created, stop and report the problem.
Do not fall back to the primary checkout.`;

const PREPARED_WORKTREE_STEPS = `You are already in a dedicated git worktree on branch {{branchName}}, made
from {{baseBranch}}. Do all ticket work here. Do not switch to the primary
checkout.`;

const HUMAN_IN_THE_LOOP_STEPS = `This is a human-in-the-loop ticket, and the user is in this thread. They
decide the answer, you don't. Grill them: ask one question at a time, with
your recommended answer, and wait for their reply before going on. Never treat
this session as unattended, and never answer, close or record a decision the
user hasn't agreed to. If you can't reach the user, stop and say so.`;

/**
 * Rules every ticket on a map gets: the user sees UI before it is chosen, tickets that change the same
 * part of the app take turns through Needs, and an independent verifier checks the work before it merges.
 */
const MAP_RULES = `Rules for every ticket on a map:
- The user sees every UI before it is chosen. Build only UI that a prototype
  the user picked shows. If this ticket needs a control, screen, layout or
  copy that no chosen prototype shows, or would add a second control for
  something the app already has, don't build it. Stop, tell the user, file a
  prototype ticket that this one needs, and leave this ticket open.
- Tickets that change the same part of the app (the same screen, control or
  code) take turns through Needs, GitHub's blocked-by link. Before you start,
  read the map's other open tickets. If one changes the same part as this one
  and neither needs the other, the lower-numbered ticket goes first: add the
  blocked-by link so the higher-numbered one needs the lower-numbered one. If
  that leaves this ticket blocked, unassign yourself, tell the user, and stop.
  A follow-up ticket you file needs every open ticket that changes the same
  part of the app.
- Before you merge, have an independent verifier check the work: a fresh agent
  that didn't write it, on another model when you can (Codex for a Claude
  session, Claude for a Codex session). Give it the ticket's Done when items
  word for word, the decisions and the chosen prototype the ticket relies on,
  and the diff against the base branch. It marks each Done when item Pass,
  with evidence (a test, a command's output, a screenshot), or Fail, or Not
  verified. It also answers three questions: Does the diff add or change UI
  that no chosen prototype shows? Does it add a control for something the app
  already has one for? Does it change a part of the app that another open
  ticket on the map also changes, when neither needs the other? Merge only
  when every item passes and every answer is no. Otherwise fix the work, or
  keep the ticket open and report what failed. Put the verifier's report in
  the closing comment.`;

/** Extra instructions for ticket types that need the user, keyed by type. */
const TYPE_STEPS: Partial<Record<TicketType, string>> = {
  grilling: `${HUMAN_IN_THE_LOOP_STEPS}
A grilling ticket decides what the app does, not what it looks like. If the
answer needs new or changed UI, record what that UI must do and file a
prototype ticket that shows the options. Never record a layout, a placement or
a control as decided here.`,
  prototype: `${HUMAN_IN_THE_LOOP_STEPS}
Show the user every option, including any you would drop. Never pick, drop or
merge options for them: only what they pick here may be built.
Show the canvas and collect feedback on one option at a time. For each option,
ask whether they want to Keep, Change, or Combine it. Have them select and copy
the generated feedback line into the thread, then record their agreed choice
and detail in that option's note metadata fields disposition and feedback. Never
infer a decision from a blank or unsubmitted form.
Keep the original options. Put each remix on a named page with a round label,
and record source option IDs in each remixed item's note basedOn metadata.
Before presenting, inspect the real token and component sources; check both
themes, relevant interaction states, keyboard/focus, semantics, responsive
behavior, and contrast. Add a visible Design review note that lists sources,
checks, findings, and anything not checked. Mark missing visual or accessibility
evidence as Not checked in the note and handoff.
When you capture the prototype, commit it to the branch {{prototypeBranch}}
and push it. That exact name is how wayfinder-map finds it later, so do not
pick another. When the question is visual or UX, build the prototype as a
design canvas: a board showing the options side by side (pages, styles,
components, palettes, moodboards) with a note on each. This ticket's canvas
directory is {{canvasDirectory}}. Create a fresh canvas there; never append
this ticket's options to an unrelated canvas, including prototypes/canvas.
If the directory already exists, inspect its config.js and continue there only
when it belongs to this ticket. Preserve its earlier rounds and options.
If the repo provides canvas:create, run bun run canvas:create {{ticketSlug}}
--ticket {{ticketNumber}}. Otherwise, use the design-canvas skill with an
explicit directory: node ~/.claude/skills/design-canvas/scaffold.mjs
{{canvasDirectory}}. Set config.js ticket to {{ticketNumber}}.
Follow {{canvasDirectory}}/README.md, and make node
{{canvasDirectory}}/tools/check.mjs pass before you show the user.
Inspect the running canvas, then provide its exact link and visible preview
BEFORE asking the user to choose. Ask one product decision at a time.
wayfinder-map opens a canvas (an index.html with its config.js beside it)
before any other file. For any other prototype, commit
prototype-snapshot.html at the branch root: the prototype as one HTML file
with its CSS and JavaScript inlined, no paths starting with /, and no calls
to a server. That file is what people click to see the prototype running
later, long after the app has moved on.`,
};

function indent(text: string, prefix = '  '): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return `${prefix}(empty)`;
  return trimmed
    .split(/\r?\n/)
    .map((line) => (line.length === 0 ? line : prefix + line))
    .join('\n');
}

/** `12-some-title`, the stem of the ticket's worktree and branch names. */
export function ticketSlug(ticket: Pick<Ticket, 'number' | 'title'>): string {
  return `${String(ticket.number)}-${slugifyTitle(ticket.title)}`;
}

/** The throwaway branch a prototype ticket's prototype is kept on. */
export function prototypeBranch(ticket: Pick<Ticket, 'number' | 'title'>): string {
  return `${PROTOTYPE_BRANCH_PREFIX}${ticketSlug(ticket)}`;
}

/** The branch a ticket's work lands on. */
export function ticketBranch(ticket: Pick<Ticket, 'number' | 'title'>): string {
  return `wayfinder/${ticketSlug(ticket)}`;
}

function slugifyTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || 'ticket';
}

/** Fill the template. An unknown `{{name}}` is left alone rather than blanked. */
export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => values[name] ?? whole);
}

/** The prompt a click on a ticket hands to T3 Code. */
export function buildPrompt({ repo, map, ticket, template, worktree }: PromptInput): string {
  const chosenTemplate = template ?? (map ? DEFAULT_TEMPLATE : DEFAULT_STANDALONE_TEMPLATE);
  const blockedLine =
    ticket.openBlockers.length > 0
      ? `\nBlocked by: ${ticket.openBlockers.map((number) => `#${number}`).join(', ')}`
      : '';
  const slug = ticketSlug(ticket);
  const prototypeValues = {
    prototypeBranch: prototypeBranch(ticket),
    canvasDirectory: `prototypes/${slug}`,
    ticketSlug: slug,
    ticketNumber: String(ticket.number),
  };
  const typeSteps = ticket.type ? TYPE_STEPS[ticket.type] : undefined;
  const branchName = worktree?.branch ?? ticketBranch(ticket);
  const worktreeValues = {
    worktreeName: `../wayfinder-${slug}`,
    branchName,
    baseBranch: worktree?.baseBranch ?? 'HEAD',
  };

  const mapValues: Record<string, string> = map
    ? {
        mapNumber: String(map.number),
        mapTitle: map.title,
        mapUrl: map.url,
        destination: indent(map.sections.destination),
        notes: indent(map.sections.notes),
        decisions: indent(map.sections.decisions),
        fog: indent(map.sections.fog),
      }
    : {
        mapNumber: '',
        mapTitle: '',
        mapUrl: '',
        destination: '',
        notes: '',
        decisions: '',
        fog: '',
      };

  return renderTemplate(chosenTemplate, {
    repo,
    ...mapValues,
    ticketTitle: ticket.title,
    ticketType: ticket.type ?? 'untyped',
    ticketState: STATE_WORDS[ticket.state],
    ticketUrl: ticket.url,
    ticketBody: indent(ticket.body),
    ...worktreeValues,
    worktreeSteps: renderTemplate(worktree ? PREPARED_WORKTREE_STEPS : WORKTREE_STEPS, worktreeValues),
    ...prototypeValues,
    typeSteps: typeSteps ? `\n${renderTemplate(typeSteps, prototypeValues)}\n` : '',
    mapRules: MAP_RULES,
    blockedLine,
  }).trim();
}

/** The prompt `Start a new map` hands to T3 Code: plan the map with the user, then create it on GitHub. */
export function buildNewMapPrompt({ repo, goal, mapLabel, typePrefix, template }: NewMapPromptInput): string {
  return renderTemplate(template ?? DEFAULT_NEW_MAP_TEMPLATE, { repo, goal: indent(goal), mapLabel, typePrefix }).trim();
}
