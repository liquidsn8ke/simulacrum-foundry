// SPDX-License-Identifier: MIT
/* eslint-disable complexity, max-lines-per-function -- data mapping: each optional stat-block field is a `??` default or a guard, which the complexity rule counts as a branch. Splitting would scatter one mapping across many functions. */

/**
 * Anthropic adapter: translation between the harness's OpenAI-style conversation
 * and the Claude Messages API, plus the request parameters this module sends.
 *
 * The rest of the harness (tool loop, corrections, persistence, UI) speaks the
 * OpenAI chat shape: `system | developer | user | assistant | tool` roles,
 * `tool_calls` on assistant messages and `tool_call_id` on tool results. Rather
 * than rewrite it, the provider translates at the edge, both ways.
 *
 * The one thing translation must not lose is Claude's own content blocks. Its
 * reasoning arrives as `thinking` blocks that have to be sent back unchanged in
 * later requests, and a block rebuilt from text is not the same block. So the
 * raw blocks of every response ride along on the stored message in
 * `provider_metadata.original_response.anthropic`, and an assistant turn is
 * replayed from them verbatim whenever they still match the stored tool calls.
 *
 * The harness also edits its history (corrections, compaction, rewind, a system
 * prompt rebuilt per request). Every request therefore asks the API to drop any
 * reasoning block whose history changed (`prefix_mismatch_behavior: drop_block`)
 * instead of rejecting the request; see buildAnthropicRequest.
 *
 * Pure functions only: no Foundry globals, no network. Tested in
 * tests/unit/anthropic-adapter.test.mjs.
 */

/** Default model when none is configured. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/** Output cap per request. Requests stream, so a large cap cannot time out. */
export const DEFAULT_MAX_TOKENS = 64000;

/** Effort levels the API accepts. */
export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

/** Beta that lets a request ask for stale reasoning blocks to be dropped. */
export const THINKING_BINDING_BETA = 'thinking-binding-controls-2026-08-01';

/** Beta for server-side refusal fallbacks (`fallbacks: "default"`). */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Models that take adaptive thinking, `output_config.effort` and the
 * `block_binding` object. Older models get a plain request.
 */
const MODERN_MODEL = /^claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[6-9]|sonnet-4-6)/;

/** Models that accept server-side `fallbacks: "default"`. */
const FALLBACK_MODEL = /^claude-(fable-5-[12]|opus-5|sonnet-5-5)/;

/**
 * @param {string} model
 * @returns {boolean} Whether the model takes adaptive thinking and effort.
 */
export function isModernModel(model) {
  return MODERN_MODEL.test(String(model || ''));
}

/**
 * @param {string} model
 * @returns {boolean} Whether server-side refusal fallbacks may be requested.
 */
export function supportsFallbacks(model) {
  return FALLBACK_MODEL.test(String(model || ''));
}

/**
 * The raw Claude blocks stored with an assistant message, if any.
 * @param {object} message
 * @returns {{id?: string, content: object[]}|null}
 */
function storedAnthropic(message) {
  const meta = message?.provider_metadata;
  const anthropic = meta?.original_response?.anthropic ?? meta?.anthropic ?? null;
  return anthropic && Array.isArray(anthropic.content) ? anthropic : null;
}

/** Parse tool-call arguments, which the harness stores as a JSON string. */
function parseArguments(args) {
  if (args && typeof args === 'object') return args;
  if (typeof args !== 'string' || !args.trim()) return {};
  try {
    const parsed = JSON.parse(args);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : { value: parsed };
  } catch {
    return { _unparsed: args };
  }
}

/** Plain text of an OpenAI-style content field. */
function textOf(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part === 'string' ? part : (part?.text ?? '')))
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(content);
}

/**
 * Assistant blocks rebuilt from text and tool calls (no reasoning).
 * @param {object} message
 * @returns {object[]}
 */
function rebuildAssistantBlocks(message) {
  const blocks = [];
  const text = textOf(message.content).trim();
  if (text) blocks.push({ type: 'text', text });
  for (const call of message.tool_calls ?? []) {
    const fn = call.function ?? {};
    blocks.push({
      type: 'tool_use',
      id: call.id,
      name: fn.name ?? call.name,
      input: parseArguments(fn.arguments ?? call.arguments),
    });
  }
  return blocks;
}

