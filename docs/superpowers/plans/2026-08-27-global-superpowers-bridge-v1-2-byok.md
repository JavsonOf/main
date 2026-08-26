# Global Superpowers Bridge v1.2 BYOK Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure OpenAI API BYOK implementation/review fallback to every repository participating in Global Superpowers Bridge while preserving the existing same-PR branch and explicit merge-authorization contracts.

**Architecture:** Each repository gets an identical GitHub Actions runner surface: a temporary `byok-task.json` on an isolated PR branch triggers a repository-local Copilot SDK session. The SDK receives the OpenAI key through provider configuration after the runner removes the key from the process environment; the AI session never owns GitHub push credentials. The workflow wrapper performs the final same-branch commit/push or posts a read-only review comment.

**Tech Stack:** GitHub Actions, Node.js 22, `@github/copilot-sdk`, OpenAI-compatible provider via Responses wire API, Node built-in `node:test`, Git/GitHub repository token wrapper steps.

**Spec:** `docs/superpowers/specs/2026-08-27-global-superpowers-bridge-v1-2-byok-design.md`

## Global Constraints

- Cloud `@copilot` remains the primary execution engine.
- BYOK fallback works on the existing isolated PR head branch; it never branch-hops from the PR.
- Required Actions secret is `OPENAI_API_KEY`; secrets are never committed or printed.
- The AI session receives no persisted checkout credential and cannot commit/push/merge/release/deploy/change secrets.
- Review mode is read-only.
- Repository-specific instructions remain authoritative when more specific.
- No rollout PR may be merged without explicit user authorization.

---

### Task 1: Build and test the BYOK policy module

**Files:**
- Create: `.github/superpowers/byok-policy.test.mjs`
- Create: `.github/superpowers/byok-policy.mjs`

**Interfaces:**
- Produces `validateTask(task)` returning normalized task data or throwing a validation error.
- Produces `isProtectedPath(path)` for Bridge governance files.
- Produces `toolDecision(input, mode)` returning `{ permissionDecision: "allow" | "deny", permissionDecisionReason?: string }`.

- [ ] **Step 1: Write failing tests**

Tests must prove:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateTask, isProtectedPath, toolDecision } from "./byok-policy.mjs";

test("accepts a valid v1.2 implementation task", () => {
  const task = validateTask({
    bridge: "v1.2",
    mode: "implement",
    pr_number: 12,
    base_ref: "main",
    task: "Implement the accepted brief",
    acceptance: ["Tests pass"],
    tests: ["Use repository-native checks"],
  });
  assert.equal(task.mode, "implement");
});

test("rejects unsafe base refs", () => {
  assert.throws(() => validateTask({
    bridge: "v1.2",
    mode: "review",
    pr_number: 12,
    base_ref: "-upload-pack=evil",
    task: "Review",
    acceptance: [],
  }));
});

test("protects Bridge runtime and governance files", () => {
  assert.equal(isProtectedPath(".github/superpowers/byok-runner.mjs"), true);
  assert.equal(isProtectedPath("AGENTS.md"), true);
  assert.equal(isProtectedPath("src/app.ts"), false);
});

test("review mode denies edit tools", () => {
  assert.equal(toolDecision({ toolName: "edit", toolArgs: {} }, "review").permissionDecision, "deny");
});

test("implementation mode denies git push", () => {
  const decision = toolDecision({ toolName: "bash", toolArgs: { command: "git push origin HEAD" } }, "implement");
  assert.equal(decision.permissionDecision, "deny");
});
```

- [ ] **Step 2: Run RED test**

Run:

```bash
node --test .github/superpowers/byok-policy.test.mjs
```

Expected: FAIL because `byok-policy.mjs` does not exist.

- [ ] **Step 3: Implement minimal policy**

Implement strict schema validation, protected-path matching, review read-only enforcement, and blocked shell mutations/environment dumps.

- [ ] **Step 4: Run GREEN test**

Run the same `node --test` command. Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/superpowers/byok-policy.mjs .github/superpowers/byok-policy.test.mjs
git commit -m "feat: add BYOK runner policy"
```

### Task 2: Add the Copilot SDK BYOK runner

**Files:**
- Create: `.github/superpowers/byok-runner.mjs`
- Test: `.github/superpowers/byok-policy.test.mjs`

**Interfaces:**
- Reads `.github/superpowers/byok-task.json`.
- Reads `OPENAI_API_KEY` once, deletes it from `process.env`, and creates the provider config `{ type: "openai", baseUrl: "https://api.openai.com/v1", wireApi: "responses", apiKey }`.
- Uses `SUPERPOWERS_BYOK_MODEL` when non-empty, otherwise a documented default.
- Writes review output to `BYOK_REVIEW_OUTPUT` when `mode === "review"`.

- [ ] **Step 1: Extend tests for prompt/task normalization and protected runner paths**
- [ ] **Step 2: Run tests and verify RED for the new exported behavior**
- [ ] **Step 3: Implement runner with `CopilotClient`, `workingDirectory: process.cwd()`, `availableTools` by mode, `hooks.onPreToolUse: toolDecision`, and `onPermissionRequest` approve-once only after the policy hook allows the tool**
- [ ] **Step 4: Ensure the runner instantiates the Copilot client only after `delete process.env.OPENAI_API_KEY`**
- [ ] **Step 5: Run policy tests and static syntax check**

```bash
node --test .github/superpowers/byok-policy.test.mjs
node --check .github/superpowers/byok-runner.mjs
```

- [ ] **Step 6: Commit**

