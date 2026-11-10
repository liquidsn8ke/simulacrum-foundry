// SPDX-License-Identifier: MIT

/**
 * The AI provider configuration, read from module settings in one place so the
 * client, the model list and the endpoint check cannot disagree.
 */

import { MODULE_ID } from '../module-id.js';
import { PROVIDERS } from './ai-client.js';
import { DEFAULT_ANTHROPIC_MODEL } from './anthropic-adapter.js';

/**
 * Read a setting, tolerating an unregistered key (early init, tests).
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function setting(key, fallback) {
  try {
    const value = game?.settings?.get(MODULE_ID, key);
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

/**
 * @returns {{provider: string, apiKey: string, model: string, effort: string, refusalFallback: boolean}}
 */
export function getAIConfig() {
  const provider = setting('provider', PROVIDERS.ANTHROPIC);
  const anthropic = provider === PROVIDERS.ANTHROPIC;
  const apiKey = String(setting(anthropic ? 'anthropicApiKey' : 'apiKey', '') || '').trim();
  const configuredModel = String(setting('model', '') || '').trim();
  return {
    provider,
    apiKey,
    // A model left over from OpenRouter ("anthropic/claude-...") is not an Anthropic id.
    model:
      anthropic && (!configuredModel || configuredModel.includes('/'))
        ? DEFAULT_ANTHROPIC_MODEL
        : configuredModel,
    effort: setting('effort', 'high'),
    refusalFallback: setting('refusalFallback', true) !== false,
  };
}