/**
 * The blocks to send for an assistant message: the stored originals when they
 * still describe this message's tool calls and have not been sent already,
 * otherwise a rebuild from text and tool calls.
 * @param {object} message
 * @param {Set<string>} usedResponseIds - Response ids already replayed
 * @returns {object[]}
 */
function assistantBlocks(message, usedResponseIds) {
  const stored = storedAnthropic(message);
  if (stored) {
    const storedToolIds = stored.content.filter(b => b?.type === 'tool_use').map(b => b.id);
    const callIds = (message.tool_calls ?? []).map(c => c.id);
    const sameCalls =
      storedToolIds.length === callIds.length && storedToolIds.every(id => callIds.includes(id));
    const fresh = !stored.id || !usedResponseIds.has(stored.id);
    if (sameCalls && fresh) {
      if (stored.id) usedResponseIds.add(stored.id);
      return stored.content.map(block => ({ ...block }));
    }
  }
  return rebuildAssistantBlocks(message);
}

/**
 * Append blocks to the output, merging into the previous message when the role
 * repeats (the API needs user/assistant turns to alternate).
 */
function pushBlocks(out, role, blocks) {
  if (!blocks.length) return;
  const last = out[out.length - 1];
  if (last && last.role === role) {
    last.content.push(...blocks);
  } else {
    out.push({ role, content: [...blocks] });
  }
}

/**
 * Translate a harness conversation into Claude's `system` and `messages`.
 *
 * - The first `system` message becomes the top-level system prompt. Later
 *   `system` / `developer` messages (harness corrections) become user text.
 * - `tool` results become `tool_result` blocks in a user turn, placed before
 *   any text in that turn, as the API requires.
 * - Assistant turns replay their stored blocks where possible.
 * - The conversation always starts and ends on a user turn.
 *
 * @param {Array<object>} messages - Harness messages, system prompt first
 * @returns {{system: string, messages: Array<{role: string, content: object[]}>}}
 */
export function toAnthropicMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let system = '';
  let start = 0;
  if (list[0]?.role === 'system') {
    system = textOf(list[0].content);
    start = 1;
  }

  const out = [];
  const usedResponseIds = new Set();

  for (const message of list.slice(start)) {
    switch (message?.role) {
      case 'assistant':
        pushBlocks(out, 'assistant', assistantBlocks(message, usedResponseIds));
        break;
      case 'tool':
        pushBlocks(out, 'user', [
          {
            type: 'tool_result',
            tool_use_id: message.tool_call_id,
            content: textOf(message.content) || '(no output)',
          },
        ]);
        break;
      case 'system':
      case 'developer': {
        const text = textOf(message.content).trim();
        if (text) pushBlocks(out, 'user', [{ type: 'text', text: `[Harness note] ${text}` }]);
        break;
      }
      case 'user':
      default: {
        const text = textOf(message?.content).trim();
        if (text) pushBlocks(out, 'user', [{ type: 'text', text }]);
        break;
      }
    }
  }

  // Tool results must lead their user turn.
  for (const message of out) {
    if (message.role !== 'user') continue;
    const results = message.content.filter(b => b.type === 'tool_result');
    if (results.length && results.length !== message.content.length) {
      message.content = [...results, ...message.content.filter(b => b.type !== 'tool_result')];
    }
  }

  if (out[0]?.role === 'assistant') {
    out.unshift({ role: 'user', content: [{ type: 'text', text: '(Conversation start.)' }] });
  }
  // The API rejects a conversation that ends on an assistant turn (no prefill).
  if (out.length === 0 || out[out.length - 1].role === 'assistant') {
    out.push({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] });
  }

  return { system, messages: out };
}

/**
 * Translate OpenAI-style function tools into Claude tool definitions.
 * @param {Array<object>|null} tools
 * @returns {Array<object>}
 */
