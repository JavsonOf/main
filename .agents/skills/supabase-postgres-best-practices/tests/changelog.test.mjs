import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANGELOG_PATH = join(__dirname, '..', 'CHANGELOG.md');

function loadChangelog() {
  return readFileSync(CHANGELOG_PATH, 'utf8');
}

function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

describe('supabase-postgres-best-practices CHANGELOG.md', () => {
  const text = loadChangelog();

  it('starts with a Changelog heading', () => {
    assert.match(text, /^# Changelog\r?\n/);
  });

  it('contains at least one version entry', () => {
    const versionHeadings = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\]\(([^)]+)\)\s*\((\d{4}-\d{2}-\d{2})\)/gm)];
    assert.ok(versionHeadings.length > 0, 'expected at least one "## [x.y.z](url) (date)" heading');
  });

  it('lists version entries in strictly descending order (newest first)', () => {
    const versions = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]);
    for (let i = 1; i < versions.length; i++) {
      assert.ok(
        compareSemver(versions[i - 1], versions[i]) > 0,
        `expected ${versions[i - 1]} to be newer than ${versions[i]}`,
      );
    }
  });

  it('links each version heading to a supabase/agent-skills compare URL', () => {
    const links = [...text.matchAll(/^## \[\d+\.\d+\.\d+\]\((https:\/\/github\.com\/supabase\/agent-skills\/compare\/[^)]+)\)/gm)];
    const headings = [...text.matchAll(/^## \[\d+\.\d+\.\d+\]/gm)];
    assert.equal(links.length, headings.length, 'every version heading should link to a compare URL on github.com/supabase/agent-skills');
  });

  it('contains conventional-commit style Features and/or Bug Fixes sections', () => {
    assert.ok(/^### Features$/m.test(text) || /^### Bug Fixes$/m.test(text));
  });

  it('references issues and commits using valid github.com/supabase/agent-skills URLs', () => {
    const issueLinks = [...text.matchAll(/\(https:\/\/github\.com\/supabase\/agent-skills\/issues\/\d+\)/g)];
    const commitLinks = [...text.matchAll(/\(https:\/\/github\.com\/supabase\/agent-skills\/commit\/[0-9a-f]+\)/g)];
    assert.ok(issueLinks.length > 0, 'expected at least one issue link');
    assert.ok(commitLinks.length > 0, 'expected at least one commit link');
  });
});