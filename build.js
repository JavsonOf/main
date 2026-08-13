#!/usr/bin/env node
/* =====================================================================
   build.js — inline every module into one distributable HTML file.
   ---------------------------------------------------------------------
   The modules stay the source of truth; this produces a single file that
   runs with no server, no build tooling and no network — hand someone
   isofactory.html and they have the whole game.

     node build.js [outfile]      # default: isofactory.html
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.resolve(root, process.argv[2] || 'isofactory.html');

const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

/* ---- inline the stylesheet ------------------------------------------ */
html = html.replace(
  /[ \t]*<link rel="stylesheet" href="([^"]+)"[^>]*>/,
  (_, href) => '<style>\n' + read(href).trim() + '\n</style>'
);

/* ---- inline every script, preserving load order ---------------------- */
const scripts = [];
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (_, src) => {
  scripts.push(src);
  return '';
});

const bundle = scripts
  .map(src => '/* ===== ' + src + ' ' + '='.repeat(Math.max(0, 62 - src.length)) + ' */\n' + read(src).trim())
  .join('\n\n');

/* Replacer FUNCTIONS, not strings: `$'`, `$&` and friends are special in a
   replacement string, and the bundle is full of "$" money literals — a
   string replacement here silently corrupts the output. */
html = html.replace('</body>', () => '<script>\n' + bundle + '\n</script>\n</body>');

/* ---- provenance ------------------------------------------------------ */
html = html.replace('<head>', () =>
  '<head>\n<!-- Built by build.js from the modules in js/ — do not edit by hand.\n' +
  '     Sources: ' + scripts.join(', ') + ' -->');

/* ---- guard: a literal </script> inside the JS would end the block ---- */
if (/<\/script/i.test(bundle)) {
  console.error('refusing to build: a module contains a literal </script>');
  process.exit(1);
}

fs.writeFileSync(out, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log('built ' + path.relative(root, out) + '  (' + kb + ' KB, ' +
  scripts.length + ' modules inlined)');
