import { execFile } from 'node:child_process';

import { MODEL_RATING_VERSION, supportsModelRating } from './autoPick.js';
import type { RatableTicket, Rating } from './autoPick.js';
import { TIERS } from './models.js';
import type { ModelChoice } from './models.js';

/**
 * Rate a ticket with a model the user picked in Settings (#166). T3 Code has no one-shot completion, so this
 * runs the provider's own CLI headless: Codex and Claude Code. Any other provider, and any failure, is
 * reported as an error so the caller falls back to the rules and says so.
 */

const RATING_TIMEOUT_MS = 60_000;
const MAX_BODY_CHARS = 6_000;
const SLUG = /^[\w.:/-]+$/;

export type CliRun = (command: string, args: readonly string[], input: string, timeoutMs: number) => Promise<string>;

export type ModelRatingResult = { ok: true; rating: Rating } | { ok: false; error: string };

export function ratingPrompt(ticket: RatableTicket): string {
  return [
    'Rate how hard this ticket is for a coding agent. Reply with one JSON object and nothing else: {"tier":"simple"|"mid"|"hard","reason":"..."}.',
    'simple: one localized change. mid: a few modules or a nontrivial state flow. hard: open-ended research, cross-cutting architecture, concurrency, or high uncertainty.',
    'The reason is under 12 words and names the concrete cause, for example "touches 6 files". Do not read the repository.',
    '',
    `Type: ${ticket.type ?? 'untyped'}`,
    `Blocked by: ${String(ticket.blockedBy.length)} tickets`,
    `Title: ${ticket.title}`,
    '',
    ticket.body.slice(0, MAX_BODY_CHARS),
  ].join('\n');
}

/** The tier and reason in a model's reply, or null when it did not answer in the format. */
export function parseModelRating(output: string): { tier: Rating['tier']; reason: string } | null {
  const match = /\{[^{}]*\}/.exec(output);
  if (match === null) return null;
  try {
    const parsed = JSON.parse(match[0]) as { tier?: unknown; reason?: unknown };
    const tier = TIERS.find((candidate) => candidate === String(parsed.tier).toLowerCase());
    const reason = typeof parsed.reason === 'string' ? parsed.reason.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    return tier === undefined ? null : { tier, reason: reason === '' ? 'rated by the model' : reason };
  } catch {
    return null;
  }
}

/** The CLI that runs a provider instance's models, or null when Wayfinder cannot rate with it. */
export function ratingCommand(choice: ModelChoice): { command: string; args: string[] } | null {
  const id = choice.instanceId.toLowerCase();
  if (!supportsModelRating(id)) return null;
  // The model reaches a shell on Windows, so only a slug-shaped value is passed on.
  if (!SLUG.test(choice.model)) return null;
  if (id.startsWith('codex')) {
    return { command: 'codex', args: ['exec', '-m', choice.model, '-c', 'model_reasoning_effort="low"', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-'] };
  }
  if (id.startsWith('claude')) {
    return { command: 'claude', args: ['-p', '--model', choice.model, '--no-session-persistence'] };
  }
  return null;
}

export const runCli: CliRun = (command, args, input, timeoutMs) =>
  new Promise((resolve, reject) => {
    // Windows installs these CLIs as .cmd shims, which only a shell can start. The arguments are fixed flags and a model slug.
    const child = execFile(command, [...args], { timeout: timeoutMs, windowsHide: true, shell: process.platform === 'win32', maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error !== null) reject(error);
      else resolve(stdout);
    });
    child.stdin?.end(input);
  });

export async function rateWithModel(ticket: RatableTicket, choice: ModelChoice, run: CliRun = runCli): Promise<ModelRatingResult> {
  const cli = ratingCommand(choice);
  if (cli === null) return { ok: false, error: `Wayfinder cannot rate with ${choice.instanceId}` };
  try {
    const parsed = parseModelRating(await run(cli.command, cli.args, ratingPrompt(ticket), RATING_TIMEOUT_MS));
    if (parsed === null) return { ok: false, error: `${choice.model} did not answer with a tier` };
    return { ok: true, rating: { tier: parsed.tier, reason: parsed.reason, by: 'model', version: `${MODEL_RATING_VERSION}:${choice.model}` } };
  } catch (error) {
    return { ok: false, error: `${choice.model} could not rate: ${(error as Error).message.split('\n')[0] ?? 'failed'}` };
  }
}
