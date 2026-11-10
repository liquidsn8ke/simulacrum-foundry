/**
 * The shipped PF2e reference stays honest.
 *
 * The agent is told to read these files before writing rule elements and fields, so a
 * file that is declared but missing, or a reference that no longer covers what the
 * builders write, sends it back to guessing — the failure the reference exists to stop.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { MODULE_ID } from '../../scripts/module-id.js';

const ROOT = resolve(import.meta.dirname, '../..');
const REFERENCE = resolve(ROOT, 'reference');
const read = name => readFileSync(resolve(REFERENCE, name), 'utf8');

test('every declared reference file exists', () => {
  // The declaration is what the probe trusts INSTEAD of guessing filenames, so a
  // name here that has no file behind it makes the source unusable while still
  // being advertised.
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'module.json'), 'utf8'));
  const declared = manifest.flags?.[MODULE_ID]?.reference ?? [];

  assert.ok(declared.length > 0, 'the reference list must not be empty');
  for (const name of declared) {
    assert.ok(
      existsSync(resolve(REFERENCE, name)),
      `module.json declares reference/${name}, which does not exist`
    );
  }
});

test('the files the system prompt and read_reference name are all declared', () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'module.json'), 'utf8'));
  const declared = new Set(manifest.flags?.[MODULE_ID]?.reference ?? []);
  const tool = readFileSync(resolve(ROOT, 'scripts/tools/read-reference.js'), 'utf8');
  // This module's reference files: pf2e-*.md and world-conventions.md.
  for (const name of tool.match(/\b(?:pf2e|world)-[a-z0-9-]+\.md/g) ?? []) {
    assert.ok(
      declared.has(name),
      `read_reference advertises ${name}, which module.json does not declare`
    );
  }
});

test('the rule-element reference covers every key the builders write', () => {
  const text = read('pf2e-rule-elements.md');
  for (const key of [
    'Aura',
    'FlatModifier',
    'Note',
    'RollOption',
    'DamageDice',
    'ActiveEffectLike',
    'GrantItem',
    'Resistance',
  ]) {
    assert.match(
      text,
      new RegExp(`### ${key}\\b`),
      `pf2e-rule-elements.md has no section for ${key}`
    );
  }
});

test('the reference describes the aura-trait pitfall the builder guards against', () => {
  // A creature trait in an Aura rule's traits invalidates the whole rule; the builder
  // offers auraTraits for this. The reference must say so, or the agent will repeat it.
  assert.match(read('pf2e-rule-elements.md'), /effect traits/);
  assert.match(read('pf2e-automation-patterns.md'), /Aura damage is not automatic/);
});

test('condition ids in the NPC reference are 16-character Foundry ids', () => {
  const text = read('pf2e-npc-fields.md');
  // The id list reads "Name <id> ·"; link examples such as {Frightened 1} are not ids.
  const ids = [...text.matchAll(/(Frightened|Grabbed|Slowed|Fascinated) ([A-Za-z0-9]+) ·/g)];
  assert.ok(ids.length >= 4);
  for (const [, , id] of ids) assert.match(id, /^[A-Za-z0-9]{16}$/);
});
