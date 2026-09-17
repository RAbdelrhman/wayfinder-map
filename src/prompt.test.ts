import { describe, expect, it } from 'vitest';

import { buildPrompt, renderTemplate } from './prompt.js';
import type { Ticket, WayfinderMap } from './types.js';

const map: WayfinderMap = {
  number: 4,
  title: 'One kind of teammate',
  url: 'https://github.com/owner/repo/issues/4',
  body: '',
  open: true,
  sections: {
    destination: 'One namespace for teammates.',
    notes: 'Read CONTEXT.md.',
    decisions: '- One namespace.',
    fog: '- How many helpers.',
    outOfScope: '',
  },
  tickets: [],
};

const ticket: Ticket = {
  number: 11,
  title: 'Retire /api/agents once nothing needs it',
  url: 'https://github.com/owner/repo/issues/11',
  body: 'Delete the route and its call sites.',
  type: 'task',
  labels: ['wayfinder:task'],
  open: true,
  assignee: null,
  blockedBy: [27],
  openBlockers: [27],
  state: 'blocked',
};

describe('renderTemplate', () => {
  it('fills known placeholders', () => {
    expect(renderTemplate('hi {{name}}', { name: 'there' })).toBe('hi there');
  });

  it('leaves an unknown placeholder alone rather than blanking it', () => {
    expect(renderTemplate('hi {{nope}}', {})).toBe('hi {{nope}}');
  });
});

describe('buildPrompt', () => {
  it('names the repo, the map and the ticket', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket });
    expect(prompt).toContain('owner/repo');
    expect(prompt).toContain('#4 One kind of teammate');
    expect(prompt).toContain('#11 Retire /api/agents once nothing needs it');
    expect(prompt).toContain('https://github.com/owner/repo/issues/11');
  });

  it('carries the map destination and the ticket body', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket });
    expect(prompt).toContain('One namespace for teammates.');
    expect(prompt).toContain('Delete the route and its call sites.');
  });

  it('calls out open blockers', () => {
    expect(buildPrompt({ repo: 'owner/repo', map, ticket })).toContain('Blocked by: #27');
  });

  it('leaves the blocker line out when nothing blocks the ticket', () => {
    const free: Ticket = { ...ticket, blockedBy: [], openBlockers: [], state: 'frontier' };
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: free });
    expect(prompt).not.toContain('Blocked by');
    expect(prompt).toContain('open, unblocked, unclaimed');
  });

  it('honours a custom template', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket, template: 'do {{ticketNumber}} now' });
    expect(prompt).toBe('do 11 now');
  });

  it('marks an empty body rather than leaving a hole', () => {
    const bare: Ticket = { ...ticket, body: '' };
    expect(buildPrompt({ repo: 'owner/repo', map, ticket: bare })).toContain('(empty)');
  });
});
