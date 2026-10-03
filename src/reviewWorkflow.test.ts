import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const review = readFileSync(new URL('../.github/workflows/claude-review.yml', import.meta.url), 'utf8');
const release = readFileSync(new URL('../.github/workflows/release-please.yml', import.meta.url), 'utf8');

function script(workflow: string): string {
  const match = workflow.match(/          script: \|\n((?:            .*\n|\n)+)/);
  if (!match?.[1]) throw new Error('Workflow script missing');
  return match[1].replace(/^            /gm, '');
}

function pullRequest() {
  return {
    number: 201,
    state: 'open',
    draft: false,
    user: { login: 'owner' },
    head: { sha: 'a'.repeat(40), repo: { full_name: 'owner/repo' } },
  };
}

async function resolve(options: {
  eventName?: string;
  ref?: string;
  actor?: string;
  requestedPr?: string;
  expectedHead?: string;
  pr?: ReturnType<typeof pullRequest>;
} = {}) {
  const outputs: Record<string, string> = {};
  const summary = {
    addHeading: vi.fn().mockReturnThis(),
    addRaw: vi.fn().mockReturnThis(),
    write: vi.fn().mockResolvedValue(undefined),
  };
  const setFailed = vi.fn();
  const get = vi.fn().mockResolvedValue({ data: options.pr ?? pullRequest() });
  await runInNewContext(`(async () => {${script(review)}})()`, {
    process: { env: { REQUESTED_PR: options.requestedPr ?? '201', EXPECTED_HEAD: options.expectedHead ?? '' } },
    context: {
      eventName: options.eventName ?? 'workflow_dispatch',
      ref: options.ref ?? 'refs/heads/main',
      actor: options.actor ?? 'owner',
      repo: { owner: 'owner', repo: 'repo' },
      payload: { repository: { default_branch: 'main' } },
    },
    github: { rest: { pulls: { get } } },
    core: { summary, setFailed, setOutput: (key: string, value: string) => { outputs[key] = value; } },
  });
  return { outputs, summary, setFailed, get };
}

describe('Claude review workflow', () => {
  it('resolves manual reviews to the current server-reported head', async () => {
    const result = await resolve();
    expect(result.get).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', pull_number: 201 });
    expect(result.outputs).toEqual({ eligible: 'true', number: '201', head: 'a'.repeat(40) });
  });

  it('accepts release bot dispatches with a matching expected SHA', async () => {
    const result = await resolve({ actor: 'github-actions[bot]', expectedHead: 'a'.repeat(40) });
    expect(result.outputs.eligible).toBe('true');
    expect(review).toContain("github.event_name == 'workflow_dispatch' && 'github-actions[bot]' || ''");
  });

  it('rejects dispatches using PR branch workflow code before resolving any PR', async () => {
    const result = await resolve({ ref: 'refs/heads/feature/untrusted' });
    expect(result.outputs.eligible).toBe('false');
    expect(result.get).not.toHaveBeenCalled();
    expect(result.summary.write).toHaveBeenCalled();
  });

  it.each(['0', '-1', '201; echo injected', ''])('rejects invalid PR input %s', async (requestedPr) => {
    const result = await resolve({ requestedPr });
    expect(result.setFailed).toHaveBeenCalled();
    expect(result.get).not.toHaveBeenCalled();
  });

  it.each(['fork', 'draft', 'closed', 'dependabot-author', 'dependabot-actor', 'stale'])('skips %s before checkout', async (reason) => {
    const pr = pullRequest();
    if (reason === 'fork') pr.head.repo.full_name = 'outsider/repo';
    if (reason === 'draft') pr.draft = true;
    if (reason === 'closed') pr.state = 'closed';
    if (reason === 'dependabot-author') pr.user.login = 'dependabot[bot]';
    const result = await resolve({
      pr,
      actor: reason === 'dependabot-actor' ? 'dependabot[bot]' : 'owner',
      expectedHead: reason === 'stale' ? 'b'.repeat(40) : '',
    });
    expect(result.outputs).toEqual({ eligible: 'false' });
    expect(result.summary.write).toHaveBeenCalled();
  });

  it('uses the same eligibility validation for pull request events', async () => {
    const result = await resolve({ eventName: 'pull_request', ref: 'refs/pull/201/merge' });
    expect(result.outputs.eligible).toBe('true');
  });

  it('gates checkout and Claude on credentials and reports absent credentials without a review claim', () => {
    expect(review).toContain("if: steps.pr.outputs.eligible == 'true'");
    expect(review.match(/if: steps.credentials.outputs.available == 'true'/g)).toHaveLength(2);
    expect(review).toContain('No review was performed.');
    expect(review).toContain('echo \'available=false\' >> "$GITHUB_OUTPUT"');
    expect(review).toContain('ref: ${{ steps.pr.outputs.head }}');
    expect(review).toContain('persist-credentials: false');
    expect(review).not.toContain('pull_request_target');
    expect(review).not.toContain('id-token: write');
  });

  it('dispatches each generated release PR using trusted workflow code and fresh server metadata', async () => {
    const get = vi.fn().mockResolvedValue({ data: pullRequest() });
    const createWorkflowDispatch = vi.fn().mockResolvedValue(undefined);
    await runInNewContext(`(async () => {${script(release)}})()`, {
      process: { env: { RELEASE_PRS: JSON.stringify([{ number: 201 }]) } },
      context: { repo: { owner: 'owner', repo: 'repo' }, payload: { repository: { default_branch: 'main' } } },
      github: { rest: { pulls: { get }, actions: { createWorkflowDispatch } } },
    });
    expect(get).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', pull_number: 201 });
    expect(createWorkflowDispatch).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', workflow_id: 'claude-review.yml', ref: 'main',
      inputs: { pr_number: '201', head_sha: 'a'.repeat(40) },
    });
    expect(release).toContain("if: steps.release.outputs.prs_created == 'true'");
  });

  it('keeps CodeRabbit incremental reviews active beyond five commits', () => {
    const config = readFileSync(new URL('../.coderabbit.yaml', import.meta.url), 'utf8');
    expect(config).toContain('auto_pause_after_reviewed_commits: 0');
  });
});
