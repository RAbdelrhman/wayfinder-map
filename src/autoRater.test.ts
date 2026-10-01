import { describe, expect, it, vi } from 'vitest';

import { parseModelRating, ratingCommand, ratingPrompt, rateWithModel } from './autoRater.js';
import type { CliRun } from './autoRater.js';

const ticket = { number: 4, title: 'Queue hand-offs', type: 'task' as const, body: 'Touches `src/a.ts`.', blockedBy: [1, 2] };

describe('parseModelRating', () => {
  it('reads the tier and reason from a JSON reply, with or without chatter around it', () => {
    expect(parseModelRating('{"tier":"hard","reason":"touches 6 files"}')).toEqual({ tier: 'hard', reason: 'touches 6 files' });
    expect(parseModelRating('Sure!\n```json\n{"tier": "Mid", "reason": "a few\\nmodules"}\n```')).toEqual({ tier: 'mid', reason: 'a few modules' });
  });

  it('keeps a tier with no reason and drops a reply with no valid tier', () => {
    expect(parseModelRating('{"tier":"simple"}')).toEqual({ tier: 'simple', reason: 'rated by the model' });
    expect(parseModelRating('{"tier":"impossible","reason":"x"}')).toBeNull();
    expect(parseModelRating('no idea')).toBeNull();
    expect(parseModelRating('{broken')).toBeNull();
  });
});

describe('ratingPrompt', () => {
  it('carries the type, blockers, title and body, and asks for JSON', () => {
    const prompt = ratingPrompt(ticket);
    expect(prompt).toContain('Type: task');
    expect(prompt).toContain('Blocked by: 2 tickets');
    expect(prompt).toContain('Title: Queue hand-offs');
    expect(prompt).toContain('Touches `src/a.ts`.');
    expect(prompt).toContain('{"tier":"simple"|"mid"|"hard"');
  });
});

describe('ratingCommand', () => {
  it('runs Codex and Claude models headless and nothing else', () => {
    expect(ratingCommand({ instanceId: 'codex', model: 'gpt-5.6-luna' })).toMatchObject({ command: 'codex', args: expect.arrayContaining(['exec', '-m', 'gpt-5.6-luna']) as string[] });
    expect(ratingCommand({ instanceId: 'claudeAgent', model: 'sonnet-5' })).toMatchObject({ command: 'claude', args: ['-p', '--model', 'sonnet-5', '--no-session-persistence'] });
    expect(ratingCommand({ instanceId: 'opencode', model: 'x' })).toBeNull();
  });

  it('refuses a model name that is not slug-shaped, because it reaches a shell on Windows', () => {
    expect(ratingCommand({ instanceId: 'codex', model: 'x & calc' })).toBeNull();
    expect(ratingCommand({ instanceId: 'claudeAgent', model: '$(whoami)' })).toBeNull();
  });
});

describe('rateWithModel', () => {
  it("rates with the chosen model's CLI and tags the rating with the model", async () => {
    const run = vi.fn<CliRun>().mockResolvedValue('{"tier":"hard","reason":"concurrent starts"}');
    const result = await rateWithModel(ticket, { instanceId: 'codex', model: 'gpt-5.6-luna' }, run);
    expect(result).toEqual({ ok: true, rating: { tier: 'hard', reason: 'concurrent starts', by: 'model', version: 'model-1:gpt-5.6-luna' } });
    expect(run).toHaveBeenCalledWith('codex', expect.any(Array), expect.stringContaining('Queue hand-offs'), expect.any(Number));
  });

  it('reports why it could not rate, so the caller falls back to the rules', async () => {
    const failing = vi.fn<CliRun>().mockRejectedValue(new Error('spawn codex ENOENT\nmore'));
    expect(await rateWithModel(ticket, { instanceId: 'codex', model: 'gpt-5.6-luna' }, failing)).toEqual({ ok: false, error: 'gpt-5.6-luna could not rate: spawn codex ENOENT' });
    const rambling = vi.fn<CliRun>().mockResolvedValue('I think it is hard.');
    expect(await rateWithModel(ticket, { instanceId: 'codex', model: 'm' }, rambling)).toEqual({ ok: false, error: 'm did not answer with a tier' });
    expect(await rateWithModel(ticket, { instanceId: 'opencode', model: 'm' }, rambling)).toEqual({ ok: false, error: 'Wayfinder cannot rate with opencode' });
  });
});
