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
- **Usage signal.** Only what Wayfinder has seen: a usage-limit error on a batch start or on an Auto thread, kept as the provider instance and a time. Everything else is `unknown`; "near the limit" is not inferred (see above). #184 added the real readings (below).
- **Record.** Every row sends an `auto` block (proposal, final choice, usage state), including rows the user overrode, so #172's `overrides` fires on a changed tier or model.

## Built in #184

`GET /api/provider-usage` now reads real usage, in `src/providerUsage.ts`. A provider reads `available`, `limited`, or is left out of the answer, which the page treats as `unknown`.

- **Codex.** The server starts `codex app-server`, calls `account/rateLimits/read` and stops it (about 1.5 s here). The reading is reused for 60 seconds, so the call that opens the Start next confirm list refreshes it before a batch. A failed or unsupported read, or a response without usable windows, leaves Codex `unknown`. Codex is `limited` when `ordinaryUsageAllowed` is false, a reached-limit type is named, or a window is at 100% and has not reset.
- **Claude Code.** Wayfinder cannot ask Claude for its limits, so a status-line script posts the payload it already receives: `curl -s -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:4478/api/provider-usage/claude` (change the port if you use `--port`). `rate_limits.five_hour` and `seven_day` are read the same way. A payload without `rate_limits` records nothing, so Claude stays `unknown`.
- **Freshness.** `observedAt` is when Wayfinder received the reading, never the provider's clock. An `available` reading older than 60 seconds is dropped. A `limited` one holds until its window's reset time, since quota does not come back earlier. The newest observation wins between a reading and a usage-limit error (the 30-minute rule above), so a fresh `available` reading overrides an older error.
- **Which providers.** Readings are filed under T3 Code's default instance ids, `codex` and `claudeAgent`. A custom instance may be another account, so it stays `unknown` until it has a limit error.
- **Privacy.** A reading is reduced to a state, a time and the reset time held in memory. Percentages, plan names and account IDs are dropped on receipt, so the API, the confirm list, the hand-off record and GitHub never see them.
- **No near-limit state.** Still not inferred: #165 found the sample too small and the hand-off records (#172) hold no Auto outcomes yet. A provider is `limited` only when its own data says a window is used up.
- **Not done.** A queued ticket that waits over 60 seconds keeps the model chosen at submit. Re-picking it when a limit appears is tracked as a follow-up.

## Calibration readiness audit (#173)

