import fs from 'node:fs';
import path from 'node:path';
import { CopilotClient } from '@github/copilot-sdk';
import { buildPrompt, toolDecision, validateTask } from './byok-policy.mjs';

const TASK_PATH = path.resolve('.github/superpowers/byok-task.json');

function appendSummary(text) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) fs.appendFileSync(summaryPath, `${text}\n`);
}

function loadTask() {
  const raw = fs.readFileSync(TASK_PATH, 'utf8');
  return validateTask(JSON.parse(raw));
}

const task = loadTask();
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not configured for this repository.');
}

// Keep the provider credential only in this process. The Copilot runtime and
// any shell commands it launches must not inherit the secret through env.
delete process.env.OPENAI_API_KEY;
delete process.env.COPILOT_PROVIDER_API_KEY;

const model = process.env.SUPERPOWERS_BYOK_MODEL?.trim() || 'gpt-5.4';
const reviewOutput = process.env.BYOK_REVIEW_OUTPUT?.trim();

const client = new CopilotClient();
let session;

try {
  session = await client.createSession({
    model,
    provider: {
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      wireApi: 'responses',
      apiKey,
    },
    workingDirectory: process.cwd(),
    availableTools: task.mode === 'review'
      ? ['view', 'grep', 'glob', 'bash']
      : ['view', 'grep', 'glob', 'edit', 'create', 'apply_patch', 'bash'],
    hooks: {
      onPreToolUse: async (input) => toolDecision(input, task.mode),
    },
    onPermissionRequest: async () => ({ kind: 'approve-once' }),
  });

  const response = await session.sendAndWait({ prompt: buildPrompt(task) });
  const content = response?.data?.content?.trim() || 'BYOK agent completed without a textual summary.';

  if (task.mode === 'review') {
    if (!reviewOutput) throw new Error('BYOK_REVIEW_OUTPUT is required in review mode.');
    fs.writeFileSync(reviewOutput, `${content}\n`, 'utf8');
  }

  appendSummary(`## Global Superpowers Bridge v1.2 BYOK (${task.mode})\n\nModel: \`${model}\`\n\n${content}`);
  process.stdout.write(`${content}\n`);
} finally {
  if (session) await session.disconnect().catch(() => {});
  await client.stop().catch(() => {});
}
