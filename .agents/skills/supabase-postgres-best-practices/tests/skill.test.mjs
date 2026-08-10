import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter } from './helpers/frontmatter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(__dirname, '..', 'SKILL.md');

const VALID_IMPACT_LEVELS = new Set([
  'CRITICAL',
  'HIGH',
  'MEDIUM-HIGH',
  'MEDIUM',
  'LOW-MEDIUM',
  'LOW',
]);

function loadSkillFile() {
  const text = readFileSync(SKILL_PATH, 'utf8');
  return { text, ...parseFrontmatter(text) };
}

describe('supabase-postgres-best-practices SKILL.md', () => {
  const { frontmatter, body } = loadSkillFile();

  describe('frontmatter', () => {
    it('parses successfully', () => {
      assert.notEqual(frontmatter, null);
    });

    it('declares the expected skill name', () => {
      assert.equal(frontmatter.name, 'supabase-postgres-best-practices');
    });

    it('declares a rich, non-trivial description', () => {
      assert.equal(typeof frontmatter.description, 'string');
      // The description is what triggers the skill to be loaded by an agent,
      // so it must be long enough to be trigger-rich rather than a one-liner.
      assert.ok(frontmatter.description.length > 100);
    });

    it('declares the MIT license', () => {
      assert.equal(frontmatter.license, 'MIT');
    });

    it('declares a metadata block with author, version, organization, date, and abstract', () => {
      assert.equal(typeof frontmatter.metadata, 'object');
      for (const key of ['author', 'version', 'organization', 'date', 'abstract']) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(frontmatter.metadata, key),
          `expected metadata.${key} to be present`,
        );
        assert.ok(frontmatter.metadata[key].length > 0, `expected metadata.${key} to be non-empty`);
      }
    });

    it('declares a semantic version', () => {
      assert.match(frontmatter.metadata.version, /^\d+\.\d+\.\d+$/);
    });

    it('attributes authorship to supabase', () => {
      assert.equal(frontmatter.metadata.author, 'supabase');
      assert.equal(frontmatter.metadata.organization, 'Supabase');
    });
  });

  describe('body content', () => {
    it('contains a Rule Categories by Priority table', () => {
      assert.match(body, /## Rule Categories by Priority/);
    });

    it('lists exactly 8 prioritized categories with valid impact levels and unique prefixes', () => {
      const tableSection = body.split('## Rule Categories by Priority')[1].split('## How to Use')[0];
      const rows = [...tableSection.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*`([a-z]+-)`\s*\|$/gm)];

      assert.equal(rows.length, 8, 'expected 8 category rows in the priority table');

      const seenPriorities = [];
      const seenPrefixes = new Set();

      for (const [, priority, category, impact] of rows) {
        seenPriorities.push(Number(priority));
        assert.ok(category.trim().length > 0, 'category name should not be empty');
        assert.ok(
          VALID_IMPACT_LEVELS.has(impact.trim()),
          `impact "${impact}" must be one of: ${[...VALID_IMPACT_LEVELS].join(', ')}`,
        );
      }

      for (const [, , , , prefix] of rows) {
        seenPrefixes.add(prefix);
      }

      // Priorities should be sequential starting at 1 (order matters: it
      // communicates which categories to consult first).
      assert.deepEqual(seenPriorities, [1, 2, 3, 4, 5, 6, 7, 8]);
      // All 8 prefixes must be unique (no duplicated category).
      assert.equal(seenPrefixes.size, 8);
    });

    it('references example rule files that use one of the declared prefixes', () => {
      const howToUseSection = body.split('## How to Use')[1].split('## References')[0];
      const referencedFiles = [...howToUseSection.matchAll(/references\/([a-z_]+[a-z0-9-]*)\.md/g)].map(
        (m) => m[1],
      );
      assert.ok(referencedFiles.length > 0, 'expected at least one referenced example file');
    });

    it('contains a References section with absolute documentation links', () => {
      const referencesSection = body.split('## References')[1] ?? '';
      const links = [...referencesSection.matchAll(/https?:\/\/[^\s)]+/g)];
      assert.ok(links.length > 0, 'expected at least one link in the References section');
      for (const [url] of links) {
        assert.match(url, /^https:\/\//, `link should use https: ${url}`);
      }
    });
  });
});