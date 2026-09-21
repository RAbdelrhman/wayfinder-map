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
Never run \`git stash\` in a shared checkout. If you need to check whether a
failure predates your changes, create a throwaway worktree from HEAD and test
there.

Once you are in the dedicated worktree, claim the ticket before doing ticket
work. Close it the way the wayfinder flow does: answer in a comment, close it,
then add the context pointer to the map's Decisions-so-far.
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

Run the wayfinder workflow to turn this into a map:
1. Interview the user as needed, one question at a time with your recommended
   answer, until the destination, scope, decisions so far, and fog are clear.
   The user is in this thread; never invent their answers.
2. Draft the map and its tickets and show them to the user before creating
   anything. Tickets are research, prototype, grilling, or task, each one small
   enough to close on its own, with the tickets that block it named.
3. Once the user agrees, create the GitHub issues with \`gh\`:
   - one map issue labeled \`{{mapLabel}}\` with Destination, Notes,
     Decisions so far, Fog, and Out of scope sections;
   - one issue per ticket labeled \`{{typePrefix}}<type>\`, added as a sub-issue
     of the map, with its blockers recorded as blocked-by relationships.
4. Reply with the map's link and the ticket numbers.

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

/** Extra instructions for ticket types that need the user, keyed by type. */
const TYPE_STEPS: Partial<Record<TicketType, string>> = {
  grilling: HUMAN_IN_THE_LOOP_STEPS,
  prototype: `${HUMAN_IN_THE_LOOP_STEPS}
Show them the prototype and let them react before settling anything.
When you capture the prototype, commit it to the branch {{prototypeBranch}}
and push it. That exact name is how wayfinder-map finds it later, so do not
pick another. Keep a logic prototype to one self-contained HTML file.`,
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
    ticketNumber: String(ticket.number),
    ticketTitle: ticket.title,
    ticketType: ticket.type ?? 'untyped',
    ticketState: STATE_WORDS[ticket.state],
    ticketUrl: ticket.url,
    ticketBody: indent(ticket.body),
    ticketSlug: slug,
    ...worktreeValues,
    worktreeSteps: renderTemplate(worktree ? PREPARED_WORKTREE_STEPS : WORKTREE_STEPS, worktreeValues),
    prototypeBranch: prototypeBranch(ticket),
    typeSteps: typeSteps ? `\n${renderTemplate(typeSteps, { prototypeBranch: prototypeBranch(ticket) })}\n` : '',
    blockedLine,
  }).trim();
}

/** The prompt `Start a new map` hands to T3 Code: plan the map with the user, then create it on GitHub. */
export function buildNewMapPrompt({ repo, goal, mapLabel, typePrefix, template }: NewMapPromptInput): string {
  return renderTemplate(template ?? DEFAULT_NEW_MAP_TEMPLATE, { repo, goal: indent(goal), mapLabel, typePrefix }).trim();
}
