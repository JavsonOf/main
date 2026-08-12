import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter } from './frontmatter.mjs';

describe('parseFrontmatter', () => {
  it('parses flat key/value frontmatter used by reference files', () => {
    const text = [
      '---',
      'title: Use Partial Indexes for Filtered Queries',
      'impact: HIGH',
      'impactDescription: 5-20x smaller indexes, faster writes and queries',
      'tags: indexes, partial-index, query-optimization, storage',
      '---',
      '',
      '## Use Partial Indexes for Filtered Queries',
      '',
      'Body text.',
    ].join('\n');

    const { frontmatter, body } = parseFrontmatter(text);

    assert.deepEqual(frontmatter, {
      title: 'Use Partial Indexes for Filtered Queries',
      impact: 'HIGH',
      impactDescription: '5-20x smaller indexes, faster writes and queries',
      tags: 'indexes, partial-index, query-optimization, storage',
    });
    assert.equal(body, '\n## Use Partial Indexes for Filtered Queries\n\nBody text.');
  });

  it('parses nested metadata blocks (as used in SKILL.md)', () => {
    const text = [
      '---',
      'name: supabase-postgres-best-practices',
      'license: MIT',
      'metadata:',
      '  author: supabase',
      '  version: "1.1.1"',
      '  organization: Supabase',
      '---',
      '# Title',
    ].join('\n');

    const { frontmatter } = parseFrontmatter(text);

    assert.equal(frontmatter.name, 'supabase-postgres-best-practices');
    assert.equal(frontmatter.license, 'MIT');
    assert.deepEqual(frontmatter.metadata, {
      author: 'supabase',
      version: '1.1.1',
      organization: 'Supabase',
    });
  });

  it('strips both double and single quotes from scalar values', () => {
    const text = ['---', 'a: "double quoted"', "b: 'single quoted'", 'c: unquoted', '---', ''].join('\n');

    const { frontmatter } = parseFrontmatter(text);

    assert.equal(frontmatter.a, 'double quoted');
    assert.equal(frontmatter.b, 'single quoted');
    assert.equal(frontmatter.c, 'unquoted');
  });

  it('tolerates colons inside quoted description values (e.g. URLs, clauses)', () => {
    const text = [
      '---',
      'description: "Load this skill BEFORE writing SQL: see https://example.com/docs for details."',
      '---',
      '',
    ].join('\n');

    const { frontmatter } = parseFrontmatter(text);

    assert.equal(
      frontmatter.description,
      'Load this skill BEFORE writing SQL: see https://example.com/docs for details.',
    );
  });

  it('returns a null frontmatter and the original text as body when no frontmatter block exists', () => {
    const text = '# Just a heading\n\nNo frontmatter here.';

    const { frontmatter, body, raw } = parseFrontmatter(text);

    assert.equal(frontmatter, null);
    assert.equal(raw, null);
    assert.equal(body, text);
  });

  it('does not treat a --- that is not at the very start of the file as frontmatter', () => {
    const text = 'Some intro text\n---\ntitle: not frontmatter\n---\n';

    const { frontmatter } = parseFrontmatter(text);

    assert.equal(frontmatter, null);
  });
});