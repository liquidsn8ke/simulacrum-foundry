import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { MODULE_ID } from '../../../scripts/module-id.js';

const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * The Foundry build the pf2e system this module supports requires.
 *
 * pf2e 8.4.1 (the module's declared minimum) declares `compatibility.minimum` of
 * 14.361 in its own `system.json`, so a module advertising a Foundry floor below
 * that would install on a Foundry that cannot run the system it targets.
 *
 * Bump this only together with `relationships.systems[0].compatibility` in
 * module.json - they describe the same pairing from two directions.
 */
const PF2E_FOUNDRY_FLOOR = '14.361';

/** Compare dotted Foundry version strings, which are not semver-shaped. */
function foundryVersionAtLeast(actual, required) {
  const a = String(actual).split('.').map(Number);
  const b = String(required).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

test('module manifest points to existing local entry points and assets', async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'module.json'), 'utf8'));

  assert.equal(manifest.id, MODULE_ID);
  assert.equal(manifest.socket, false);

  const system = manifest.relationships.systems[0];
  assert.equal(system.id, 'pf2e');

  // The module's own floor must be at least the floor the system it supports
  // imposes, or it will install on a Foundry version that cannot run it.
  assert.ok(
    foundryVersionAtLeast(manifest.compatibility.minimum, PF2E_FOUNDRY_FLOOR),
    `compatibility.minimum is ${manifest.compatibility.minimum} but pf2e `
      + `${system.compatibility.minimum} requires Foundry ${PF2E_FOUNDRY_FLOOR}`
  );
  assert.ok(
    foundryVersionAtLeast(manifest.compatibility.verified, manifest.compatibility.minimum),
    'verified must not be below minimum'
  );
  if (manifest.compatibility.maximum != null) {
    const { maximum, verified } = manifest.compatibility;
    assert.ok(foundryVersionAtLeast(maximum, verified), 'maximum must not be below verified');
  }

  for (const path of [
    ...manifest.esmodules,
    ...manifest.styles,
    ...manifest.languages.map(x => x.path),
  ]) {
    await access(resolve(ROOT, path));
  }
});

test('all Handlebars partial paths referenced by the module exist', async () => {
  const entry = await readFile(resolve(ROOT, 'scripts/simulacrum.js'), 'utf8');
  const paths = [...entry.matchAll(/['"](templates\/[^'"]+\.hbs)['"]/gu)].map(match => match[1]);

  for (const path of paths) await access(resolve(ROOT, path));
});
