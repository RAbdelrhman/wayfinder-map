import { describe, expect, it } from 'vitest';

import { buildNewMapPrompt, buildPrompt, renderTemplate } from './prompt.js';
import type { Ticket, WayfinderMap } from './types.js';

const map: WayfinderMap = {
  number: 4,
  title: 'One kind of teammate',
  url: 'https://github.com/owner/repo/issues/4',
  body: '',
  open: true,
  author: 'octocat',
  visibility: 'private',
  sections: {
    destination: 'One namespace for teammates.',
    notes: 'Read CONTEXT.md.',
    decisions: '- One namespace.',
    fog: '- How many helpers.',
    outOfScope: '',
  },
  tickets: [],
  outside: [],
  criticalPath: { tickets: [], remaining: 0 },
  stalled: [],
  pullRequests: [],
  settled: null,
  ticketsLoaded: true,
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
  updatedAt: null,
};

describe('renderTemplate', () => {
  it('supplies stable map/ticket IDs even when a saved template omits destinations', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map: { ...map, nodeId: 'map-node' }, ticket: { ...ticket, nodeId: 'ticket-node', type: 'prototype' }, template: 'Build it.' });
    expect(prompt).toContain('[Open map in Wayfinder](wayfinder://map/map-node)');
    expect(prompt).toContain('[Open ticket in Wayfinder](wayfinder://ticket/ticket-node)');
    expect(prompt).toContain('Omit rev to open the newest canvas');
    expect(prompt).toContain('exact current thread link');
  });
  it('fills known placeholders', () => {
    expect(renderTemplate('hi {{name}}', { name: 'there' })).toBe('hi there');
  });

  it('leaves an unknown placeholder alone rather than blanking it', () => {
    expect(renderTemplate('hi {{nope}}', {})).toBe('hi {{nope}}');
  });
});

