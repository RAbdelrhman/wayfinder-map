# Grilling question cards

Wayfinder grilling hand-offs require one structured question card at a time,
with options, a recommendation, and a tradeoff. Only the user's submitted
response permits the next question or a recorded decision. A preselected
default, silence, timeout, cancellation, empty result, or unsubmitted form
does not. Grilling determines behavior. UI choices still need a prototype
ticket and a prototype the user picks.

## Verified mechanism

Inspected the installed T3 Code Nightly `resources/server.asar` on 2026-10-15.
Its `apps/server/dist/binCli-qqrpls82.mjs` handles Claude's `AskUserQuestion`
as a `user_input` request and Codex's `request_user_input` protocol. These are
provider tools, rather than a T3 MCP question-creation tool. The live T3 MCP
catalog exposes `t3_pending_request_list`, `t3_pending_request_read`, and
`t3_pending_request_respond` for existing requests. Agents must never use the
response tool to make the human's decision.

No separate `question` skill was found in the installed bundle or searched
local skill directories. Discover the current thread's actual skill/tool and
read its instructions instead of assuming a skill name. This Codex harness
also exposes `request_user_input_async`; its response arrives as a later user
message, so submission must be followed by yielding and waiting. Native
`request_user_input` can be mode-restricted. If no permitted card tool is
available, report that limitation and leave the ticket and decision open.

## Coverage and limits

`buildPrompt` serves map and standalone ticket hand-offs, including the server's
prompt and launch paths. Grilling instructions live in `typeSteps`; templates
without that placeholder receive the full grilling contract as a prefix.
Blank or whitespace-only grilling templates use the complete default prompt,
preserving the ticket question, identity, worktree context, and map rules.
`AGENTS.md`, also imported by `CLAUDE.md`, covers direct repository sessions.
Tests exercise default, custom, legacy, and empty templates, map and standalone
tickets, prepared worktrees, and isolation from other ticket types. Existing
prototype tests retain the canvas feedback and human-choice requirements.

These checks establish generated prompt coverage. They do not prove future
model compliance or a live card submission and response in every provider.
No active human grilling thread was used for verification.
