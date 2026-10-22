import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTask, isProtectedPath, toolDecision, buildPrompt } from './byok-policy.mjs';

const validTask = {
  bridge: 'v1.2',
  mode: 'implement',
  pr_number: 12,
  base_ref: 'main',
  task: 'Implement the accepted brief',
  acceptance: ['Tests pass'],
  tests: ['Use repository-native checks'],
};

test('accepts a valid v1.2 implementation task', () => {
  const task = validateTask(validTask);
  assert.equal(task.mode, 'implement');
  assert.equal(task.base_ref, 'main');
});

test('rejects unsafe base refs', () => {
  assert.throws(() => validateTask({ ...validTask, mode: 'review', base_ref: '-upload-pack=evil' }), /base_ref/);
  assert.throws(() => validateTask({ ...validTask, base_ref: 'main;echo pwned' }), /base_ref/);
});

test('rejects malformed task fields', () => {
  assert.throws(() => validateTask({ ...validTask, bridge: 'v1.1' }), /bridge/);
  assert.throws(() => validateTask({ ...validTask, pr_number: 0 }), /pr_number/);
  assert.throws(() => validateTask({ ...validTask, task: '   ' }), /task/);
  assert.throws(() => validateTask({ ...validTask, acceptance: [4] }), /acceptance/);
});

test('protects Bridge runtime and governance files', () => {
  assert.equal(isProtectedPath('.github/superpowers/byok-runner.mjs'), true);
  assert.equal(isProtectedPath('.github/superpowers/byok-policy.mjs'), true);
  assert.equal(isProtectedPath('.github/workflows/superpowers-byok-agent.yml'), true);
  assert.equal(isProtectedPath('.github/superpowers/byok-task.json'), true);
  assert.equal(isProtectedPath('AGENTS.md'), true);
  assert.equal(isProtectedPath('.github/copilot-instructions.md'), true);
  assert.equal(isProtectedPath('src/app.ts'), false);
});

test('review mode denies editing tools', () => {
  for (const toolName of ['edit', 'write', 'write_file', 'create', 'create_file', 'apply_patch']) {
    assert.equal(toolDecision({ toolName, toolArgs: {} }, 'review').permissionDecision, 'deny');
  }
});

test('implementation mode denies dangerous shell mutations and environment dumps', () => {
  const blocked = [
    'git push origin HEAD',
    'git commit -am x',
    'git reset --hard HEAD~1',
    'git clean -fd',
    'git checkout other-branch',
    'git switch feature',
    'git add src/app.ts',
    'git stash',
    'git merge main',
    'git rebase main',
    'gh pr merge 12',
    'env',
    'printenv',
  ];
  for (const command of blocked) {
    const decision = toolDecision({ toolName: 'bash', toolArgs: { command } }, 'implement');
    assert.equal(decision.permissionDecision, 'deny', command);
  }
});

test('implementation mode allows ordinary repository-local commands', () => {
  for (const command of ['git status --short', 'npm test', 'pnpm test', 'python -m pytest']) {
    const decision = toolDecision({ toolName: 'bash', toolArgs: { command } }, 'implement');
    assert.equal(decision.permissionDecision, 'allow', command);
  }
});

test('denies attempts to edit protected paths', () => {
  const decision = toolDecision({
    toolName: 'create',
    toolArgs: { path: '.github/superpowers/byok-runner.mjs' },
  }, 'implement');
  assert.equal(decision.permissionDecision, 'deny');
});

test('allows safe file content that merely mentions a protected filename', () => {
  const decision = toolDecision({
    toolName: 'create',
    toolArgs: { path: 'docs/bridge.md', content: 'Read AGENTS.md before editing.' },
  }, 'implement');
  assert.equal(decision.permissionDecision, 'allow');
});

test('review mode rejects shell command chaining and redirection', () => {
  const blocked = [
    'git diff; rm -rf src',
    'git diff && rm -rf src',
    'git diff | tee out.txt',
    'git diff > out.txt',
    'git diff\nrm -rf src',
  ];
  for (const command of blocked) {
    const decision = toolDecision({ toolName: 'bash', toolArgs: { command } }, 'review');
    assert.equal(decision.permissionDecision, 'deny', command);
  }
});

test('workflow has a hard clean-tree guard for review and avoids git add -A', () => {
  const workflow = fs.readFileSync(new URL('../workflows/superpowers-byok-agent.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Enforce read-only review working tree/);
  assert.doesNotMatch(workflow, /git add -A/);
});

test('buildPrompt includes mode, base ref, acceptance, and immutable safety rules', () => {
  const prompt = buildPrompt(validTask);
  assert.match(prompt, /Mode: implement/);
  assert.match(prompt, /Base ref: main/);
  assert.match(prompt, /Tests pass/);
  assert.match(prompt, /Do not commit or push/);
  assert.match(prompt, /AGENTS\.md/);
});
