# Auto tier selection and provider usage

Research for [#165](https://github.com/RAbdelrhman/wayfinder-map/issues/165) on map [#121](https://github.com/RAbdelrhman/wayfinder-map/issues/121). Checked on 2026-09-29.

## Recommendation

Use a transparent rule-based difficulty score for Auto's first release. Keep a cheap model rating in shadow mode until Wayfinder has reliable outcome labels. The experiment below shows the model and rules disagree often, and the repo does not record which tier a ticket needed.

Choose the model from the user's per-tier Settings mapping and the models currently available in T3 Code. Do not hard-code provider model IDs. Before dispatch, read provider usage where a supported signal exists and stamp its local observation time. Treat missing or stale data as unknown. If a provider reports a hard limit, use another model only when the user has configured one for the same tier. Otherwise leave the ticket for the user. As decided in [#124](https://github.com/RAbdelrhman/wayfinder-map/issues/124), stop the rest of a Start next batch on the first usage-limit error.

## What usage data Wayfinder can read

| Source | What it exposes | Freshness and limits |
| --- | --- | --- |
| T3 Code model catalog | Wayfinder's current adapter reads enabled, installed providers, their models, effort options, and a `ready` flag from `server.getConfig`. It has no quota or usage fields. Wayfinder caches this configuration for 60 seconds. See [models.ts](../../src/models.ts) and [t3.ts](../../src/t3.ts). | Readiness answers whether T3 Code can start a provider. It does not say whether that account has remaining usage. |
| Codex CLI app-server | The documented `account/rateLimits/read` method returns limit windows, usage percentages, reset times, and limit status. `account/rateLimits/updated` notifies a client when limits change. The installed Codex 0.158.0 returned `codex` windows of 300 and 10,080 minutes, plus a 10,080-minute `base_model_inference` window. The local read took 1.1 seconds. No account values are included here. | Treat the read as a snapshot at receipt time. The docs describe update notifications but give no freshness SLA. It requires Codex-backed ChatGPT authentication; API-key-only auth cannot read these limits. This environment verified the method, not how a T3-managed Codex session shares its account with the local CLI. The app-server is experimental, so check support and auth before using it. [Codex app-server docs](https://developers.openai.com/codex/app-server/). |
| Claude Code plan usage | The interactive `/usage` command shows plan limits. Claude Code 2.1.251 and later can pass `rate_limits.five_hour` and `rate_limits.seven_day` percentages and reset times to a configured status-line script. These fields are present for Claude.ai Pro and Max plans after the first API response. The installed CLI is 2.1.280. | The status-line value reflects the latest payload the script received. Wayfinder would need to timestamp it. It may be absent before a session's first response, so Auto must represent that state as unknown. [Claude Code usage guide](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code), [status-line docs](https://code.claude.com/docs/en/statusline). |
| Anthropic Usage and Cost API | The organization Admin API reports Console API token usage and cost in 1-minute, 1-hour, or 1-day buckets. It requires an Admin API key. | This reports API activity, not remaining Claude.ai subscription quota. The 1-minute bucket is not a freshness guarantee. Use it for account analytics, not Start next preflight. [Usage and Cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api). |

For dispatch, timestamp each snapshot and consider it usable for at most 60 seconds. Refresh Codex limits before a batch and again if a queued ticket waits longer than that. Use Claude's most recent status-line snapshot only while its age is known. Do not invent a "near limit" percentage: provider windows and task sizes differ, and this sample cannot support a safe threshold. Until a provider exposes a fresh, explicit limit state, retain the configured model and show usage as unknown.

## Difficulty comparison

I compared 13 closed task, research, prototype, and grilling tickets attached to map #121: #122, #123, #124, #125, #126, #127, #134, #135, #137, #138, #139, #142, and #160. Both methods saw the issue title, Wayfinder type label, and body only. The model did not read the repository.

The rules baseline gave one point each for a research or prototype type, a body over 180 words, at least two distinct code references (file paths or inline module names), and an explicit blocker reference. Scores 0-1 mapped to Simple, 2-3 to Mid, and 4 to Hard. This is a deliberately small baseline, not a calibrated policy.

The model pass used `gpt-6-luna` at low reasoning through `codex exec`, once per ticket, with a fixed rubric: Simple for one localized change, Mid for a few modules or a nontrivial state flow, and Hard for open-ended research, cross-cutting architecture, concurrency, or high uncertainty.

| Ticket | Type | Rules | GPT-6 Luna, low |
| --- | --- | --- | --- |
| #122 | research | Mid | Mid |
| #123 | research | Mid | Hard |
| #124 | grilling | Simple | Mid |
| #125 | prototype | Simple | Mid |
| #126 | task | Simple | Mid |
| #127 | task | Simple | Hard |
| #134 | task | Mid | Mid |
| #135 | task | Simple | Mid |
| #137 | task | Mid | Mid |
| #138 | task | Simple | Mid |
| #139 | task | Mid | Mid |
| #142 | task | Simple | Mid |
| #160 | task | Simple | Hard |

The rules returned Simple for 8 tickets and Mid for 5. The model returned Mid for 10 and Hard for 3. They agreed on 4 of 13. These are predictions, not accuracy scores. Wayfinder's 13 matching closed hand-off records have `tier: null`; T3's saved thread metadata records the model and effort selected, but not the minimum tier that would have completed the work. Eight runs used Claude Opus 5.5 at medium effort and five used GPT-6 Luna at max effort. A successful ticket only shows that the selected configuration worked, not that a lower tier would have failed.

| Measurement | Rules baseline | GPT-6 Luna, low |
| --- | ---: | ---: |
| Local rating time per ticket | 2.49 ms average | 5.98-9.15 s; 6.97 s median, 7.03 s mean |
| Input tokens | 0 | 326,940 total; 25,149 per ticket on average |
| Cached input tokens | 0 | 71,424 total |
| Output tokens | 0 | 718 total; 55 per ticket on average |
| API list-price equivalent | $0 | About $0.0266 total, or $0.00205 per ticket |

The rules timing is a PowerShell implementation of the baseline run over the 13 fetched bodies 1,000 times; GitHub fetch time is excluded. The model timing is process-level CLI latency, including startup. Codex attempted to reconnect to an unavailable local MCP server during startup, though the 13 ratings completed. The token count includes that CLI's system context, not only the ticket text. GPT-6 Luna's published API rates are $0.10 per million uncached input tokens, $0.01 per million cached input tokens, and $0.50 per million output tokens. The estimate is a comparison price, not a charge from the Codex Pro session used for this experiment. See [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) and the [Codex token rate card](https://help.openai.com/en/articles/20001415-chatgpt-rate-card-enterprise-token-based-pricing).

The current score also under-rates several cross-module tasks because their issue bodies name one file or none. Body length and file references are weak clues on their own. The type, explicit blockers, and language that signals concurrency, external integration, data migration, or multiple state paths should carry more weight. Keep the reason concrete, for example "Hard: concurrent starts share one T3 connection and need failure cleanup." Start at Mid when the evidence is incomplete. Reserve Simple for a clearly localized task; choose Hard when the ticket names broad research or a high-risk state boundary.

## Auto policy

1. Rate difficulty from the ticket type, stated scope, named modules, blockers, and risk words. Let body length break ties only.
2. Show the tier and one-line reason in the #124 confirm list. Keep the user able to override either.
3. Resolve the model through the user's tier mapping, then filter to models T3 Code currently reports as available. Use the model's configured effort option; do not infer model quality from its display name.
4. Use fresh provider usage only to avoid a provider that is explicitly limited. Do not downgrade a Hard ticket to Simple to stretch a quota. If an equal-tier configured alternative is absent, leave the choice visible for override.
5. Keep cheap-model scores in shadow mode. Save the recommendation, final choice, user override, provider usage state and age, model changes, and terminal outcome locally. Do not send account IDs, credentials, or raw quota values to GitHub.
6. Re-evaluate the ratings after enough hand-offs have an outcome label. Record upward model changes and user corrections separately: a merged result alone does not prove that the chosen tier was the minimum needed.

## Follow-ups

- #166 implements Auto using this policy.
- [#172](https://github.com/RAbdelrhman/wayfinder-map/issues/172) records Auto proposals, user overrides, usage state age, model changes, and outcomes locally.
- [#173](https://github.com/RAbdelrhman/wayfinder-map/issues/173) compares the rule score and shadow model after 30 completed hand-offs. It is blocked by #166 and #172.

## Recorded for calibration (#172)

A hand-off started with Auto carries an `auto` block in `~/.wayfinder-map/hand-offs.json`, under the store's 30-day retention after the hand-off ends. `POST /api/repos/{owner}/{name}/hand-off` takes it as `auto: { scoring: { version, reason }, proposed, final, usage: { state, observedAt } }`, where `proposed` and `final` are `{ tier, provider, model, effort }`. Wayfinder derives `overrides` (any of `tier`, `model`, `effort`) by comparing the two, so it can't be claimed by the caller. Unknown fields are dropped, so quota values, account IDs and tokens are never stored. Usage state is `available`, `limited` or `unknown`, and a state with no `observedAt` is saved as `unknown`. The age at decision time is `decidedAt - usage.observedAt` (`usageAgeMs`).

Each T3 read of the thread then appends to the block: `modelChanges` (from and to, after the start, separate from overrides), `usageLimitErrors` (time and model, never the error text) and `outcome` (`finished`, `failed`, `interrupted`, `pull-request` or `untracked`), which clears if the thread continues. The block is local only; nothing in it is passed to `gh`. #171 and #173 read it through `HandOffStore.list()`.

## Built in #166

Start next's confirm list has one choice per row: Auto (the default), Simple, Mid or Hard. The pick logic is `src/autoPick.ts`; model rating is `src/autoRater.ts`.

- **Rating.** `rateByRules` scores the ticket type, distinct file and module names, risk words (concurrency, data migration, external integration, failure handling, security) and blockers, with body length breaking a tie at the edge of Hard only. It returns Mid with the reason "the ticket names little scope" when it has nothing to go on, and Simple only for a task that clearly names one file or says it is small. Settings can switch rating to a Codex or Claude model, run headless through that provider's CLI; any failure falls back to the rules and the row's reason says so. The saved `scoring.version` is `rules-1` or `model-1:<slug>`.
- **Model.** The rated tier resolves through the Settings tier mapping and the models T3 Code currently offers. A provider T3 Code reports as not ready, or one that hit a usage limit in the last 30 minutes, is skipped for a model Settings maps to a *harder* tier on another provider. Wayfinder never takes an easier tier's model, so a quota is not stretched by under-powering a ticket. With no alternative the tier's own model stays and the reason says to pick one.
- **Usage signal.** Only what Wayfinder has seen: a usage-limit error on a batch start or on an Auto thread, kept as the provider instance and a time. Everything else is `unknown`; "near the limit" is not inferred (see above). Reading Codex's `account/rateLimits/read` and Claude's status-line limits would add `available` and a real near-limit state. That is left for a follow-up.
- **Record.** Every row sends an `auto` block (proposal, final choice, usage state), including rows the user overrode, so #172's `overrides` fires on a changed tier or model.