Checked on 2026-10-01 at 20:33 EDT, 2026-10-02 00:33 UTC, against repository commit `c54ecba` and the local version-2 `~/.wayfinder-map/hand-offs.json`. Both [#166](https://github.com/RAbdelrhman/wayfinder-map/issues/166#issuecomment-5930254050) and [#172](https://github.com/RAbdelrhman/wayfinder-map/issues/172#issuecomment-5924469378) are closed with merged implementations. This is a readiness audit, not the requested completed-hand-off experiment. #173 stays open until at least 30 eligible completions are available.

The read-only disk snapshot contains 43 records for this repository, 26 attached to map #121. None has an `auto` block. Its stored statuses are 42 `ready` and one `running`; these are persisted observations, not a fresh T3 session read. There are zero recorded Auto outcomes, explicit Auto corrections, or Auto model-change events. The eligible sample is **0 of 30**. This describes this machine's retained store only. It makes no claim about other machines or records already removed by the store's 30-day terminal retention. No raw records or provider data are published.

| Ticket type | Eligible completed Auto hand-offs | Paired predictions | Agreement with corrected choices | Rating cost | Rating latency |
| --- | ---: | ---: | --- | --- | --- |
| Task | 0 | 0 | Not measurable | Not measured | Not measured |
| Research | 0 | 0 | Not measurable | Not measured | Not measured |

Missing measurements are not zero cost or zero latency. The earlier 13-ticket experiment used a different rules baseline, included prototype and grilling tickets, and had no correction labels. It cannot fill this sample or establish accuracy for `rules-1`.

### Inclusion and labels for the eventual comparison

Count unique hand-off IDs for task or research tickets on this repository's map #121 with a valid saved Auto proposal/final choice and a recorded terminal outcome. Fix and timestamp the snapshot and report its retention window. Keep retries visible and report both hand-off and unique-ticket counts; do not treat repeated attempts on one ticket as independent corroboration. Exclude untracked starts, still-active sessions and prototype/grilling tickets. A `pull-request` outcome alone is not completion; verify a terminal session or merged PR and report which completion evidence was used. Keep failed/interrupted terminal attempts in a separate outcome breakdown so their exclusion cannot inflate success.

For the 30-completion gate, count finished sessions and verified merged hand-offs. Exclude attempts with recorded usage-limit errors from difficulty labels and the labeled comparison, regardless of their terminal state. Report their count separately. A provider readiness/limit substitution is a dispatch constraint, not a user difficulty correction.

The primary label is an explicit user tier correction made before dispatch, with its source and time. Compute exact agreement separately for rules and model against that corrected tier on the same labeled, paired records. Report numerator and denominator by task/research, a tier confusion table, and uncertainty intervals. Keeping a proposal without changing it is weaker evidence of acceptance and must be reported separately from explicit corrections. Report the active rater because showing its proposal can influence the user's choice.

Treat an in-session change as upward only when the saved tier mapping and user evidence establish that it increased capability to address difficulty. Model identifiers and effort names alone do not establish an ordering. Separate confirmed difficulty changes from provider limits, readiness substitutions, user preference and unknown causes. A completed or merged result shows the chosen configuration worked; it does not label the minimum tier or prove an easier choice would have failed.

For each ticket type, compare paired predictions made from the same input before dispatch. Report rating elapsed time with sample count, median and p95, including timeout/fallback counts. Separate rating latency from hand-off duration. Report attributable input/cached/output tokens and either actual charge or a dated price estimate; subscription cost without attribution remains unavailable. Do not substitute total session cost for the cost of rating. Even with 30 completions, too few explicit correction labels means no accuracy conclusion.

### Tracking gaps and recommendation

`AutoDecision` in [autoDecision.ts](../../src/autoDecision.ts) saves one scoring version/reason and one proposed/final choice. The active rater is selected in Settings. It does not save both predictions, rating tokens/cost/latency, ticket type at decision time, the tier mapping, or why an in-session model changed. [autoRater.ts](../../src/autoRater.ts) returns a tier/reason or an error and discards measurement provenance. A later rerating of edited issues cannot recover prospective paired predictions. `overrides` is a comparison of proposed/final configurations, so it needs dispatch context before it can serve as an explicit user correction label.

[#186](https://github.com/RAbdelrhman/wayfinder-map/issues/186), a task sub-issue of map #121, tracks paired predictions and measurements with opt-in shadow calls and the existing local privacy/retention contract. It blocks the eventual comparison. No runtime behavior or collection is added by this audit. #186 closes these gaps; see "Paired predictions and measurements (#186)" below.

There is **no accuracy conclusion**. Keep logic as the default and preserve the user-selected model-rating option shipped in #166. Keep shadow ratings only as an explicit opt-in experiment once #186 records comparable predictions and measurements. There is no evidence here to promote model ratings to the default or remove them for poor accuracy. Revisit #173 after 30 eligible completions, and continue to withhold an accuracy recommendation if their labels remain weak.


## Paired predictions and measurements (#186)

Built so #173 can compare the rules with a model on the same tickets. Logic only stays the default, and nothing below runs unless the user opts in.

**Opt-in.** Settings → Calibration is Off by default (browser storage `wayfinder-map:auto-calibration:v1`). Turning it on asks for a shadow model: any ready Codex or Claude model, defaulting to the model mapped to the Simple tier. For each task or research ticket Start next (and the auto map) then makes one extra model call, with the same headless CLI and rating prompt as #166, beside the rules rating. Prototype and grilling tickets get no call and no pair. When the shadow model is also the rating model chosen for Auto, its one answer serves as both and no second call is made. Start waits until the shadow answers so no record loses its pair.

**The shadow never decides.** `pickAuto` reads only the active rating (rules, or the rating model with its fallback). The pair travels beside it in the request and is stored; it is not an input to the tier, model, or `overrides`. A test compares an entry built with and without a pair.

**What the `auto` block adds**, all in `~/.wayfinder-map/hand-offs.json` under the 30-day retention after the hand-off ends:

| Field | Meaning |
| --- | --- |
| `ticketType` | The type the server read for the ticket when it dispatched. A request cannot set it. |
| `selection` | `auto`, or `user` when the row was set to a tier by hand, even one equal to the proposal. |
| `tierMapping` | The model, provider instance and effort Settings mapped to each tier, limited to models T3 Code still offered. |
| `substitution` | Set when readiness (`provider-not-ready`) or a recorded usage limit (`usage-limit`) moved the proposal off the rated tier's own model: `from`, `to`, and `toTier`, the harder tier whose model was used. |
| `calibration` | `{ rules, shadow, proposedBy, fallback }`, present only for an opted-in task or research hand-off. `fallback` is true when the user's rating model was asked and could not rate, so the rules did. |

`overrides` is unchanged: the proposal is saved after any substitution, so a provider-caused move is in `substitution` and `proposed`, and `overrides` lists only what the user then changed. `selection` separates an explicit choice from a kept proposal, which the audit asked to report apart.

**Each prediction** (`calibration.rules`, `calibration.shadow`) holds `tier` (null when the method gave none), `version` (`rules-1` or `model-1:<slug>`), `rubric` (`rubric-1`, the prompt's criteria; null for the rules), `rater` (`provider`, `model`, `effort`; null for the rules), `inputId`, `elapsedMs`, `status`, `tokens` and `cost`.

- **Same input.** `inputId` is the first 32 hex characters of SHA-256 over type, blocker count, title and body (`ratingInputId`). The rules compute theirs in the page; the server computes the shadow's from the ticket it rated. Two predictions are a pair only when both ids exist and match (`isPaired`), and no ticket text is kept. The model reads the first 6,000 characters of a body and the rules read all of it, so a pair on a longer body saw different amounts; exclude those if it matters.
- **Elapsed time.** The rules' is the page's timing of `rateByRules` (a fraction of a millisecond). The model's is process-level CLI time, including start-up, and is also kept for a failed run: a timeout records about 60 seconds. Neither is hand-off duration.
- **Status.** `ok`, `timeout`, `failed`, `unparseable` or `unsupported`. A request that never answered is an unmeasured `failed` with no `inputId`, so it can never count as a pair. The CLI's reply and error text are never stored.
- **Tokens.** Only what the run reported. Codex prints one total on stderr, kept as `total` with `input`, `cachedInput` and `output` null. That total includes the CLI's own context, as the 13-ticket experiment found. Claude's plain-text mode reports none, so `tokens` is null.
- **Cost.** `actual` (a charge the CLI reported, and `usd: 0` for the rules), `estimate` (token counts times a rate in `RATE_CARD`, with `pricedOn`), or `unavailable`. An estimate needs a known rate and a split input and output, so a Codex or Claude subscription run is `unavailable`, not zero. `RATE_CARD` holds only the one rate the research above cites, dated 2026-09-29.

**Model-change reasons.** `modelChanges[]` gains `reason` and `confirmedAt`. It starts `unknown` and stays so: a different or stronger model name never implies a harder ticket. A user can confirm `harder-ticket`, `provider-limit`, `provider-problem` or `preference` with `POST /api/hand-offs/model-change` `{ id, at, reason }`, where `at` is the change's own `at`. A reason of `unknown` clears it. #191 asks: a hand-off whose Auto session changed model shows a small prompt (Harder ticket, Provider limit, Provider problem, Preference, Not sure, or Skip) on its card and in the hand-off list. It names the two models and never suggests a reason from them. Each change also stores `askedAt`, set by any answer including Not sure and Skip, so it is asked once; those two leave the reason `unknown`. One change is asked at a time, oldest first. Nothing goes to GitHub.

**Privacy.** Every field is parsed one by one on the way in and again on the way out of the file. An account id, key, quota value or raw provider error in a request is dropped, and none of the block reaches `gh` or GitHub (`autoDecisionPrivacy.test.ts` covers the pair). No new model call is made by default.

### Counting eligible completions for #173

`summarizeCalibration(await new HandOffStore({ filePath: handOffStorePath() }).list(), { repo, mapNumber })` in `src/autoCalibrationSummary.ts` returns counts by `task` and `research`:

- `eligible`: hand-offs with a pair on the same input, a terminal `finished` result or a `pull-request` result whose pull request state is `MERGED`, and no recorded usage-limit error. This is the audit's inclusion rule. `tickets` counts distinct tickets among them.
- `bothPredicted`, `shadowFailed`, `fallback`, `tierCorrected` (`selection: user` and a changed tier) and `substituted`, so the labelled comparison, timeouts and provider-caused moves are reported separately.
- `excluded`, each record in the first group that applies: `notPaired`, `active` (running or untracked), `failedOrInterrupted`, `usageLimited`, `unverifiedPullRequest`.
- `earliestExpiresAt`: the oldest eligible hand-off's end plus 30 days. The store deletes a hand-off then, so #173 must take its counts and any per-type tables from the records before that time. The summary holds counts only, and Wayfinder keeps no archive past the retention.

The 30-completion gate counts `eligible` across both types and reports each type's count. #173 can then report by ticket type from the same call: rating time (median and p95 with sample counts and timeout counts) from `calibration.*.elapsedMs` and `status`, tokens and cost from `tokens` and `cost`, and agreement from `tier` of each method against the user's explicit tier correction. Only the rater that proposed (`proposedBy`) could have influenced the user. When the rating model differs from the shadow, its own rating time and tokens are not kept; only the rules and the shadow are compared.
