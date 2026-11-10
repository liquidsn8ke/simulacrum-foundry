#!/usr/bin/env node

/**
 * Bundle the Anthropic TypeScript SDK into one browser ES module.
 *
 * Foundry loads module scripts straight from disk with no bundler, so the SDK's
 * package (many files, node-style resolution) is flattened here into
 * scripts/vendor/anthropic-sdk.js, which is committed and shipped. Re-run after
 * changing the pinned @anthropic-ai/sdk version in package.json:
 *
 *   npm run build:vendor
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'scripts', 'vendor');
const OUT = join(OUT_DIR, 'anthropic-sdk.js');
const SDK = join(ROOT, 'node_modules', '@anthropic-ai', 'sdk');

const version = JSON.parse(readFileSync(join(SDK, 'package.json'), 'utf8')).version;
const license = readFileSync(join(SDK, 'LICENSE'), 'utf8').trim();

mkdirSync(OUT_DIR, { recursive: true });

await build({
  stdin: {
    contents: "export { default as Anthropic } from '@anthropic-ai/sdk';",
    resolveDir: ROOT,
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  outfile: OUT,
  logLevel: 'warning',
});

const banner =
  `/*! @anthropic-ai/sdk ${version}, bundled by tools/build-vendor.mjs. Do not edit.\n` +
  `${license.replace(/\*\//g, '* /')}\n*/\n`;
writeFileSync(OUT, banner + readFileSync(OUT, 'utf8'));
writeFileSync(join(OUT_DIR, 'ANTHROPIC_SDK_VERSION'), `${version}\n`);

console.log(`[vendor] @anthropic-ai/sdk ${version} -> ${OUT}`);
