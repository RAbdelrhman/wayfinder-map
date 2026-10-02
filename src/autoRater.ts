import { execFile } from 'node:child_process';

import { RATING_RUBRIC_VERSION, ratingCost, ratingInputId } from './autoCalibration.js';
import type { MethodPrediction, TokenUsage } from './autoCalibration.js';
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

/** What a CLI run gives back: its reply, or the reply with the tokens and charge it reported. */
export type CliOutput = string | { output: string; tokens?: TokenUsage | null; chargedUsd?: number | null };

export type CliRun = (command: string, args: readonly string[], input: string, timeoutMs: number) => Promise<CliOutput>;

/** The prediction records what the run measured, for calibration (#186). It never carries the reply or an error message. */
export type ModelRatingResult = { ok: true; rating: Rating; prediction: MethodPrediction } | { ok: false; error: string; prediction: MethodPrediction };

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

/** The CLI that runs a provider instance's models, or null when Wayfinder cannot rate with it. `effort` is the one the command sets, null when it sets none. */
export function ratingCommand(choice: ModelChoice): { command: string; args: string[]; effort: string | null } | null {
  const id = choice.instanceId.toLowerCase();
  if (!supportsModelRating(id)) return null;
  // The model reaches a shell on Windows, so only a slug-shaped value is passed on.
  if (!SLUG.test(choice.model)) return null;
  if (id.startsWith('codex')) {
    return { command: 'codex', args: ['exec', '-m', choice.model, '-c', 'model_reasoning_effort="low"', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-'], effort: 'low' };
  }
  if (id.startsWith('claude')) {
    return { command: 'claude', args: ['-p', '--model', choice.model, '--no-session-persistence'], effort: null };
  }
  return null;
}

/** The total Codex prints on stderr as "tokens used" then a count. It is the whole run, with the CLI's own context. */
export function tokensFromStderr(stderr: string): TokenUsage | null {
  const match = /tokens used\s*\n\s*([\d,]+)/i.exec(stderr);
  const total = match?.[1] === undefined ? Number.NaN : Number(match[1].replace(/,/g, ''));
  return Number.isFinite(total) ? { input: null, cachedInput: null, output: null, total } : null;
}

export const runCli: CliRun = (command, args, input, timeoutMs) =>
  new Promise((resolve, reject) => {
    // Windows installs these CLIs as .cmd shims, which only a shell can start. The arguments are fixed flags and a model slug.
    const child = execFile(command, [...args], { timeout: timeoutMs, windowsHide: true, shell: process.platform === 'win32', maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error !== null) reject(error);
      else resolve({ output: stdout, tokens: tokensFromStderr(stderr) });
    });
    child.stdin?.end(input);
  });

function timedOut(error: unknown): boolean {
  const failure = error as { killed?: unknown; code?: unknown };
  return failure.killed === true || failure.code === 'ETIMEDOUT';
}

/**
 * Rate a ticket with the chosen model and measure the run: time, status, tokens and cost. The measurement
 * is kept whether or not the model answered, so a timeout or a bad reply is a data point, not a gap.
 */
export async function rateWithModel(ticket: RatableTicket, choice: ModelChoice, run: CliRun = runCli): Promise<ModelRatingResult> {
  const cli = ratingCommand(choice);
  const version = `${MODEL_RATING_VERSION}:${choice.model}`;
  const inputId = await ratingInputId(ticket);
  const prediction = (measured: Partial<MethodPrediction> & Pick<MethodPrediction, 'status'>): MethodPrediction => ({
    tier: null,
    version,
    rubric: RATING_RUBRIC_VERSION,
    rater: { provider: choice.instanceId, model: choice.model, effort: cli?.effort ?? null },
    inputId,
    elapsedMs: null,
    tokens: null,
    cost: { kind: 'unavailable' },
    ...measured,
  });
  if (cli === null) return { ok: false, error: `Wayfinder cannot rate with ${choice.instanceId}`, prediction: prediction({ status: 'unsupported' }) };
  const started = performance.now();
  try {
    const reply = await run(cli.command, cli.args, ratingPrompt(ticket), RATING_TIMEOUT_MS);
    const elapsedMs = Math.round(performance.now() - started);
    const { output, tokens, chargedUsd } = typeof reply === 'string' ? { output: reply, tokens: null, chargedUsd: null } : { tokens: null, chargedUsd: null, ...reply };
    const measured = { elapsedMs, tokens, cost: ratingCost({ model: choice.model, tokens, chargedUsd }) };
    const parsed = parseModelRating(output);
    if (parsed === null) return { ok: false, error: `${choice.model} did not answer with a tier`, prediction: prediction({ ...measured, status: 'unparseable' }) };
    return {
      ok: true,
      rating: { tier: parsed.tier, reason: parsed.reason, by: 'model', version },
      prediction: prediction({ ...measured, status: 'ok', tier: parsed.tier }),
    };
  } catch (error) {
    const status = timedOut(error) ? 'timeout' : 'failed';
    return { ok: false, error: `${choice.model} could not rate: ${(error as Error).message.split('\n')[0] ?? 'failed'}`, prediction: prediction({ status, elapsedMs: Math.round(performance.now() - started) }) };
  }
}
