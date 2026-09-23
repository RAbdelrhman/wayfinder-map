import { describe, expect, it } from 'vitest';

import { buildNewMapPrompt, buildPrompt, renderTemplate } from './prompt.js';
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
  it('tells the agent to grill the user on human-in-the-loop tickets', () => {
    for (const type of ['grilling', 'prototype'] as const) {
      const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type } });
      expect(prompt).toContain('This is a human-in-the-loop ticket');
      expect(prompt).toContain('Never treat\nthis session as unattended');
      expect(prompt.indexOf('human-in-the-loop')).toBeLessThan(prompt.indexOf('Close it the way'));
    }
  });

  it('sends prototype tickets to their prototype/<n>-<slug> branch', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prompt).toContain('commit it to the branch prototype/11-retire-api-agents-once-nothing-needs-it');
    expect(prompt).not.toContain('{{prototypeBranch}}');
  });

  it('asks prototype tickets to save a runnable snapshot', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prompt).toContain('prototype-snapshot.html');
    expect(prompt).toContain('CSS and JavaScript inlined');
  });

  it('points visual prototype tickets at the design canvas', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prompt).toContain('design canvas');
    expect(prompt).toContain('design-canvas/scaffold.mjs');
    expect(buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'task' } })).not.toContain('design canvas');
  });

  it('keeps variant feedback, remix lineage, and review checks in the prototype workflow', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prompt).toContain('Keep, Change, or Combine');
    expect(prompt).toContain('note basedOn metadata');
    expect(prompt).toContain('Design review');
    expect(prompt).toContain('keyboard/focus');
    expect(prompt).toContain('Not checked');
  });

  it('only names a prototype branch on prototype tickets', () => {
    for (const type of ['grilling', 'research', 'task', null] as const) {
      expect(buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type } })).not.toContain('prototype/');
    }
  });

  it('leaves AFK tickets without the human-in-the-loop instructions', () => {
    for (const type of ['research', 'task', null] as const) {
      const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type } });
      expect(prompt).not.toContain('human-in-the-loop');
      expect(prompt).not.toMatch(/\n\n\n/);
    }
  });

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

  it('directs the agent into a ticket-specific worktree before claiming', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket });
    const worktree = 'Worktree: ../wayfinder-11-retire-api-agents-once-nothing-needs-it';
    const branch = 'Branch:   wayfinder/11-retire-api-agents-once-nothing-needs-it';

    expect(prompt).toContain(worktree);
    expect(prompt).toContain(branch);
    expect(prompt.indexOf(worktree)).toBeLessThan(prompt.indexOf('Once you are in the dedicated worktree'));
    expect(prompt).toContain('If the worktree cannot be created, stop and report the problem.');
    expect(prompt).toContain('Do not fall back to the primary checkout.');
    expect(prompt).toContain('Never run `git stash` in a shared checkout.');
    expect(prompt).toContain('create a throwaway worktree from HEAD');
  });

  it('says the worktree is ready when T3 Code already made it', () => {
    const prompt = buildPrompt({
      repo: 'owner/repo',
      map,
      ticket,
      worktree: { branch: 'wayfinder/11-retire-2', baseBranch: 'main' },
    });

    expect(prompt).toContain('already in a dedicated git worktree on branch wayfinder/11-retire-2');
    expect(prompt).toContain('made\nfrom main.');
    expect(prompt).not.toContain('create and enter a dedicated');
  });

  it('makes derived worktree placeholders available to custom templates', () => {
    const prompt = buildPrompt({
      repo: 'owner/repo',
      map,
      ticket,
      template: '{{ticketSlug}}\n{{worktreeName}}\n{{branchName}}',
    });

    expect(prompt).toBe(
      '11-retire-api-agents-once-nothing-needs-it\n' +
        '../wayfinder-11-retire-api-agents-once-nothing-needs-it\n' +
        'wayfinder/11-retire-api-agents-once-nothing-needs-it',
    );
  });

  it('uses a safe fallback when a title has no ASCII slug characters', () => {
    const prompt = buildPrompt({
      repo: 'owner/repo',
      map,
      ticket: { ...ticket, title: '日本語' },
      template: '{{ticketSlug}}',
    });

    expect(prompt).toBe('11-ticket');
  });

  it('calls out open blockers', () => {
    expect(buildPrompt({ repo: 'owner/repo', map, ticket })).toContain('Blocked by: #27');
  });

  it('leaves the blocker line out when nothing blocks the ticket', () => {
    const free: Ticket = { ...ticket, blockedBy: [], openBlockers: [], state: 'frontier' };
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: free });
    expect(prompt).not.toContain('Blocked by');
  });

  it('generates a standalone prompt when no map is provided', () => {
    const standalonePrompt = buildPrompt({ repo: 'owner/repo', ticket });
    expect(standalonePrompt).toContain('Pick up ticket #11 in owner/repo.');
    expect(standalonePrompt).toContain('#11 Retire /api/agents once nothing needs it');
    expect(standalonePrompt).toContain('Worktree: ../wayfinder-11-retire-api-agents-once-nothing-needs-it');
    expect(standalonePrompt).not.toContain('Where the map is heading');
  });
});

describe('buildNewMapPrompt', () => {
  const prompt = buildNewMapPrompt({
    repo: 'owner/repo',
    goal: 'Build an offline-first sync engine.\n\nKeep drafts local.',
    mapLabel: 'wayfinder:map',
    typePrefix: 'wayfinder:',
  });

  it('names the repository and carries the goal verbatim, indented', () => {
    expect(prompt).toContain('Start a new wayfinder map in owner/repo.');
    expect(prompt).toContain('  Build an offline-first sync engine.\n\n  Keep drafts local.');
  });

  it('asks T3 to run the wayfinder workflow, interview the user, and create the map and tickets', () => {
    expect(prompt).toContain('Run the wayfinder workflow');
    expect(prompt).toContain('Interview the user as needed');
    expect(prompt).toContain('labeled `wayfinder:map`');
    expect(prompt).toContain('labeled `wayfinder:<type>`');
    expect(prompt).toContain('sub-issue');
  });

  it('uses the configured labels', () => {
    const custom = buildNewMapPrompt({ repo: 'o/r', goal: 'x', mapLabel: 'plan:map', typePrefix: 'plan:' });
    expect(custom).toContain('labeled `plan:map`');
    expect(custom).toContain('labeled `plan:<type>`');
  });
});
