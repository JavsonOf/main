# Global Superpowers Bridge — Design Specification

## Scope

Deploy a reusable Superpowers-style coding workflow across every repository currently owned by `JavsonOf`, without coupling the solution to a single project or technology stack.

Current repository inventory discovered through the authenticated GitHub connection:

- `JavsonOf/main`
- `JavsonOf/linear-webhook-template`
- `JavsonOf/FreediscWebView`
- `JavsonOf/eve-slack-agent`
- `JavsonOf/prime-agent`
- `JavsonOf/GameDevTycoon-Android`
- `JavsonOf/Historie-HFY`
- `JavsonOf/cloud-aikido`
- `JavsonOf/Code-Empire`
- `JavsonOf/firecrawl`
- `JavsonOf/AI-Webtoon-Studio`

The deployment must preserve repository-specific behavior. Existing `AGENTS.md`, `.github/copilot-instructions.md`, CI workflows, build systems, and project instructions must not be overwritten blindly.

## Goal

Make each repository ready for a repeatable workflow in which ChatGPT acts as controller, GitHub stores durable task state, OpenAI Codex acts as a fresh coding worker for implementation tasks, independent review checks the resulting PR, and GitHub Actions executes project-native tests/builds.

## Architecture

### 1. Controller

ChatGPT coordinates the workflow:

1. inspect repository state;
2. create or refine an implementation task;
3. create a GitHub issue containing the complete task brief;
4. delegate implementation to a fresh coding-agent session;
5. inspect the resulting branch/PR/diff;
6. run or inspect CI;
7. perform an independent review pass;
8. create a fix task when findings remain;
9. repeat until the acceptance criteria are satisfied.

The controller must not merge a PR automatically unless the user explicitly requests or has already authorized that merge.

### 2. Fresh workers

Each implementation task is handled by a new OpenAI Codex coding-agent session instead of reusing the controller context. The issue/task brief is the source of truth for that worker.

A fresh worker must:

- read `AGENTS.md` and repository instructions before editing;
- use an isolated branch/session;
- implement only the assigned scope;
- run the repository's relevant tests/build checks;
- report files changed, commands run, test results, and unresolved risks;
- create or update a pull request rather than committing directly to the default branch.

### 3. Review isolation

The implementation output must be reviewed independently from the implementation pass. The review checks:

- spec compliance;
- correctness;
- regressions;
- security-sensitive changes;
- test quality;
- repository conventions;
- unnecessary scope expansion.

Review findings are converted into explicit fix tasks. A reviewer must not silently rewrite requirements.

### 4. Durable state

GitHub is the durable execution ledger. Issues, branches, commits, PRs, review comments, CI status, and workflow logs are authoritative after context loss.

For multi-task plans, the repository may additionally contain a plan-specific ledger under `.superpowers/sdd/` when an execution environment supports it. GitHub-native artifacts remain the recovery source when local scratch state is unavailable.

### 5. Repository bootstrap

Each repository receives or preserves a minimal repository-level control surface:

- `AGENTS.md` — agent execution contract and Superpowers handoff rules;
- `.github/copilot-instructions.md` — persistent repository-wide Copilot/agent instructions;
- optional `.github/agents/` profiles when repository-specific custom roles provide clear value;
- existing CI/build workflows remain project-specific and are not replaced by a generic workflow.

If an instruction file already exists, deployment must merge the global contract into it conservatively while retaining the repository's existing project-specific rules.

### 6. No universal build workflow

There is deliberately no single build/test workflow copied into every repository. GitHub Actions configuration remains technology-specific:

- Godot projects can use Godot headless/export workflows;
- Android projects can use Gradle/Android SDK workflows;
- Node/web projects can use their own package-manager/test/build commands;
- documentation/content repositories do not receive irrelevant build tooling.

The global bridge standardizes orchestration, not the project's implementation stack.

## Global Agent Contract

The global instructions distributed to repositories must require agents to:

1. read repository instructions before acting;
2. never implement directly on `main`/`master` unless explicitly authorized;
3. use the smallest scoped branch/PR possible;
4. follow repository-native tooling and conventions;
5. run tests/build checks appropriate to touched code;
6. avoid destructive operations, credential changes, secret creation, release publishing, or merges without explicit authorization;
7. report uncertainty instead of inventing repository facts;
8. keep implementation and independent review as separate passes;
9. use GitHub artifacts as durable state;
10. preserve existing project-specific instructions when global rules are installed.

## Security Model

- Secrets must not be written into repository files or issue/PR text.
- GitHub Actions secrets remain outside agent-visible source files.
- Destructive actions, publishing, releases, default-branch force updates, and merges require explicit authorization.
- Third-party coding-agent availability is controlled by GitHub/Copilot account policy and may require one-time activation in GitHub settings.
- Public-preview agent capabilities must be treated as changeable; repository instructions must not depend on undocumented behavior.

## Rollout Strategy

### Phase A — Inventory and conflict scan

For every repository:

- detect existing `AGENTS.md`;
- detect existing `.github/copilot-instructions.md`;
- detect existing `.github/agents/` configuration;
- inspect CI/build entry points;
- classify repository type;
- record whether bootstrap files should be created or merged.

### Phase B — Global bootstrap

Apply the global agent contract to every current `JavsonOf` repository using isolated branches and PRs rather than blind default-branch edits.

Repositories with existing instructions receive merged versions, not replacements.

### Phase C — Validation

For each repository:

- verify instruction files are syntactically readable Markdown;
- verify existing project-specific content was preserved;
- verify no secrets or credentials were introduced;
- verify CI configuration was not unintentionally modified;
- inspect the bootstrap PR diff.

### Phase D — Agent activation check

Confirm that the OpenAI Codex coding agent is enabled for the user's GitHub/Copilot account. This is an account-level GitHub setting and cannot be safely inferred solely from repository contents.

### Phase E — End-to-end smoke test

Select a harmless, reversible task in one repository and prove the chain:

`Issue -> fresh coding-agent session -> branch/PR -> CI -> independent review -> fix loop if needed`.

The smoke test must not publish a release, merge to default, alter credentials, or change production infrastructure.

## Future Repositories

The account-level operating rule is that newly created `JavsonOf` repositories should receive the same bootstrap contract. Because a personal GitHub account does not provide organization-level repository instruction inheritance, new repositories must be bootstrapped explicitly unless GitHub introduces a supported user-level repository instruction mechanism.

## Success Criteria

The bridge is considered deployed when:

- every current repository has a compatible agent instruction contract;
- pre-existing repository-specific instructions remain intact;
- all bootstrap changes are visible as reviewable branch/PR changes;
- no default branch has been modified directly as part of bootstrap;
- Codex account availability has been verified or clearly marked as the only remaining manual account-policy prerequisite;
- at least one end-to-end smoke test demonstrates the task/agent/PR/review/CI loop.