describe('buildPrompt', () => {
  it.each([undefined, 'Ticket {{ticketNumber}}', 'Map {{mapAppUrl}}'])('requires destination links even with saved template %j', (template) => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket, ...(template === undefined ? {} : { template }) });
    expect(prompt).toContain('[Open map in Wayfinder](wayfinder://map?repo=owner%2Frepo&number=4)');
    expect(prompt).toContain('exact current thread link supplied by T3 Code');
    expect(prompt).not.toContain('{{mapAppUrl}}');
  });
  it.each([undefined, '{{mapRules}}', 'Ticket {{ticketNumber}}'])('keeps map isolation mandatory with template %j', (template) => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket, ...(template === undefined ? {} : { template }) });
    expect(prompt.match(/No cross-map tickets or dependencies\./g)).toHaveLength(1);
    expect(prompt).toContain('Every ticket and every blocker must belong to this map.');
  });

  describe.each([['map', map], ['standalone', null]] as const)('%s grilling hand-offs', (_name, parentMap) => {
    it.each(['', ' \n\t '])('uses the complete default prompt for a blank saved template %j', (template) => {
      const input = { repo: 'owner/repo', map: parentMap, ticket: { ...ticket, type: 'grilling' as const } };
      const prompt = buildPrompt({ ...input, template });
      expect(prompt).toBe(buildPrompt(input));
      expect(prompt).toContain(`#${ticket.number} ${ticket.title}`);
      expect(prompt).toContain(ticket.url);
      expect(prompt).toContain(ticket.body);
      expect(prompt).toContain('create and enter a dedicated');
    });

    it.each([
      ['default', undefined],
      ['custom with type steps', '{{typeSteps}}\nTicket {{ticketNumber}}'],
      ['legacy custom', 'Ticket {{ticketNumber}}'],
      ['empty custom', ''],
    ])('retains the question-card contract with a %s template', (_label, template) => {
      const prompt = buildPrompt({
        repo: 'owner/repo', map: parentMap, ticket: { ...ticket, type: 'grilling' }, template,
        worktree: { branch: 'feature/grilling', baseBranch: 'main' },
      });
      const normalized = prompt.replace(/\s+/g, ' ');
      expect(prompt.match(/Use T3 Code's structured question cards/g)).toHaveLength(1);
      for (const instruction of [
        'Discover the question skill/tool actually available in this thread',
        "Claude's AskUserQuestion and Codex's request_user_input",
        'only when its tool instructions and current mode permit it',
        "submit the card and yield until the user's response arrives",
        'Never use t3_pending_request_respond to answer for the user',
        'Submit exactly one question per card',
        'recommended answer clearly marked, explaining the tradeoff',
        'Wait for an actual user response before asking the next question, recording a decision, answering or closing the ticket, or implementing the decision',
        'A default or preselected option, silence, timeout, cancellation, empty tool result, or unsubmitted form is not agreement',
        'If no permitted structured question mechanism is available, stop and report that limitation',
        'The user owns every product decision',
        'They decide the answer, you don\'t',
        'file a prototype ticket that shows the options',
        'Never record a layout, a placement or a control as decided here',
      ]) expect(normalized).toContain(instruction);
      expect(prompt).not.toContain('{{typeSteps}}');
    });
  });

  it.each(['task', 'research', 'prototype', null] as const)('does not impose grilling cards on %s tickets', (type) => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type } });
    expect(prompt).not.toContain("Use T3 Code's structured question cards");
  });

  it('tells the agent to grill the user on human-in-the-loop tickets', () => {
    for (const type of ['grilling', 'prototype'] as const) {
      const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type } });
      expect(prompt).toContain('This is a human-in-the-loop ticket');
      expect(prompt).toContain('Never treat\nthis session as unattended');
      expect(prompt.indexOf('human-in-the-loop')).toBeLessThan(prompt.indexOf('Close it the way'));
    }
  });

  it('files follow-up tickets on the map, not in its fog', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket });
    expect(prompt).toContain('File any follow-up\ntickets as sub-issues of map #4');
  });

  it('gives every map ticket the UI, Needs and verifier rules, before the close-out', () => {
    for (const type of ['task', 'research', 'grilling', 'prototype'] as const) {
      const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type } });
      expect(prompt).toContain('The user sees every UI before it is chosen.');
      expect(prompt).toContain('take turns through Needs');
      expect(prompt).toContain('the lower-numbered ticket goes first');
      expect(prompt).toContain('have an independent verifier check the work');
      expect(prompt).toContain('Merge only\n  when every item passes');
      expect(prompt).not.toContain('{{mapRules}}');
      expect(prompt.indexOf('Rules for every ticket')).toBeLessThan(prompt.indexOf('Close it the way'));
    }
  });

  it('keeps layout decisions out of grilling and every option in front of the user on prototypes', () => {
    expect(buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'grilling' } })).toContain('decides what the app does, not what it looks like');
    const prototype = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prototype).toContain('Show the user every option, including any you would drop.');
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
    expect(prompt).toContain('append --mobile');
    expect(prompt).toContain('prototypes/AGENTS.md');
    expect(prompt).toContain('never stack frames or force other devices into a phone preset');
    expect(prompt).toContain('viewport checks are layout evidence, not real device tests');
    expect(buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'task' } })).not.toContain('design canvas');
  });

  it('guides prototype flow comparisons without imposing that layout on other canvases or ticket types', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prompt).toContain('start with an Overview comparing every\noption');
    expect(prompt).toContain('each option a separate named page with its individual\nscreens and states in flow order');
    expect(prompt).toContain('Keep phone-shaped Present views');
    expect(prompt).toContain('non-flow canvases can use a simpler layout');
    expect(prompt).toContain('"Comparing flow options" guidance');
    expect(prompt).toContain('was not picked: give it no disposition');
    for (const type of ['task', 'research', 'grilling', null] as const) {
      const other = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type } });
      expect(other).not.toContain('start with an Overview');
    }
  });

  describe.each([['mapped', map], ['standalone', undefined]] as const)('prototype template fallback for %s tickets', (_context, parentMap) => {
    it.each([
      ['default', undefined],
      ['custom with type steps', '{{typeSteps}}\nTicket {{ticketNumber}}'],
      ['legacy custom', 'Ticket {{ticketNumber}}'],
      ['empty custom', ''],
      ['whitespace custom', ' \n\t '],
    ])('keeps the flow and decision guidance exactly once with a %s template', (_label, template) => {
      const prompt = buildPrompt({
        repo: 'owner/repo', map: parentMap, ticket: { ...ticket, type: 'prototype' }, template,
      });
      expect(prompt.split('start with an Overview')).toHaveLength(2);
      expect(prompt).toContain('each option a separate named page');
      expect(prompt).toContain('Keep phone-shaped Present views');
      expect(prompt).toContain('non-flow canvases can use a simpler layout');
      expect(prompt).toContain('was not picked: give it no disposition');
      expect(prompt).toContain('prototypes/11-retire-api-agents-once-nothing-needs-it');
      expect(prompt).not.toContain('{{typeSteps}}');
      expect(prompt).not.toContain('{{canvasDirectory}}');
      if (template?.trim()) expect(prompt).toContain('Ticket 11');
      else {
        expect(prompt).toContain('Delete the route and its call sites.');
        expect(prompt).toContain('dedicated');
      }
    });
  });

  it('gives each ticket its own canvas and shares a preview before asking for a choice', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prompt).toContain('directory is prototypes/11-retire-api-agents-once-nothing-needs-it');
    expect(prompt).toContain('never append');
    expect(prompt).toContain('--ticket 11');
    expect(prompt).toContain('Set config.js ticket to 11');
    expect(prompt).toContain('BEFORE asking the user to choose');
    expect(prompt).not.toContain('has prototypes/canvas, build on it');
    expect(prompt).not.toContain('{{canvasDirectory}}');
    const other = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, number: 12, type: 'prototype' } });
    expect(other).toContain('directory is prototypes/12-retire-api-agents-once-nothing-needs-it');
  });

  it('keeps variant feedback, remix lineage, and review checks in the prototype workflow', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prompt).toContain('Keep, Change, or Combine');
    expect(prompt).toContain('note basedOn metadata');
    expect(prompt).toContain('Design review');
    expect(prompt).toContain('keyboard/focus');
    expect(prompt).toContain('Not checked');
  });

  it('has the user review the canvas in Wayfinder and reads the notes they post', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prompt).toContain('tell the user it is ready in Wayfinder');
    expect(prompt).toContain('Do not send localhost links');
    expect(prompt).toContain('"Canvas notes from Wayfinder" comment on this ticket');
    expect(prompt).toContain('was not picked');
    expect(prompt).not.toContain('exact link and visible preview');
    expect(prompt).not.toContain('select and copy');
  });

  it('keeps whole-page notes in the summary and covers prototypes on no map', () => {
    const prompt = buildPrompt({ repo: 'owner/repo', map, ticket: { ...ticket, type: 'prototype' } });
    expect(prompt).toContain('Whole-page notes count too');
    expect(prompt).toContain('ask how they apply');
    expect(prompt).toContain('If this ticket is on no map');
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

    expect(prompt.split('\n\n')[0]).toBe(
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

    expect(prompt.split('\n\n')[0]).toBe('11-ticket');
  });

  it('calls out open blockers', () => {
    expect(buildPrompt({ repo: 'owner/repo', map, ticket })).toContain('Blocked by: #27');
  });

  it('leaves the blocker line out when nothing blocks the ticket', () => {
    const free: Ticket = { ...ticket, blockedBy: [], openBlockers: [], state: 'frontier', updatedAt: null };
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
  it('teaches a new-map agent to report a native destination with the created issue number', () => {
    const prompt = buildNewMapPrompt({ repo: 'o/r', goal: 'x', mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', template: 'Plan {{goal}}' });
    expect(prompt).toContain('wayfinder://map?repo=o%2Fr&number=NUMBER');
    expect(prompt).toContain('[Open map in Wayfinder](wayfinder://map/MAP_NODE_ID)');
    expect(prompt).toContain('replacing MAP_NODE_ID with that URL-encoded ID');
    expect(prompt).toContain('with the actual issue number');
    expect(prompt).toContain('exact current thread link');
  });
  it.each([undefined, 'Plan {{goal}}'])('forbids cross-map links even in saved planning template %j', (template) => {
    const result = buildNewMapPrompt({ repo: 'o/r', goal: 'x', mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', ...(template === undefined ? {} : { template }) });
    expect(result.match(/No cross-map tickets or dependencies\./g)).toHaveLength(1);
  });

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

  it('spells out the map format, so no particular skill is needed', () => {
    expect(prompt).not.toContain('Run the wayfinder workflow');
    expect(prompt).toContain('no particular skill is\nneeded');
    expect(prompt).toContain('`## Destination`');
    expect(prompt).toContain('blocked-by relationships');
  });

  it('asks whether the map is private or public, and marks a public one', () => {
    expect(prompt).toContain('stay private (the default');
    expect(prompt).toContain('`Visibility: public`');
    expect(prompt).toContain('whether it is private or public');
  });

  it('asks T3 to interview the user and create the map and tickets', () => {
    expect(prompt).toContain('Interview the user as needed');
    expect(prompt).toContain('labeled `wayfinder:map`');
    expect(prompt).toContain('labeled `wayfinder:<type>`');
    expect(prompt).toContain('sub-issue');
    expect(prompt).toContain("Use the user's goal as the map issue title, normalizing whitespace only.");
  });

  it('puts UI behind a prototype and chains tickets that change the same part of the app', () => {
    expect(prompt).toContain('needs a prototype ticket that shows that UI');
    expect(prompt).toContain('need one\n   another in a chain');
  });

  it('uses the configured labels', () => {
    const custom = buildNewMapPrompt({ repo: 'o/r', goal: 'x', mapLabel: 'plan:map', typePrefix: 'plan:' });
    expect(custom).toContain('labeled `plan:map`');
    expect(custom).toContain('labeled `plan:<type>`');
  });
});
