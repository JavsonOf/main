# Global Superpowers Bridge

<!-- global-superpowers-bridge:v1.2 -->

This repository participates in the `JavsonOf` Global Superpowers Bridge. Repository-specific instructions are authoritative when they are more specific than this global contract.

## Execution Contract

- Read this file, `.github/copilot-instructions.md`, the task/issue brief, and relevant repository documentation before editing.
- Treat the GitHub issue or explicit task brief as the source of truth for scope and acceptance criteria.
- Do not implement directly on `main` or `master` unless the user explicitly authorizes it. Use the smallest isolated branch and pull request that can satisfy the task.
- Each delegated implementation task should run in a fresh coding-agent session. Do not reuse an implementation session as the independent reviewer.
- When Superpowers skills are available, use the relevant process skill before implementation: brainstorming for new behavior/design work, systematic debugging for bugs, test-driven development for features and fixes, and verification before claiming completion.
- Follow repository-native tools, package managers, test commands, formatting, and conventions. Do not invent commands or dependencies.

## GitHub Cloud-Agent Branch Ownership

- A GitHub Copilot cloud-agent session may push only to its assigned working branch.
- When `@copilot` is invoked from a pull-request comment, the writable branch is that pull request's head branch. In this mode, never ask the session to create or publish a different branch or a separate pull request; that branch escape can fail with HTTP 403 in `engine-tools-report_progress`.
- Controller-first pattern: the controller creates the isolated branch and pull request, then invokes `@copilot` on that pull request with an instruction to modify THIS pull-request branch directly. The coding agent commits only to the assigned head branch.
- If a genuinely separate branch or pull request is required, start a new task through GitHub Agents or a supported MCP agent-launch surface with the intended base branch. Do not branch-hop from a pull-request-comment session.
- If GitHub creates a stacked agent pull request, the controller may preserve the agent-produced branch and create or retarget the final pull request through controller GitHub tooling. Do not instruct the coding agent to escape its assigned branch.

## Dual Engine / BYOK Fallback

- GitHub Copilot cloud agent remains the primary implementation engine when it is available.
- If cloud execution cannot start because of Copilot quota, credits, plan, or entitlement, or the user explicitly requests `FORCE BYOK`, the controller may use the Global Superpowers Bridge v1.2 BYOK runner on the existing PR head branch.
- BYOK fallback is triggered only by the temporary `.github/superpowers/byok-task.json` file on a non-default branch. The repository workflow runs Copilot SDK with the configured OpenAI provider and works in the same checked-out PR branch.
- Never place an API key or token in the task file, source, issues, PRs, comments, artifacts, or logs. The Actions secret is named `OPENAI_API_KEY`; if it is unavailable, report the configuration blocker rather than requesting plaintext credentials in chat.
- The BYOK AI session does not own Git history or GitHub authentication. It must not commit, push, merge, release, deploy, rotate/change secrets, change the default branch, or modify Bridge governance/runtime files. The workflow wrapper owns the final same-branch commit/push.
- Implementation and independent review remain separate sessions. If the normal Copilot reviewer is unavailable, a `mode: "review"` BYOK task performs a read-only independent review and the wrapper posts the review as a durable PR comment.
- The temporary BYOK task file must not remain in the final PR diff. Blocking review findings become explicit fix work followed by re-review.
- Do not silently switch to BYOK merely because of a quality disagreement; fallback is an availability/capacity path or an explicit user choice.

## Safety and Git Discipline

- Never write credentials, API keys, tokens, private keys, or other secrets into source files, issues, pull requests, logs, or comments.
- Do not publish releases, deploy production infrastructure, rotate credentials, change repository secrets, merge pull requests, force-push default branches, or perform destructive operations without explicit authorization.
- Preserve existing project-specific instructions and intentional behavior. Do not perform unrelated refactors.
- Keep commits scoped to files changed for the assigned task.

## Verification and Reporting

- Run the smallest relevant tests/build checks for the code touched. For documentation/instruction-only changes, validate content and diff scope instead of running unrelated builds.
- Report files changed, commands/checks run, results, and unresolved risks or uncertainty.
- Never invent repository facts when evidence is unavailable.
- Use GitHub issues, branches, commits, pull requests, reviews, CI status, and logs as durable execution state.

## Independent Review

- Implementation and review are separate passes. A reviewer checks spec compliance, correctness, regressions, security-sensitive changes, test quality, repository conventions, and unnecessary scope expansion.
- Convert blocking review findings into explicit fix work and re-review the fix. Do not silently rewrite the task requirements.
- Do not merge merely because checks pass; merge remains an explicitly authorized action.

<!-- /global-superpowers-bridge:v1.2 -->