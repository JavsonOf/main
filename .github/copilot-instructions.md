model: claude-sonnet-4.5

# Global Superpowers Bridge

<!-- global-superpowers-bridge:v1.2 -->

- Read `AGENTS.md`, this file, the task/issue brief, and relevant repository documentation before editing.
- Repository-specific instructions remain authoritative when more specific than this global bridge.
- Work on an isolated branch/PR; never implement directly on `main`/`master` without explicit authorization.
- Treat each delegated implementation task as a fresh coding-agent session. Independent review must be a separate pass/session.
- When invoked through `@copilot` on an existing pull request, work only on THAT pull request's head branch. Do not create or publish another branch or separate PR from that session; GitHub restricts the session to one writable branch and branch escape may fail with HTTP 403 in `engine-tools-report_progress`.
- For PR-comment delegation, the controller creates the isolated branch/PR first and the agent modifies that PR branch directly. A genuinely separate branch/PR requires a new GitHub Agents/MCP task with the intended base branch.
- Cloud `@copilot` is the primary engine. If Copilot quota/credits/plan/entitlement prevents cloud execution, or the user explicitly requests `FORCE BYOK`, use the v1.2 BYOK runner on the SAME PR head branch by adding the temporary `.github/superpowers/byok-task.json` trigger.
- BYOK uses the repository Actions `OPENAI_API_KEY` secret through Copilot SDK provider configuration. Never request, expose, commit, log, or place the key in task content. If the secret is missing, report a configuration blocker.
- The BYOK AI session may edit task-scoped files but does not own commit/push/merge/release/deploy/secret operations or Bridge governance/runtime files. The workflow wrapper owns the same-branch commit/push and removes the temporary task file.
- If the standard independent reviewer is unavailable, use a separate `mode: "review"` BYOK task; review mode is read-only and its result is posted as a PR comment.
- When available, use Superpowers process skills appropriate to the task: brainstorming for design/new behavior, systematic debugging for bugs, TDD for features/fixes, and verification before completion claims.
- Follow repository-native tooling and run only relevant tests/build checks for touched code.
- Do not invent repository facts, broaden scope, or perform unrelated refactors.
- Never expose secrets or credentials in repository content, issues, PRs, comments, or logs.
- Do not merge, release, publish, deploy production changes, rotate credentials, change secrets, force-push default branches, or perform destructive actions without explicit authorization.
- Report changed files, checks run, results, and unresolved risks. Use GitHub artifacts as durable execution state.

<!-- /global-superpowers-bridge:v1.2 -->