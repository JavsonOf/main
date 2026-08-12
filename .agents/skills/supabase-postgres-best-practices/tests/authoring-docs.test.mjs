import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENCES_DIR = join(__dirname, '..', 'references');
const SKILL_PATH = join(__dirname, '..', 'SKILL.md');

const VALID_IMPACT_LEVELS = new Set([
  'CRITICAL',
  'HIGH',
  'MEDIUM-HIGH',
  'MEDIUM',
  'LOW-MEDIUM',
  'LOW',
]);

function read(filename) {
  return readFileSync(join(REFERENCES_DIR, filename), 'utf8');
}

describe('_sections.md', () => {
  const text = read('_sections.md');

  it('defines exactly 8 numbered sections', () => {
    const sections = [...text.matchAll(/^## (\d+)\. (.+?) \(([a-z]+)\)$/gm)];
    assert.equal(sections.length, 8);
  });

  it('numbers sections sequentially starting at 1', () => {
    const numbers = [...text.matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]));
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('gives every section a valid Impact level', () => {
    const impacts = [...text.matchAll(/^\*\*Impact:\*\*\s*(.+)$/gm)].map((m) => m[1].trim());
    assert.equal(impacts.length, 8);
    for (const impact of impacts) {
      assert.ok(VALID_IMPACT_LEVELS.has(impact), `"${impact}" is not a valid impact level`);
    }
  });

  it('gives every section a non-empty Description', () => {
    const descriptions = [...text.matchAll(/^\*\*Description:\*\*\s*(.+)$/gm)].map((m) => m[1].trim());
    assert.equal(descriptions.length, 8);
    for (const description of descriptions) {
      assert.ok(description.length > 0);
    }
  });

  it('matches the prefixes, order, and impact levels declared in SKILL.md', () => {
    const skillText = readFileSync(SKILL_PATH, 'utf8');
    const skillTable = skillText
      .split('## Rule Categories by Priority')[1]
      .split('## How to Use')[0];
    const skillRows = [...skillTable.matchAll(/^\|\s*\d+\s*\|[^|]+\|\s*([^|]+?)\s*\|\s*`([a-z]+)-`\s*\|$/gm)].map(
      ([, impact, prefix]) => ({ prefix, impact: impact.trim() }),
    );

    const sectionRows = [...text.matchAll(/^## \d+\. .+? \(([a-z]+)\)\r?\n\*\*Impact:\*\*\s*(.+)$/gm)].map(
      ([, prefix, impact]) => ({ prefix, impact: impact.trim() }),
    );

    assert.equal(sectionRows.length, skillRows.length);
    assert.deepEqual(sectionRows, skillRows);
  });
});

describe('_template.md', () => {
  const text = read('_template.md');

  it('has a frontmatter block with placeholder title/impact/impactDescription/tags', () => {
    assert.match(text, /^---\r?\ntitle:/);
    assert.match(text, /^impact:\s*\S+/m);
    assert.match(text, /^impactDescription:/m);
    assert.match(text, /^tags:/m);
  });

  it('declares a placeholder impact level that is one of the valid levels', () => {
    const match = text.match(/^impact:\s*(.+)$/m);
    assert.ok(match);
    assert.ok(VALID_IMPACT_LEVELS.has(match[1].trim()));
  });

  it('demonstrates the Incorrect-before-Correct pattern', () => {
    const incorrectIndex = text.indexOf('**Incorrect');
    const correctIndex = text.indexOf('**Correct');
    assert.notEqual(incorrectIndex, -1);
    assert.notEqual(correctIndex, -1);
    assert.ok(incorrectIndex < correctIndex);
  });

  it('ends with a Reference link placeholder', () => {
    assert.match(text, /Reference:\s*\[[^\]]+\]\(https?:\/\/[^\s)]+\)/);
  });
});

describe('_contributing.md', () => {
  const text = read('_contributing.md');

  it('documents the Impact Level Guidelines table with all valid levels', () => {
    const impactSection = text.split('## Impact Level Guidelines')[1] ?? '';
    for (const level of VALID_IMPACT_LEVELS) {
      assert.ok(
        impactSection.includes(`**${level}**`),
        `expected Impact Level Guidelines to document ${level}`,
      );
    }
  });

  it('provides a Review Checklist with actionable checkbox items', () => {
    const checklistSection = text.split('## Review Checklist')[1] ?? '';
    const items = [...checklistSection.matchAll(/^- \[ \] .+$/gm)];
    assert.ok(items.length >= 5, 'expected several checklist items');
  });

  it('requires at least one Incorrect and one Correct example in the checklist', () => {
    assert.match(text, /- \[ \] Has at least 1 \*\*Incorrect\*\* SQL example/);
    assert.match(text, /- \[ \] Has at least 1 \*\*Correct\*\* SQL example/);
  });
});