```bash
git add .github/superpowers/byok-runner.mjs .github/superpowers/byok-policy.test.mjs
git commit -m "feat: add Copilot SDK BYOK runner"
```

### Task 3: Add the same-branch Actions wrapper

**Files:**
- Create: `.github/workflows/superpowers-byok-agent.yml`

**Interfaces:**
- Trigger: push changing `.github/superpowers/byok-task.json` on branches other than `main` and `master`.
- Permissions: `contents: write`, `pull-requests: write`; credentials are not persisted during the AI session.
- Implementation mode: verify no local agent commit/protected-file edit, remove trigger, wrapper-commit changes with `[skip byok]`, then push same branch.
- Review mode: verify clean source tree, remove trigger, wrapper-commit cleanup, post generated Markdown as a PR comment.

- [ ] **Step 1: Add workflow with `actions/checkout@v6`, `actions/setup-node@v7`, Node 22, and `persist-credentials: false`**
- [ ] **Step 2: Validate task JSON before installing/invoking the model**
- [ ] **Step 3: Install `@github/copilot-sdk` into `.github/superpowers/node_modules` without changing tracked dependency manifests**
- [ ] **Step 4: Run the SDK runner with `OPENAI_API_KEY` passed only to that process**
- [ ] **Step 5: Add post-session guards for unchanged HEAD and protected Bridge files**
- [ ] **Step 6: Add wrapper-owned same-branch commit/push and review-comment path**
- [ ] **Step 7: Validate YAML structure and inspect the complete diff**
- [ ] **Step 8: Commit**

### Task 4: Upgrade the persistent Bridge contract to v1.2

**Files:**
- Modify: `AGENTS.md`
- Modify: `.github/copilot-instructions.md`

**Interfaces:**
- Adds `Dual Engine / BYOK Fallback` routing rules.
- Keeps all v1.1 branch ownership, safety, verification, and merge gates.

- [ ] **Step 1: Change only the existing Bridge marker/block from v1.1 to v1.2**
- [ ] **Step 2: Add cloud-primary/BYOK-fallback routing, `FORCE BYOK`, same-PR branch requirement, and review fallback**
- [ ] **Step 3: Preserve repository-specific content outside the Bridge block byte-for-byte where practical**
- [ ] **Step 4: Validate that no credential value or secret is present**
- [ ] **Step 5: Commit**

### Task 5: Roll out identical runtime files to all 11 participating repositories

**Files in every repository:**
- Create: `.github/superpowers/byok-policy.mjs`
- Create: `.github/superpowers/byok-policy.test.mjs`
- Create: `.github/superpowers/byok-runner.mjs`
- Create: `.github/workflows/superpowers-byok-agent.yml`
- Modify: `AGENTS.md`
- Modify: `.github/copilot-instructions.md`

**Repositories:** `main`, `linear-webhook-template`, `FreediscWebView`, `eve-slack-agent`, `prime-agent`, `GameDevTycoon-Android`, `Historie-HFY`, `cloud-aikido`, `firecrawl`, `Code-Empire`, `AI-Webtoon-Studio`.

- [ ] **Step 1: Create `feat/global-superpowers-bridge-v1-2-byok` from each current default branch**
- [ ] **Step 2: Copy identical runtime/policy/test/workflow files to each branch**
- [ ] **Step 3: Upgrade each existing Bridge block to v1.2 while preserving repo-specific rules**
- [ ] **Step 4: Confirm runtime files have identical content hashes across all repositories**
- [ ] **Step 5: Open one rollout PR per repository targeting `main`**

### Task 6: Independent rollout verification

**Files:** No new production files.

- [ ] **Step 1: Confirm every PR is open, non-draft, targets `main`, and changes only Bridge/runtime files plus central spec/plan in `JavsonOf/main`**
- [ ] **Step 2: Fresh-read `AGENTS.md` and `.github/copilot-instructions.md` on each rollout branch and confirm `global-superpowers-bridge:v1.2`**
- [ ] **Step 3: Fresh-read the workflow/runner/policy on representative generic and repo-specific repositories**
- [ ] **Step 4: Run/request an independent review pass on every rollout PR**
- [ ] **Step 5: Convert blocking findings into scoped fixes and re-review**

### Task 7: Live BYOK smoke test after secret setup

**Files:** Temporary `.github/superpowers/byok-task.json` on a dedicated smoke PR branch; it must be removed by the successful workflow.

- [ ] **Step 1: Configure the repository Actions secret `OPENAI_API_KEY` through a secure setup path; never paste it into chat or repository content**
- [ ] **Step 2: Create a dedicated isolated smoke branch/PR**
- [ ] **Step 3: Add a tiny implementation task that creates one disposable documentation file**
- [ ] **Step 4: Verify the push-triggered BYOK workflow starts, uses the same branch, and pushes the resulting wrapper commit**
- [ ] **Step 5: Verify `.github/superpowers/byok-task.json` is absent from the final PR diff**
- [ ] **Step 6: Trigger `mode: review` and verify a durable BYOK independent-review PR comment appears without source edits**
- [ ] **Step 7: Close the smoke PR without merge unless the user separately authorizes it**

### Task 8: Merge authorization gate

- [ ] **Step 1: Report exact rollout PRs, heads, reviews, static checks, and smoke-test status**
- [ ] **Step 2: Do not merge any rollout PR until the user gives explicit v1.2 merge authorization**
- [ ] **Step 3: After authorization, merge with fresh `expected_head_sha` guards and verify v1.2 on all default branches**