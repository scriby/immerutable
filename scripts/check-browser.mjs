import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = resolve(root, 'dist/browser-check');
mkdirSync(output, {recursive: true});
const bundled = resolve(output, 'bundle.js');
const optimized = resolve(output, 'optimized.js');
await build({
  absWorkingDir: root,
  entryPoints: ['scripts/browser-fixture.ts'],
  outfile: bundled,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2018',
  // Preserve quoted properties for Closure. Use Immer's actual production
  // module instead of leaving development-only branches for a second compiler.
  alias: {immer: resolve(dirname(require.resolve('immer/package.json')), 'dist/immer.production.mjs')},
  define: {'process.env.NODE_ENV': '"production"'},
});
const result = spawnSync(process.execPath, [
  require.resolve('google-closure-compiler/cli.js'),
  '--compilation_level=ADVANCED',
  '--language_in=ECMASCRIPT_2018',
  '--language_out=ECMASCRIPT_2018',
  '--warning_level=QUIET',
  `--js=${bundled}`,
  `--js_output_file=${optimized}`,
], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
for (const file of [bundled, optimized]) {
  // A fresh browser-like realm: no require, module, process, or Node globals.
  const context = {};
  runInNewContext(readFileSync(file, 'utf8'), context, {filename: file, timeout: 15000});
  assert.equal(context.compatibilityPassed, true);
  console.log(`${file === bundled ? 'Browser bundle' : 'Closure ADVANCED bundle'} passed`);
}
