import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AIClient, PROVIDERS } from '../../scripts/core/ai-client.js';

/** A stand-in for the SDK client: records the body, returns a canned message. */
function fakeAnthropic(respond) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(body, options) {
          calls.push({ body, options });
          return { finalMessage: async () => respond(body) };
        },
      },
    },
  };
}

function client(fake) {
  const c = new AIClient({
    provider: PROVIDERS.ANTHROPIC,
    apiKey: 'sk-test',
    model: 'claude-opus-5-5',
  });
  c._anthropic = fake;
  c._applyRequestDelay = async () => {};
  c._getRequestTimeoutMs = () => 1000;
  return c;
}

test('chat sends a translated request and returns the OpenAI-style shape', async () => {
  const fake = fakeAnthropic(() => ({
    id: 'msg_1',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 3, output_tokens: 2 },
    content: [{ type: 'text', text: 'Hello.' }],
  }));
  const raw = await client(fake).chatWithSystem([{ role: 'user', content: 'hi' }], () => 'SYS', [
    {
      type: 'function',
      function: { name: 'end_loop', parameters: { type: 'object', properties: {} } },
    },
  ]);

  const { body, options } = fake.calls[0];
  assert.equal(body.system[0].text, 'SYS');
  assert.equal(body.tools[0].name, 'end_loop');
  assert.equal(options.timeout, 1000);
  assert.equal(raw.choices[0].message.content, 'Hello.');
});

test('an API error surfaces as an APIError carrying the status', async () => {
  const fake = fakeAnthropic(() => {
    const error = new Error('bad key');
    error.status = 401;
    throw error;
  });
  await assert.rejects(client(fake).chat([{ role: 'user', content: 'x' }]), /401 - bad key/);
});

test('a cancelled request surfaces as an abort, not an API error', async () => {
  const controller = new AbortController();
  controller.abort();
  const fake = fakeAnthropic(() => {
    const error = new Error('aborted');
    error.name = 'APIUserAbortError';
    throw error;
  });
  await assert.rejects(
    client(fake).chat([{ role: 'user', content: 'x' }], null, { signal: controller.signal }),
    error => /abort|cancel/i.test(`${error.name} ${error.message}`)
  );
});

test('a missing key is reported before any request', async () => {
  const c = new AIClient({ provider: PROVIDERS.ANTHROPIC, apiKey: '' });
  c._applyRequestDelay = async () => {};
  await assert.rejects(c.chat([{ role: 'user', content: 'x' }]), /No Anthropic API key/);
});
