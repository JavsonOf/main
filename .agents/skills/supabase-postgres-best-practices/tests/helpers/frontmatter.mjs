// Minimal frontmatter parser for the skill's Markdown files.
//
// This intentionally does NOT depend on a YAML library (none is available in
// this repository) and only supports the small subset of YAML actually used
// by SKILL.md and the reference files: flat `key: value` pairs, one level of
// nested `key:` blocks (used by SKILL.md's `metadata:` block), and quoted
// string values.

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Splits a Markdown file's raw text into its frontmatter object and body.
 *
 * @param {string} text Raw file contents.
 * @returns {{ frontmatter: Record<string, unknown> | null, body: string, raw: string | null }}
 */
export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: null, body: text, raw: null };
  }

  const raw = match[1];
  const body = text.slice(match[0].length);
  const lines = raw.split(/\r?\n/);

  const frontmatter = {};
  let currentParentKey = null;

  for (const line of lines) {
    if (line.trim() === '') continue;

    const nestedMatch = line.match(/^ {2,}([A-Za-z0-9_-]+):\s*(.*)$/);
    const topLevelMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (nestedMatch && currentParentKey) {
      if (
        typeof frontmatter[currentParentKey] !== 'object' ||
        frontmatter[currentParentKey] === null
      ) {
        frontmatter[currentParentKey] = {};
      }
      frontmatter[currentParentKey][nestedMatch[1]] = stripQuotes(nestedMatch[2]);
      continue;
    }

    if (topLevelMatch) {
      const [, key, value] = topLevelMatch;
      currentParentKey = key;
      frontmatter[key] = value === '' ? {} : stripQuotes(value);
    }
  }

  return { frontmatter, body, raw };
}