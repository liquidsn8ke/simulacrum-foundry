import assert from 'node:assert/strict';
import { test } from 'node:test';

import { modelService } from '../../scripts/core/model-service.js';

/**
 * Regression for 0.9.0: the model list for OpenRouter sent the cache tag
 * ("openrouter:<key>") as the bearer token, OpenRouter rejected it, and the
 * sidebar's model dropdown stayed empty.
 */
test('the OpenRouter model list authenticates with the bare key', async () => {
  const settings = { provider: 'openrouter', apiKey: 'sk-or-test', model: '' };
  const previous = { game: globalThis.game, fetch: globalThis.fetch };
  const requests = [];
  globalThis.game = { settings: { get: (_scope, key) => settings[key] } };
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), headers: init?.headers ?? {} });
    return {
      ok: true,
      json: async () => ({
        data: [{ id: 'anthropic/claude-sonnet-5.5', supported_parameters: ['tools'] }],
      }),
    };
  };

  try {
    modelService.reset();
    const models = await modelService.fetchModels(true);
    assert.deepEqual(models, ['anthropic/claude-sonnet-5.5']);
    assert.equal(requests[0].headers.Authorization, 'Bearer sk-or-test');
  } finally {
    modelService.reset();
    globalThis.game = previous.game;
    globalThis.fetch = previous.fetch;
  }
});
