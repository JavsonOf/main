# Global Superpowers Bridge v1.2 BYOK Fallback Design

## Status

Approved direction: preserve GitHub Copilot cloud-agent execution as the primary engine and add an OpenAI API BYOK fallback that can continue implementation and independent review when Copilot plan credits or cloud-agent entitlement are unavailable.

## Problem

Global Superpowers Bridge v1.1 correctly constrains a PR-comment cloud-agent session to the head branch of the existing pull request, avoiding branch-escape HTTP 403 failures. It still depends on GitHub-hosted Copilot capacity. If the user's Copilot credits/entitlement become unavailable, the controller needs an alternate execution engine that preserves the same branch, review, safety, and merge-authorization contract.

## Goals

- Keep `@copilot` cloud agent as the default execution engine when available.
- Continue on the same isolated PR branch when cloud execution cannot start because of Copilot quota, credits, plan, entitlement, or an explicit `FORCE BYOK` request.
- Use GitHub Copilot SDK with an OpenAI-compatible BYOK provider and direct OpenAI API billing.
- Support both implementation and independent review without consuming Copilot premium requests.
- Never commit or print API keys.
- Preserve the existing explicit merge/release/deploy authorization gate.
- Keep the controller in charge of branch creation, PR lifecycle, verification, review routing, and final merge.

## Non-goals

- Replacing GitHub Copilot cloud agent when it is available and suitable.
- Circumventing GitHub plan restrictions for GitHub-hosted cloud-agent compute.
- Storing an OpenAI API key in repository contents, issues, PRs, comments, artifacts, or logs.
- Giving the BYOK agent permission to merge, release, deploy, alter repository secrets, or create/publish unrelated branches.
- Centralizing all repositories behind a cross-repository PAT or long-lived GitHub credential.

## Evaluated Approaches

### A. Local-only Copilot CLI BYOK

The controller would instruct the user to run Copilot CLI locally with a provider key. This is officially supported but does not provide a controller-callable runtime from ChatGPT/GitHub and would break the current remote-first workflow.

Rejected as the primary fallback.

### B. One central BYOK runner repository

A single repository would execute tasks against all other repositories. This reduces duplication but requires a cross-repository credential capable of checking out and pushing to every target repository, increasing blast radius and secret-management complexity.

Rejected for v1.2.

### C. Per-repository GitHub Actions BYOK runner

Each participating repository contains the same small runner and workflow. The controller creates an isolated branch and PR first. If cloud Copilot cannot execute, the controller adds one temporary task file to that existing branch. The push event starts the BYOK runner, which edits the checked-out branch and pushes the resulting commit back to the same branch.

Selected. It preserves repository isolation, uses the repository-scoped `GITHUB_TOKEN` only for the final wrapper push, and requires only an `OPENAI_API_KEY` Actions secret in each repository that will use fallback execution.

## Architecture

### Primary path

1. Controller reads repository instructions and task brief.
2. Controller creates the isolated task branch and PR.
3. Controller invokes `@copilot` on that PR and tells it to modify only the current PR head branch.
4. Cloud agent implements the task.
5. Controller verifies diff/checks and requests an independent review.
6. Merge remains blocked until explicit user authorization.

### BYOK implementation fallback

1. Primary cloud execution is unavailable because of quota/credits/plan/entitlement, or the user explicitly requests `FORCE BYOK`.
2. Controller stays on the existing PR head branch. It does not create a branch escape.
3. Controller creates `.github/superpowers/byok-task.json` on that branch with `bridge`, `mode`, `pr_number`, `base_ref`, `task`, `acceptance`, and optional `tests` fields.
4. `.github/workflows/superpowers-byok-agent.yml` runs only for changes to that task file on non-default branches.
5. The workflow checks out the exact branch with `persist-credentials: false`, validates the task, installs the Copilot SDK runtime, and executes `.github/superpowers/byok-runner.mjs`.
6. The runner copies `OPENAI_API_KEY` into process memory and deletes it from `process.env` before creating the Copilot client. The model provider receives the key through SDK provider configuration rather than through the shell environment inherited by agent commands.
7. The BYOK session uses the repository working directory, reads `AGENTS.md` and `.github/copilot-instructions.md`, applies the task, runs relevant checks when allowed, and cannot commit/push/merge or modify the BYOK governance files.
8. The wrapper verifies that the agent did not create local commits, removes the temporary task file, commits the workspace changes with `[skip byok]`, and pushes through the repository-scoped `GITHUB_TOKEN`.
9. Controller independently inspects the resulting PR diff and CI/check results.

### BYOK independent-review fallback

1. If the normal independent Copilot review path is unavailable, controller adds a `mode: "review"` BYOK task to the same PR branch.
2. The SDK session is created with read-only tools and compares the PR branch against `base_ref`.
3. The review must report: verdict, blocking findings, non-blocking findings, security concerns, test gaps, and scope drift.
4. The wrapper posts the generated review as a durable PR comment using the repository-scoped `GITHUB_TOKEN`.
5. The review runner makes no source edits. The wrapper removes the task trigger from the branch.
6. Blocking findings become a new implementation/fix pass followed by another independent review.

## Task File Contract

Path: `.github/superpowers/byok-task.json`

Example implementation task:

```json
{
  "bridge": "v1.2",
  "mode": "implement",
  "pr_number": 42,
  "base_ref": "main",
  "task": "Implement the accepted task brief on this PR branch.",
  "acceptance": [
    "Preserve existing behavior outside scope",
    "Run the smallest relevant checks"
  ],
  "tests": ["Use repository-native validation described in AGENTS.md"]
}
```

Required validation:

- `bridge` must equal `v1.2`.
- `mode` must be `implement` or `review`.
- `pr_number` must be a positive integer.
- `base_ref` must match a conservative Git ref allowlist and may not begin with `-`.
- `task` must be a non-empty string.
- `acceptance` must be an array of strings.
- The task file is temporary execution state and must not remain in the final PR diff.

## Secret and Credential Model

- Required provider secret: repository Actions secret `OPENAI_API_KEY`.
- Optional repository Actions variable: `SUPERPOWERS_BYOK_MODEL`; default is a documented OpenAI model identifier maintained by the runner.
- No OpenAI secret is stored in Git history.
- The runner reads the OpenAI secret exactly once, stores it in a local JavaScript variable, deletes the environment variable, then starts the Copilot SDK client.
- `actions/checkout` uses `persist-credentials: false` while the AI agent is active.
- The repository `GITHUB_TOKEN` is supplied only to wrapper steps that post the review comment or push the wrapper-owned commit after the AI session has stopped.
- Project-level OpenAI keys and project spend/rate limits are preferred so BYOK usage is isolated and auditable.

## Agent Permission Boundary

Implementation mode may use repository-local read/search/edit/shell capabilities but the policy layer denies or blocks:

- `git push`, `git commit`, `git reset`, and `git clean` from the AI session;
- GitHub CLI/API mutation from the AI session;
- environment-dumping commands such as `env` and `printenv`;
- modification of `.github/superpowers/byok-runner.mjs`;
- modification of `.github/superpowers/byok-policy.mjs`;
- modification of `.github/workflows/superpowers-byok-agent.yml`;
- modification of `.github/superpowers/byok-task.json`;
- modification of root `AGENTS.md` or `.github/copilot-instructions.md` by ordinary BYOK implementation tasks;
- explicit release, deploy, merge, secret, credential, or default-branch mutation operations.

Review mode is read-only and excludes editing tools.

The Actions runner is ephemeral, but the workflow still follows least-privilege principles rather than `--allow-all` or unrestricted MCP access.

## Loop Prevention

The workflow is triggered by a push that changes `.github/superpowers/byok-task.json` on a non-default branch. The wrapper removes that file only after a successful session and commits the result with `[skip byok]`. GitHub-generated token pushes normally do not recursively create new workflow runs; the skip marker and job condition provide an additional guard.

## Failure Behavior

- Missing `OPENAI_API_KEY`: fail before starting the SDK and report a configuration error without printing a secret value.
- Invalid task schema: fail before model invocation.
- BYOK provider quota/rate-limit failure: leave the task file on the branch, report failure, and do not push partial changes.
- Agent creates a local commit: fail the guard; do not push.
- Agent changes protected Bridge runner/governance files: fail the guard; do not push.
- Implementation returns no source change: fail and leave the task trigger for controller inspection.
- Tests fail: agent may attempt scoped fixes during its session; unresolved failures are reported and the wrapper must not claim completion.
- Review finds blockers: controller creates explicit fix work and requires re-review.

## Controller Routing Rules

The v1.2 controller uses this order:

1. `@copilot` cloud agent on the existing PR branch.
2. BYOK implementation runner on that same branch when cloud execution is unavailable or `FORCE BYOK` is requested.
3. Standard independent Copilot review when available.
4. BYOK read-only independent review when standard review is unavailable.
5. Controller verification of diff, tests/checks, and review status.
6. Explicit user authorization before merge/release/deploy/destructive action.

The controller must not silently switch providers because of an implementation-quality disagreement. BYOK fallback is a capacity/availability path or an explicit user choice.

## Repository Rollout

The same runner/workflow and v1.2 contract are rolled out to all repositories currently participating in the Global Superpowers Bridge:

- `JavsonOf/main`
- `JavsonOf/linear-webhook-template`
- `JavsonOf/FreediscWebView`
- `JavsonOf/eve-slack-agent`
- `JavsonOf/prime-agent`
- `JavsonOf/GameDevTycoon-Android`
- `JavsonOf/Historie-HFY`
- `JavsonOf/cloud-aikido`
- `JavsonOf/firecrawl`
- `JavsonOf/Code-Empire`
- `JavsonOf/AI-Webtoon-Studio`

Repository-specific instructions remain authoritative when more specific. The rollout does not modify application/runtime behavior unless the temporary BYOK task trigger is explicitly added to an isolated PR branch.

## Verification

Before v1.2 merge:

- Unit-test task validation and tool-policy decisions with Node's built-in test runner.
- Validate the workflow structure and trigger/permissions contract.
- Verify the runner contains no literal secret and deletes the provider secret from `process.env` before client creation.
- Verify all rollout PRs change only Bridge governance/runner files and the central spec/plan in `JavsonOf/main`.
- Run one live BYOK smoke task only after `OPENAI_API_KEY` is configured in a test repository/branch. The smoke must prove same-branch edit/push and task-file cleanup without merge.
- Perform independent review of the rollout before requesting merge authorization.

## Merge Gate

Passing tests, successful BYOK execution, and reviewer approval do not authorize merge. Global rollout merge remains an explicit user-authorized action.