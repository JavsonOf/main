# Global Superpowers Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap every current non-empty `JavsonOf` repository with a reviewable Superpowers-compatible agent contract and prepare the GitHub/Codex execution loop without modifying default branches directly.

**Architecture:** Each repository gets an isolated `chore/global-superpowers-bridge` branch and a PR containing only agent-instruction changes. Existing repository-specific instructions are preserved verbatim and extended with a clearly delimited global contract; repositories without instruction files receive the contract as new files. GitHub remains the durable controller ledger, while coding-agent execution is delegated through GitHub's agent surfaces when account policy permits it.

**Tech Stack:** GitHub repositories, Git branches/PRs, Markdown `AGENTS.md`, `.github/copilot-instructions.md`, GitHub Copilot/OpenAI Codex agent surfaces.

**Spec:** `docs/superpowers/specs/2026-08-26-global-superpowers-bridge-design.md`

## Global Constraints

- Preserve all repository-specific `AGENTS.md`, `.github/copilot-instructions.md`, CI workflows, build systems, and project instructions; never overwrite them blindly.
- Never implement directly on `main`/`master` unless explicitly authorized.
- Use the smallest scoped branch/PR possible.
- Follow repository-native tooling and conventions.
- Run tests/build checks appropriate to touched code; instruction-only bootstrap changes require diff/content validation rather than unrelated project builds.
- Do not perform destructive operations, credential changes, secret creation, release publishing, force updates, or merges without explicit authorization.
- Keep implementation and independent review as separate passes.
- Use GitHub issues, branches, commits, PRs, reviews, CI status, and logs as durable state.
- Do not copy a universal build workflow into all repositories.
- `JavsonOf/Code-Empire` is currently empty; do not violate the default-branch rule to initialize it. Record it as blocked until a first commit exists or the user explicitly authorizes an initialization exception.

---

## File Structure

For each non-empty repository:

- `AGENTS.md` — repository agent contract. Create when absent; append a delimited Global Superpowers Bridge section when present.
- `.github/copilot-instructions.md` — persistent Copilot/agent instructions. Create when absent; preserve existing content before appending the global bridge section when present.

No CI workflow files are created or modified by this rollout.

### Task 1: Inventory and conflict scan

**Files:** Read only existing `AGENTS.md`, `.github/copilot-instructions.md`, `.github/agents/`, and `.github/workflows/` where present.

**Interfaces:**
- Consumes: current default-branch repository contents.
- Produces: classification of each repo as create/merge/blocked.

- [ ] Verify all repositories currently accessible to `JavsonOf`.
- [ ] Detect pre-existing instruction files and preserve their content.
- [ ] Confirm `Code-Empire` is empty and exclude it from branch rollout without changing `main`.
- [ ] Record repositories with existing project-specific agent rules.

### Task 2: Apply the global agent contract on isolated branches

**Files:** `AGENTS.md`, `.github/copilot-instructions.md` in each non-empty repository.

**Interfaces:**
- Consumes: Task 1 create/merge classification.
- Produces: branch `chore/global-superpowers-bridge` in each non-empty repository containing only instruction changes.

- [ ] Create `chore/global-superpowers-bridge` from each repository's default branch.
- [ ] Create or conservatively extend `AGENTS.md` with the exact Global Superpowers Bridge contract.
- [ ] Create or conservatively extend `.github/copilot-instructions.md` with equivalent persistent instructions.
- [ ] Do not modify `.github/workflows/**` or application code.

### Task 3: Open reviewable bootstrap PRs

**Files:** No additional files.

**Interfaces:**
- Consumes: Task 2 branches.
- Produces: one PR per non-empty repository, base `main`, head `chore/global-superpowers-bridge`.

- [ ] Open a PR titled `chore: add Global Superpowers Bridge` in every bootstrapped repository.
- [ ] Describe preserved existing instructions, changed files, validation performed, and the `Code-Empire` exception where relevant.
- [ ] Do not merge any PR.

### Task 4: Independent validation

**Files:** Review diffs only.

**Interfaces:**
- Consumes: Task 3 PRs.
- Produces: verified bootstrap state or explicit findings.

- [ ] Verify every PR changes only `AGENTS.md` and/or `.github/copilot-instructions.md` plus this plan in `JavsonOf/main`.
- [ ] Verify pre-existing `AGENTS.md`/Copilot content remains present.
- [ ] Verify no credentials, tokens, secrets, workflow changes, releases, or default-branch writes were introduced.
- [ ] Verify Markdown is readable and the branch targets the correct default branch.

### Task 5: Agent availability and smoke-test handoff

**Files:** GitHub issue/PR metadata only.

**Interfaces:**
- Consumes: validated bootstrap PRs and GitHub account agent policy.
- Produces: smoke-test issue ready for a fresh coding agent or an explicit connector/account-policy blocker.

- [ ] Verify evidence that GitHub Copilot cloud-agent sessions are available on the account.
- [ ] Verify OpenAI Codex partner-agent availability separately when the GitHub surface exposes it.
- [ ] Create one harmless smoke-test issue after bootstrap validation.
- [ ] Delegate it to a fresh coding-agent session only through a supported GitHub agent surface.
- [ ] If the current connector cannot perform `assign-to-agent`, leave the issue ready and record that exact limitation rather than pretending the agent was started.
- [ ] Do not merge the smoke-test PR, publish, release, or alter credentials.

## Self-Review

- Spec coverage: inventory, merge-aware bootstrap, isolated branches/PRs, validation, account-level agent check, smoke-test path, future limitation, and `Code-Empire` empty-repo edge case are all represented.
- Placeholder scan: no TBD/TODO placeholders.
- Type/interface consistency: branch name, file paths, base branch, and outputs are consistent across tasks.
