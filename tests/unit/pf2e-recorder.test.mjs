import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MODULE_ID } from '../../scripts/module-id.js';
import { describeMessage, trackedSubject } from '../../scripts/core/pf2e/roll-recorder.js';
import { buildModuleReport } from '../../scripts/core/system-prompt-builder.js';

const pending = { status: 'pending', runs: [] };
const doc = (name, flags = {}) => ({ name, flags, getFlag: (scope, key) => flags?.[scope]?.[key] });

test('a message from a tracked item is attributed to the item', () => {
  const item = doc('Festival of Infestation', { [MODULE_ID]: { verification: pending } });
  assert.equal(trackedSubject({ item, actor: doc('Swarm') }), item);
});

test('a message about a tracked actor is attributed to the actor when its item is not tracked', () => {
  const actor = doc('Eshmok Swarm', { [MODULE_ID]: { verification: pending } });
  assert.equal(trackedSubject({ item: doc('Fist'), actor }), actor);
  assert.equal(trackedSubject({ item: doc('Fist'), actor: doc('Goblin') }), null);
});

test('a recorded run keeps the pf2e roll context, the dice and the useful roll options', () => {
  const run = describeMessage(
    {
      flavor: '<b>Reflex Save</b>',
      content: '',
      actor: { name: 'Eshmok Swarm' },
      flags: {
        pf2e: {
          context: {
            type: 'saving-throw',
            outcome: 'failure',
            dc: { value: 34 },
            domains: ['reflex', 'saving-throw'],
            notes: [{ title: 'Serenity Vulnerability' }],
            options: [
              'inflicts:slowed',
              'self:type:npc',
              'item:trait:arcane',
              'some:long:noise:option',
            ],
          },
        },
      },
      rolls: [
        {
          formula: '1d20 + 27',
          total: 30,
          options: { degreeOfSuccess: 1 },
          dice: [{ faces: 20, results: [{ result: 3 }] }],
        },
      ],
    },
    { name: 'Eshmok Swarm' }
  );
  assert.equal(run.context.type, 'saving-throw');
  assert.equal(run.context.outcome, 'failure');
  assert.equal(run.context.dc, 34);
  assert.deepEqual(run.context.notes, ['Serenity Vulnerability']);
  assert.ok(run.context.options.includes('inflicts:slowed'));
  assert.ok(!run.context.options.includes('some:long:noise:option'));
  assert.deepEqual(run.rolls[0].dice, [{ faces: 20, results: [3] }]);
  assert.equal(run.flavor, 'Reflex Save');
});

test('the world report lists the system, active modules and inactive ones separately', () => {
  const modules = new Map([
    ['pf2e-toolbelt', { id: 'pf2e-toolbelt', version: '3.60.0', active: true }],
    ['pf2e-troops-helper', { id: 'pf2e-troops-helper', active: false }],
    [MODULE_ID, { id: MODULE_ID, active: true }],
  ]);
  const report = buildModuleReport({
    system: { id: 'pf2e', version: '8.7.0' },
    version: '14.369',
    modules,
  });
  assert.match(report, /Game system: pf2e 8\.7\.0/);
  assert.match(report, /ACTIVE MODULES \(1\)[^\n]*\npf2e-toolbelt@3\.60\.0/);
  assert.match(report, /INACTIVE \(1\)[^\n]*\npf2e-troops-helper/);
  assert.ok(!report.includes(`${MODULE_ID}@`), 'the module does not list itself');
});
