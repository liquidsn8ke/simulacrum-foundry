import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  toAnthropicMessages,
  toAnthropicTools,
  buildAnthropicRequest,
  fromAnthropicResponse,
  DEFAULT_ANTHROPIC_MODEL,
  THINKING_BINDING_BETA,
  FALLBACK_BETA,
} from '../../scripts/core/anthropic-adapter.js';

const toolCall = (id, name, args) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

test('the first system message becomes the system prompt; later ones become user notes', () => {
  const { system, messages } = toAnthropicMessages([
    { role: 'system', content: 'You build PF2e creatures.' },
    { role: 'user', content: 'Make a goblin.' },
    { role: 'assistant', content: 'Done.' },
    { role: 'developer', content: 'Call end_loop.' },
  ]);
  assert.equal(system, 'You build PF2e creatures.');
  assert.deepEqual(
    messages.map(m => m.role),
    ['user', 'assistant', 'user']
  );
  assert.match(messages[2].content[0].text, /^\[Harness note\] Call end_loop\./);
});

test('tool calls and results translate to tool_use / tool_result with matching ids', () => {
  const { messages } = toAnthropicMessages([
    { role: 'user', content: 'Look up Fireball.' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [toolCall('toolu_1', 'lookup', { name: 'Fireball' })],
    },
    { role: 'tool', content: '{"uuid":"x"}', tool_call_id: 'toolu_1' },
  ]);
  const use = messages[1].content.find(b => b.type === 'tool_use');
  assert.deepEqual(use, {
    type: 'tool_use',
    id: 'toolu_1',
    name: 'lookup',
    input: { name: 'Fireball' },
  });
  assert.deepEqual(messages[2].content[0], {
    type: 'tool_result',
    tool_use_id: 'toolu_1',
    content: '{"uuid":"x"}',
  });
});

test('tool results lead their user turn even when a note was added after them', () => {
  const { messages } = toAnthropicMessages([
    { role: 'user', content: 'go' },
    { role: 'assistant', content: '', tool_calls: [toolCall('a', 't', {})] },
    { role: 'developer', content: 'note before result' },
    { role: 'tool', content: 'ok', tool_call_id: 'a' },
  ]);
  const last = messages[messages.length - 1];
  assert.equal(last.content[0].type, 'tool_result');
  assert.equal(last.content[1].type, 'text');
});

test('stored Claude blocks (with reasoning) are replayed verbatim', () => {
  const original = [
    { type: 'thinking', thinking: '', signature: 'sig-abc' },
    { type: 'text', text: 'Looking it up.' },
    { type: 'tool_use', id: 'toolu_9', name: 'lookup', input: { name: 'Haste' } },
  ];
  const { messages } = toAnthropicMessages([
    { role: 'user', content: 'Haste?' },
    {
      role: 'assistant',
      content: 'Looking it up.',
      tool_calls: [toolCall('toolu_9', 'lookup', { name: 'Haste' })],
      provider_metadata: { original_response: { anthropic: { id: 'msg_1', content: original } } },
    },
    { role: 'tool', content: 'found', tool_call_id: 'toolu_9' },
  ]);
  assert.deepEqual(messages[1].content, original);
});

test('stored blocks are not replayed when they no longer match the tool calls, or twice', () => {
  const stored = {
    original_response: {
      anthropic: {
        id: 'msg_dup',
        content: [
          { type: 'thinking', thinking: '', signature: 's' },
          { type: 'text', text: 'hi' },
        ],
      },
    },
  };
  const { messages } = toAnthropicMessages([
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'hi', provider_metadata: stored },
    { role: 'user', content: 'b' },
    { role: 'assistant', content: 'hi again', provider_metadata: stored },
  ]);
  assert.equal(messages[1].content[0].type, 'thinking', 'first use replays the original');
  assert.deepEqual(
    messages[3].content,
    [{ type: 'text', text: 'hi again' }],
    'a repeat is rebuilt'
  );
});

test('the conversation starts and ends on a user turn', () => {
  const { messages } = toAnthropicMessages([{ role: 'assistant', content: 'Welcome!' }]);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[messages.length - 1].role, 'user');
});

test('OpenAI function tools become Claude tools with an object schema', () => {
  const tools = toAnthropicTools([
    {
      type: 'function',
      function: {
        name: 'a',
        description: 'A',
        parameters: { type: 'object', properties: { x: { type: 'string' } } },
      },
    },
    { type: 'function', function: { name: 'b' } },
  ]);
  assert.equal(tools[0].input_schema.properties.x.type, 'string');
  assert.deepEqual(tools[1].input_schema, { type: 'object', properties: {} });
  assert.ok(tools.every(t => t.eager_input_streaming === true));
});

test('a modern model request asks for drop_block, effort, caching and the refusal fallback', () => {
  const body = buildAnthropicRequest({
    model: 'claude-opus-5-5',
    messages: [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'hi' },
    ],
    effort: 'xhigh',
  });
  assert.deepEqual(body.thinking, {
    type: 'adaptive',
    block_binding: { prefix_mismatch_behavior: 'drop_block' },
  });
  assert.deepEqual(body.output_config, { effort: 'xhigh' });
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(body.betas.sort(), [FALLBACK_BETA, THINKING_BINDING_BETA].sort());
  assert.deepEqual(body.cache_control, { type: 'ephemeral' });
  assert.equal(body.system[0].cache_control.type, 'ephemeral');
  assert.equal('temperature' in body, false, 'sampling parameters are not sent');
});

test('an older model gets a plain request; no model means the default', () => {
  const old = buildAnthropicRequest({
    model: 'claude-haiku-4-5',
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.equal(old.thinking, undefined);
  assert.equal(old.output_config, undefined);
  assert.equal(old.betas, undefined);
  const fallback = buildAnthropicRequest({ messages: [{ role: 'user', content: 'x' }] });
  assert.equal(fallback.model, DEFAULT_ANTHROPIC_MODEL);
});

test('a response becomes text plus tool calls, keeping the raw blocks for replay', () => {
  const message = {
    id: 'msg_2',
    model: 'claude-opus-5-5',
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 },
    content: [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: 'Building.' },
      { type: 'tool_use', id: 'toolu_3', name: 'build_creature', input: { name: 'Goblin' } },
    ],
  };
  const raw = fromAnthropicResponse(message);
  const out = raw.choices[0].message;
  assert.equal(out.content, 'Building.');
  assert.equal(out.tool_calls[0].function.name, 'build_creature');
  assert.deepEqual(JSON.parse(out.tool_calls[0].function.arguments), { name: 'Goblin' });
  assert.equal(raw.usage.prompt_tokens, 100);
  assert.deepEqual(raw._originalResponse.anthropic.content, message.content);
});

test('tool calls from a cut-off or refused turn are never run', () => {
  const cut = fromAnthropicResponse({
    stop_reason: 'max_tokens',
    content: [{ type: 'tool_use', id: 't', name: 'x', input: { partial: true } }],
  });
  assert.deepEqual(cut.choices[0].message.tool_calls, []);
  assert.match(cut.choices[0].message.content, /output limit/);

  const refused = fromAnthropicResponse({
    stop_reason: 'refusal',
    stop_details: { category: 'cyber' },
    content: [],
  });
  assert.match(refused.choices[0].message.content, /declined.*cyber/);
});
