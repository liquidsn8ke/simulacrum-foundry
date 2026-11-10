// SPDX-License-Identifier: MIT

/**
 * The package id of this module. Everything Foundry keys by package id (settings namespace,
 * document flag scope, `game.modules`, `modules/<id>/` asset paths, the memory folder) reads it
 * from here, so a rename touches one line. UI names (the sidebar tab, CSS classes, hook names)
 * keep the "simulacrum" brand and do not depend on it.
 */
export const MODULE_ID = 'simulacrum-pf2e';

/** Route of this module's files, relative to the Foundry data root. */
export const MODULE_PATH = `modules/${MODULE_ID}`;
