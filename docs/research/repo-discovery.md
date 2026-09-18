# Repo discovery: which repos hold wayfinder maps?

Research for [#5](https://github.com/RAbdelrhman/wayfinder-map/issues/5), part of the home-page map [#3](https://github.com/RAbdelrhman/wayfinder-map/issues/3).

**Question.** Using only `gh`, what is the cheapest reliable way to list the repos the signed-in user can reach that have at least one `wayfinder:map` issue? The label name is configurable.

**Short answer.** Make one REST issue search, `gh api -i -X GET search/issues`, scoped with one `user:` qualifier per owner (the viewer plus each of their orgs), and OR the map labels together with a comma. It takes two `gh` calls and about 3 s in total. It finds private repos and exposes the documented SSO signal. When the search misses a repo, the user types `owner/name` and one GraphQL call checks it. Details and evidence follow.

Everything marked *measured* was run on 2026-09-18 with `gh` 2.96.0 as `RAbdelrhman` (OAuth token, scopes `gist, read:org, repo, workflow`, one org). Latency is wall-clock per `gh` process on Windows and includes process spawn.

## The options

### A. Issue search: REST `search/issues` or `gh search issues`

Query: `label:"wayfinder:map" user:<viewer> user:<org1> … user:<orgN>`, owners taken from `gh api user/orgs`.

- **Private repos.** Search returns only what the token can access. Inaccessible repos are left out without an error ([REST search docs](https://docs.github.com/en/rest/search/search)). *Measured:* the private repo `RAbdelrhman/PodControl` was returned.
- **Scope is required.** *Measured:* with no owner qualifier, `gh search issues --label wayfinder:map` returned 90 unrelated public repos from across GitHub that use the same label. An owner filter is mandatory.
- **What `user:` covers.** `user:`/`org:` match repos *owned* by that account ([searching issues](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests)). A repo owned by another person where the viewer is only a collaborator is not included unless its owner (or `repo:owner/name`) is added to the query.
- **Many owners in one query.** *Measured:* 20 `user:` qualifiers (310 chars) and then 50 (1,081 chars) both returned `200` with `incomplete_results: false`. The documented 256-char limit applies to the free-text part of the query, not to qualifiers ([REST search docs](https://docs.github.com/en/rest/search/search)). ~10 orgs fits easily.
- **Bad owner.** *Measured:* if the query contains *only* unknown or unreachable owners, the API returns `422 Validation Failed` ("cannot be searched either because the resources do not exist or you do not have permission"). If at least one owner is valid, the bad ones are ignored without an error. An org that was renamed or left can't break discovery for everyone else.
- **Rate limit.** 30 requests/min for authenticated search ([REST search docs](https://docs.github.com/en/rest/search/search)). *Measured:* `X-Ratelimit-Resource: search` and `Remaining` dropped by one per call. One call per home-page load leaves plenty of headroom. Oddly, `gh api rate_limit` reported `search.used: 0` right after searches, so read the response headers instead.
- **Pagination.** 100 per page, and at most 1,000 results per search ([REST search docs](https://docs.github.com/en/rest/search/search)). Results are map *issues*, not repos. Even a heavy user has far fewer than 100 maps, so it's one page in practice. `gh api --paginate` handles the rare second page.
- **Custom map labels.** Label OR uses a comma: `label:wayfinder:map,epic` ([searching issues](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests)). *Measured:* `label:wayfinder:map,wayfinder:task` gave 11 = 3 + 8. However, `gh search issues --label a --label b` ANDs the labels (*measured:* 0 results), so the `gh search` wrapper can't express this. Use the raw query through `gh api`. Search can only find labels it is told about. A repo that uses a label the tool has never seen can't be discovered by any option; see "Manual entry".
- **SSO.** For multi-org requests, orgs that need SAML authorization are left out of the results and the response carries `X-GitHub-SSO: partial-results; organizations=<ids>` ([authenticating to the REST API](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)). That is the only documented way to *detect* the gap, and you only see it with `gh api -i`. The `gh search` wrapper doesn't show headers. The docs describe the header for classic PATs. Whether it is sent for `gh`'s OAuth token wasn't verified (no SSO org available). See "SSO and the `gh` token".
- **Latency.** *Measured:* 1.4–2.5 s per search call, plus ~1.4 s for the org list. ~3 s total whatever the number of orgs.

### B. GraphQL `search(type: ISSUE)`

Same query string, same index.

- **Private repos / scope / custom labels.** Same as A. *Measured:* it returned `PodControl` with `isPrivate: true`.
- **Rate limit.** Charged to the GraphQL budget: 5,000 points/hour, minimum 1 point per call ([GraphQL rate limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)). *Measured:* `rateLimit.cost` was 1, and three GraphQL searches didn't reduce the REST `search` bucket. This is the only real advantage over A.
- **Pagination.** Cursor-based, `first: 100`. Same 1,000-result search cap.
- **SSO.** No documented partial-results signal for GraphQL. The gap would go unnoticed.
- **Latency.** *Measured:* ~2.3 s.

### C. Enumerate repos, then check each for the label

C1 (as proposed in the ticket): `gh repo list <owner>` for each owner, then a label check for each repo (`gh label list -R …` or a per-repo query).

- One `gh` process per repo. *Measured:* ~1.5 s each. A user in 10 orgs can reach hundreds or thousands of repos, so even at a concurrency of 8 this takes minutes. It also hits the 100-concurrent-request and 900-points/min REST secondary limits ([GraphQL rate limits page, secondary limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)). Not viable.

C2 (a better version of C): one GraphQL query over `viewer.repositories(ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER])` that selects `issues(labels: $labels) { totalCount }` for each repo, paginated 100 repos per page.

- **Coverage.** Every repo the viewer can reach, including collaborator repos on other people's accounts, which A and B miss. By default `ownerAffiliations` is `[OWNER, COLLABORATOR]` (live schema introspection), so `ORGANIZATION_MEMBER` has to be passed.
- **Exact and live.** It reads issues directly instead of going through a search index. *Measured:* `issues(labels: [a, b])` is an OR (`wayfinder:map` 2 + `wayfinder:task` 8 = 10 on PodControl).
- **Cost.** *Measured:* 1 point for a 25-repo page.
- **Latency.** *Measured:* 1.3 s for one page. Cursor pagination runs one page after another, so the time grows with the number of repos: ~1.5 s × (repos / 100). A user in 10 orgs with 2,000 reachable repos waits about 30 s. Running one query per org in parallel helps, but a single 5,000-repo org still needs 50 pages in sequence.
- **Custom labels.** Same limit as search: you must name the labels.

## SSO and the `gh` token

`gh` authenticates as an OAuth app. For an org that enforces SAML SSO, an OAuth app is authorized only if the user "must have an active SAML session for each organization each time you authorize an OAuth app" ([authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps)). After SSO is enabled, previously authorized OAuth apps must be reauthorized ([about SSO authentication](https://docs.github.com/en/authentication/authenticating-with-single-sign-on/about-authentication-with-single-sign-on)). Orgs can also restrict unapproved OAuth apps, which blocks `gh` until an owner approves it ([authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps)).

Result: every option silently returns less for an unauthorized SSO org, because search leaves out inaccessible resources rather than failing ([REST search docs](https://docs.github.com/en/rest/search/search)). Only REST search (A via `gh api -i`) has a documented header that names the missing orgs, as org IDs. `gh api user/orgs` returns each org's `id`, so the IDs can be mapped to logins for a "sign in to SSO for <org>, then re-run `gh auth login`" message. This fix needs verifying against a real SSO org before it's written into the spec.

## Manual `owner/name` entry

Search misses repos in three cases: collaborator repos owned by other people, unauthorized SSO orgs, and unknown custom labels. For those, the user types `owner/name` (optionally with a map label). A single GraphQL call checks it and counts maps:

```graphql
query ($owner: String!, $name: String!, $labels: [String!]) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    hasIssuesEnabled
    issues(labels: $labels) { totalCount }
  }
}
```

A `NOT_FOUND` error means the repo doesn't exist or isn't visible to this token (both cases look the same). `hasIssuesEnabled: false` and `totalCount: 0` are the other empty states. Once a repo has been added, its owner and label feed back into future searches (an extra `user:` or `repo:` qualifier and an extra comma label). That lets the search improve without another discovery mechanism.

## Comparison

| | A. REST search | B. GraphQL search | C1. repo list + per-repo check | C2. GraphQL repo scan |
|---|---|---|---|---|
| Private repos | yes | yes | yes | yes |
| Collaborator repos on others' accounts | only if owner added | only if owner added | yes | yes |
| SSO gap detectable | yes (`X-GitHub-SSO`, documented for PATs) | no | no | no |
| Budget | 30/min search bucket | 5,000 pts/h, cost 1 | core 5,000/h, one call per repo | 5,000 pts/h, ~1 pt per 100 repos |
| Calls for ~10 orgs | 2 | 2 | 10 + hundreds | repos/100, sequential |
| Latency, ~10 orgs | ~3 s | ~3.5 s | minutes | ~1.5 s per 100 repos |
| Custom labels | comma OR, must be named | same | must be named | array OR, must be named |
| Freshness | search index | search index | live | live |

## Recommendation

1. **Discovery = A.** Call `gh api user/orgs` to get the owners (the org IDs are also used for SSO messages). Then make one `gh api -i -X GET search/issues -f q='label:"wayfinder:map"[,<known custom labels>] user:<viewer> user:<org>… [user:/repo: from recents]' -f per_page=100`. Group the items by `repository_url`. Use `gh api`, not `gh search issues`: the wrapper ANDs repeated `--label` flags and hides the SSO header. Cache the result for the session. The 30/min limit only matters if the page re-searches on every keystroke, so it shouldn't.
2. **Fallback = manual `owner/name`**, validated with the GraphQL query above. It covers collaborator repos, SSO orgs authorized later, and custom labels. Remember added repos and their labels, and fold them into the next search.
3. **Don't build C.** C1 is too slow. C2 is the only option with exact, complete coverage, but its latency grows with the number of reachable repos. Keep it in reserve as an explicit "scan all my repos" action if users report missing repos that manual entry doesn't fix.
4. **Never run an unscoped search.** It returns other people's public repos.

## Open points

- Whether `X-GitHub-SSO: partial-results` is sent for `gh`'s OAuth token, not just classic PATs. Needs an SSO-enforcing org to test.
- How far the search index lags behind a newly labelled map issue. Not documented and not measured. A map created a moment ago may not show up until the index catches up. Manual entry covers this.
