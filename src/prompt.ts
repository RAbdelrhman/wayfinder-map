import type { Ticket, WayfinderMap } from './types.js';

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

Claim the ticket before you start, and close it the way the wayfinder flow does:
answer in a comment, close it, then add the context pointer to the map's
Decisions-so-far.
`;

const STATE_WORDS: Record<Ticket['state'], string> = {
  done: 'closed',
  blocked: 'blocked',
  claimed: 'claimed',
  frontier: 'open, unblocked, unclaimed',
};

export interface PromptInput {
  repo: string;
  map: WayfinderMap;
  ticket: Ticket;
  template?: string;
}

function indent(text: string, prefix = '  '): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return `${prefix}(empty)`;
  return trimmed
    .split(/\r?\n/)
    .map((line) => (line.length === 0 ? line : prefix + line))
    .join('\n');
}

/** Fill the template. An unknown `{{name}}` is left alone rather than blanked. */
export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => values[name] ?? whole);
}

/** The prompt a click on a ticket hands to T3 Code. */
export function buildPrompt({ repo, map, ticket, template = DEFAULT_TEMPLATE }: PromptInput): string {
  const blockedLine =
    ticket.openBlockers.length > 0
      ? `\nBlocked by: ${ticket.openBlockers.map((number) => `#${number}`).join(', ')}`
      : '';

  return renderTemplate(template, {
    repo,
    mapNumber: String(map.number),
    mapTitle: map.title,
    mapUrl: map.url,
    destination: indent(map.sections.destination),
    notes: indent(map.sections.notes),
    decisions: indent(map.sections.decisions),
    fog: indent(map.sections.fog),
    ticketNumber: String(ticket.number),
    ticketTitle: ticket.title,
    ticketType: ticket.type ?? 'untyped',
    ticketState: STATE_WORDS[ticket.state],
    ticketUrl: ticket.url,
    ticketBody: indent(ticket.body),
    blockedLine,
  }).trim();
}
