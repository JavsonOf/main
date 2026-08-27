const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/;
const PROTECTED_PATHS = new Set([
  'AGENTS.md',
  '.github/copilot-instructions.md',
  '.github/superpowers/byok-runner.mjs',
  '.github/superpowers/byok-policy.mjs',
  '.github/superpowers/byok-policy.test.mjs',
  '.github/superpowers/byok-task.json',
  '.github/workflows/superpowers-byok-agent.yml',
]);

function assertStringArray(value, name, { optional = false } = {}) {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be an array of strings`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export function validateTask(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('task must be an object');
  }
  if (input.bridge !== 'v1.2') throw new Error('bridge must equal v1.2');
  if (!['implement', 'review'].includes(input.mode)) {
    throw new Error('mode must be implement or review');
  }
  if (!Number.isInteger(input.pr_number) || input.pr_number <= 0) {
    throw new Error('pr_number must be a positive integer');
  }
  if (typeof input.base_ref !== 'string' || !SAFE_REF.test(input.base_ref) || input.base_ref.startsWith('-')) {
    throw new Error('base_ref is invalid');
  }
  if (typeof input.task !== 'string' || !input.task.trim()) {
    throw new Error('task must be a non-empty string');
  }

  return Object.freeze({
    bridge: 'v1.2',
    mode: input.mode,
    pr_number: input.pr_number,
    base_ref: input.base_ref,
    task: input.task.trim(),
    acceptance: assertStringArray(input.acceptance, 'acceptance'),
    tests: assertStringArray(input.tests, 'tests', { optional: true }),
  });
}

export function isProtectedPath(candidate) {
  if (typeof candidate !== 'string') return false;
  const normalized = candidate.replaceAll('\\', '/').replace(/^\.\//, '');
  return PROTECTED_PATHS.has(normalized);
}

function allStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) allStrings(item, output);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) allStrings(item, output);
  }
  return output;
}

function getShellText(input) {
  return allStrings(input?.toolArgs ?? {}).join('\n');
}

function looksLikeEditTool(name) {
  return /(^|[_-])(edit|write|create|apply.?patch|delete)([_-]|$)/i.test(name) || ['edit', 'write', 'write_file', 'create', 'create_file', 'apply_patch'].includes(name);
}

function looksLikeShellTool(name) {
  return /bash|shell|execute|powershell/i.test(name);
}

function protectedPathMention(strings) {
  return strings.some((value) => [...PROTECTED_PATHS].some((path) => value.replaceAll('\\', '/').includes(path)));
}

const GIT_READ_ONLY = new Set(['status', 'diff', 'show', 'log', 'grep', 'rev-parse', 'merge-base', 'ls-files', 'blame', 'describe']);

const DANGEROUS_SHELL = [
  /(^|[;&|]\s*)gh\s+/i,
  /(^|[;&|]\s*)(env|printenv)\b/i,
  /(^|[;&|]\s*)set\s*$/i,
  /(^|[;&|]\s*)(curl|wget|nc|ncat|netcat|scp|sftp|ssh)\b/i,
];

const REVIEW_SAFE_SHELL = [
  /^\s*(git\s+(status|diff|show|log|grep|rev-parse|merge-base)\b.*)$/i,
  /^\s*(rg|grep|find|ls|pwd|cat|head|tail|sed\s+-n)\b.*$/i,
  /^\s*(node\s+--check\b.*)$/i,
];

export function toolDecision(input, mode) {
  const toolName = String(input?.toolName ?? '');
  const strings = allStrings(input?.toolArgs ?? {});

  if (looksLikeEditTool(toolName)) {
    if (mode === 'review') {
      return { permissionDecision: 'deny', permissionDecisionReason: 'BYOK review mode is read-only.' };
    }
    if (protectedPathMention(strings)) {
      return { permissionDecision: 'deny', permissionDecisionReason: 'Bridge governance/runtime files are controller-owned.' };
    }
    return { permissionDecision: 'allow' };
  }

  if (looksLikeShellTool(toolName)) {
    const command = getShellText(input);
    const gitCommands = [...command.matchAll(/\bgit\s+([A-Za-z0-9-]+)/g)].map((match) => match[1].toLowerCase());
    if (gitCommands.some((subcommand) => !GIT_READ_ONLY.has(subcommand))) {
      return { permissionDecision: 'deny', permissionDecisionReason: 'Only read-only Git commands are available to the BYOK agent.' };
    }
    if (DANGEROUS_SHELL.some((pattern) => pattern.test(command))) {
      return { permissionDecision: 'deny', permissionDecisionReason: 'Command is outside the BYOK agent permission boundary.' };
    }
    if (protectedPathMention([command]) && /(>|tee\b|sed\s+-i\b|perl\s+-pi\b|\b(cp|mv|rm|truncate)\b)/i.test(command)) {
      return { permissionDecision: 'deny', permissionDecisionReason: 'Bridge governance/runtime files are controller-owned.' };
    }
    if (mode === 'review' && !REVIEW_SAFE_SHELL.some((pattern) => pattern.test(command.trim()))) {
      return { permissionDecision: 'deny', permissionDecisionReason: 'Review mode permits only read-only inspection commands.' };
    }
    return { permissionDecision: 'allow' };
  }

  if (/url|web|mcp/i.test(toolName)) {
    return { permissionDecision: 'deny', permissionDecisionReason: 'Network/MCP tools are disabled for the repository-local BYOK agent.' };
  }

  return { permissionDecision: 'allow' };
}

export function buildPrompt(task) {
  const acceptance = task.acceptance.length ? task.acceptance.map((item) => `- ${item}`).join('\n') : '- Follow the explicit task brief.';
  const tests = task.tests.length ? task.tests.map((item) => `- ${item}`).join('\n') : '- Use the smallest repository-native validation appropriate to the touched files.';
  const modeRules = task.mode === 'review'
    ? `Review only. Do not edit files. Compare the current branch with ${task.base_ref} and return Markdown with: verdict, blocking findings, non-blocking findings, security concerns, test gaps, and scope drift.`
    : 'Implement the task directly in the current checkout. Make the smallest correct change and run relevant repository-native checks where available.';

  return `Global Superpowers Bridge v1.2 BYOK task.\n\nMode: ${task.mode}\nPR: #${task.pr_number}\nBase ref: ${task.base_ref}\n\nRead root AGENTS.md, .github/copilot-instructions.md, and relevant repository documentation before acting. Repository-specific instructions remain authoritative.\n\nTask:\n${task.task}\n\nAcceptance criteria:\n${acceptance}\n\nValidation guidance:\n${tests}\n\n${modeRules}\n\nImmutable safety rules:\n- Work only in the current repository checkout and current PR branch.\n- Do not commit or push. The workflow wrapper owns Git history and GitHub authentication.\n- Do not merge, release, deploy, rotate/change secrets, or mutate the default branch.\n- Do not modify Global Superpowers Bridge governance/runtime files.\n- Do not inspect or dump process environment variables or credentials.\n- Do not use GitHub CLI/API mutations or external network tools.\n- Report unresolved failures or uncertainty; never claim checks passed unless you actually ran them.`;
}
