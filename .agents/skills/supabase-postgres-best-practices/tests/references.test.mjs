import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter } from './helpers/frontmatter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENCES_DIR = join(__dirname, '..', 'references');

const VALID_IMPACT_LEVELS = new Set([
  'CRITICAL',
  'HIGH',
  'MEDIUM-HIGH',
  'MEDIUM',
  'LOW-MEDIUM',
  'LOW',
]);

// Rule files added/changed by this PR (excludes the underscore-prefixed
// authoring docs, which have their own dedicated test file, and excludes
// pre-existing reference files not touched by this PR).
const RULE_FILES = [
  'advanced-full-text-search.md',
  'advanced-jsonb-indexing.md',
  'conn-idle-timeout.md',
  'conn-limits.md',
  'conn-pooling.md',
  'conn-prepared-statements.md',
  'data-batch-inserts.md',
  'data-n-plus-one.md',
  'data-pagination.md',
  'data-upsert.md',
  'lock-advisory.md',
  'lock-deadlock-prevention.md',
  'lock-short-transactions.md',
  'lock-skip-locked.md',
  'monitor-explain-analyze.md',
  'monitor-pg-stat-statements.md',
  'monitor-vacuum-analyze.md',
  'query-composite-indexes.md',
  'query-covering-indexes.md',
  'query-index-types.md',
];

// Category prefixes declared in SKILL.md's "Rule Categories by Priority" table.
const KNOWN_PREFIXES = ['query', 'conn', 'security', 'schema', 'lock', 'data', 'monitor', 'advanced'];

function loadRuleFile(filename) {
  const path = join(REFERENCES_DIR, filename);
  const text = readFileSync(path, 'utf8');
  return { path, text, ...parseFrontmatter(text) };
}

describe('supabase-postgres-best-practices rule files', () => {
  it('this test file is in sync with the files present on disk', () => {
    const actualFiles = readdirSync(REFERENCES_DIR)
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'));

    for (const file of RULE_FILES) {
      assert.ok(
        actualFiles.includes(file),
        `expected ${file} to exist in references/ but it was not found`,
      );
    }
  });

  for (const filename of RULE_FILES) {
    describe(filename, () => {
      const { text, frontmatter, body } = loadRuleFile(filename);

      it('has parseable YAML frontmatter delimited by ---', () => {
        assert.notEqual(frontmatter, null, 'expected file to start with a --- frontmatter block');
      });

      it('declares a non-empty title', () => {
        assert.equal(typeof frontmatter.title, 'string');
        assert.ok(frontmatter.title.trim().length > 0);
      });

      it('declares a valid impact level', () => {
        assert.ok(
          VALID_IMPACT_LEVELS.has(frontmatter.impact),
          `impact "${frontmatter.impact}" must be one of: ${[...VALID_IMPACT_LEVELS].join(', ')}`,
        );
      });

      it('declares a non-empty impactDescription', () => {
        assert.equal(typeof frontmatter.impactDescription, 'string');
        assert.ok(frontmatter.impactDescription.trim().length > 0);
      });

      it('declares at least one tag', () => {
        assert.equal(typeof frontmatter.tags, 'string');
        const tags = frontmatter.tags.split(',').map((t) => t.trim()).filter(Boolean);
        assert.ok(tags.length >= 1, 'expected at least one comma-separated tag');
      });

      it('has a filename prefix matching a category declared in SKILL.md', () => {
        const prefix = filename.split('-')[0];
        assert.ok(
          KNOWN_PREFIXES.includes(prefix),
          `filename prefix "${prefix}" is not one of the known categories: ${KNOWN_PREFIXES.join(', ')}`,
        );
      });

      it('contains an H2 heading', () => {
        assert.match(body, /^##\s+.+$/m);
      });

      it('the H2 heading matches the frontmatter title', () => {
        const headingMatch = body.match(/^##\s+(.+)$/m);
        assert.ok(headingMatch, 'expected to find an H2 heading');
        assert.equal(headingMatch[1].trim(), frontmatter.title);
      });

      it('contains at least one Incorrect example before a Correct example', () => {
        const incorrectIndex = body.indexOf('**Incorrect');
        const correctIndex = body.indexOf('**Correct');
        assert.notEqual(incorrectIndex, -1, 'expected an "**Incorrect" example section');
        assert.notEqual(correctIndex, -1, 'expected a "**Correct" example section');
        assert.ok(
          incorrectIndex < correctIndex,
          'the Incorrect example should be shown before the Correct example',
        );
      });

      it('contains at least one fenced code block', () => {
        const codeBlocks = body.match(/```[a-z]*\n[\s\S]*?```/g) ?? [];
        assert.ok(codeBlocks.length >= 2, 'expected at least one Incorrect and one Correct code block');
      });

      it('ends with a Reference link', () => {
        assert.match(body, /Reference:\s*\n*\s*\[[^\]]+\]\(https?:\/\/[^\s)]+\)/);
      });

      it('does not contain unresolved template placeholders', () => {
        assert.doesNotMatch(text, /\[Rule Title\]|\[Optional:/);
      });
    });
  }
});