export function toAnthropicTools(tools) {
  if (!Array.isArray(tools)) return [];
  return tools
    .map(tool => {
      const fn = tool?.function ?? tool;
      if (!fn?.name) return null;
      const schema =
        fn.parameters && typeof fn.parameters === 'object'
          ? fn.parameters
          : { type: 'object', properties: {} };
      return {
        name: fn.name,
        description: fn.description ?? '',
        input_schema: schema.type === 'object' ? schema : { type: 'object', properties: {} },
        // Stream tool input as it is generated; a truncated input is never run
        // (see fromAnthropicResponse).
        eager_input_streaming: true,
      };
    })
    .filter(Boolean);
}

/**
 * Build the request body for `client.beta.messages.stream`.
 * @param {object} options
 * @param {string} options.model
 * @param {Array<object>} options.messages - Harness messages, system first
 * @param {Array<object>|null} [options.tools] - OpenAI-style tools
 * @param {string} [options.effort] - One of EFFORT_LEVELS
 * @param {boolean} [options.refusalFallback=true]
 * @param {number} [options.maxTokens]
 * @returns {object}
 */
export function buildAnthropicRequest({
  model,
  messages,
  tools = null,
  effort = 'high',
  refusalFallback = true,
  maxTokens = DEFAULT_MAX_TOKENS,
}) {
  const resolvedModel = model || DEFAULT_ANTHROPIC_MODEL;
  const converted = toAnthropicMessages(messages);
  const anthropicTools = toAnthropicTools(tools);
  const modern = isModernModel(resolvedModel);
  const betas = [];

  const body = {
    model: resolvedModel,
    max_tokens: maxTokens,
    messages: converted.messages,
    // Automatic caching of the growing conversation; the system block below
    // carries its own breakpoint so tools + system stay cached across turns.
    cache_control: { type: 'ephemeral' },
  };

  if (converted.system) {
    body.system = [{ type: 'text', text: converted.system, cache_control: { type: 'ephemeral' } }];
  }
  if (anthropicTools.length) body.tools = anthropicTools;

  if (modern) {
    body.thinking = {
      type: 'adaptive',
      // Drop reasoning whose history the harness changed, instead of a 400.
      block_binding: { prefix_mismatch_behavior: 'drop_block' },
    };
    betas.push(THINKING_BINDING_BETA);
    body.output_config = { effort: EFFORT_LEVELS.includes(effort) ? effort : 'high' };
  }

  if (refusalFallback && supportsFallbacks(resolvedModel)) {
    body.fallbacks = 'default';
    betas.push(FALLBACK_BETA);
  }

  if (betas.length) body.betas = betas;
  return body;
}

/**
 * Translate a Claude message into the OpenAI-style raw response the harness
 * normalizes, keeping the original blocks for replay.
 *
 * Tool calls are dropped when the turn was cut off (`max_tokens`) or refused,
 * because their input may be incomplete.
 *
 * @param {object} message - Final message from the stream
 * @returns {object}
 */
export function fromAnthropicResponse(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  const stop = message?.stop_reason ?? null;
  const text = content
    .filter(b => b?.type === 'text')
    .map(b => b.text)
    .join('\n\n')
    .trim();

  const unsafeTools = stop === 'max_tokens' || stop === 'refusal';
  const toolCalls = unsafeTools
    ? []
    : content
        .filter(b => b?.type === 'tool_use')
        .map(b => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));

  let finalText = text;
  if (stop === 'refusal') {
    const category = message?.stop_details?.category;
    const note = `Claude declined this request${category ? ` (category: ${category})` : ''}.`;
    finalText = finalText ? `${finalText}\n\n${note}` : note;
  } else if (stop === 'max_tokens' && content.some(b => b?.type === 'tool_use')) {
    const note =
      'The response hit the output limit while writing a tool call, so the call was not run.';
    finalText = finalText ? `${finalText}\n\n${note}` : note;
  }

  const usage = message?.usage ?? {};
  const promptTokens =
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);

  return {
    choices: [{ message: { content: finalText, tool_calls: toolCalls }, finish_reason: stop }],
    model: message?.model,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: usage.output_tokens ?? 0,
      total_tokens: promptTokens + (usage.output_tokens ?? 0),
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    },
    _originalResponse: {
      anthropic: {
        id: message?.id,
        model: message?.model,
        stop_reason: stop,
        content,
      },
    },
  };
}
