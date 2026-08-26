const DEFAULT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const LLM_TIMEOUT_MS = 60000;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.3;

export function getChatConfig(env) {
  return {
    model: env.CHAT_MODEL || DEFAULT_MODEL,
    maxTokens: Number(env.CHAT_MAX_TOKENS || DEFAULT_MAX_TOKENS),
    temperature: Number(env.CHAT_TEMPERATURE || DEFAULT_TEMPERATURE),
  };
}

function assertAiBinding(env) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    const err = new Error('未绑定 Workers AI。请在 wrangler.jsonc 中配置 ai.binding。');
    err.status = 500;
    throw err;
  }
}

function extractErrorMessage(payload, fallback) {
  return payload?.error?.message || payload?.errors?.[0]?.message || fallback;
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const inner = payload.result;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    if (inner.choices || inner.response || inner.output || inner.output_text) {
      return inner;
    }
  }
  return payload;
}

function collectText(value, depth = 0) {
  if (depth > 6 || value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map((part) => collectText(part, depth + 1)).join('');
  }
  if (typeof value !== 'object') return '';

  const direct = [value.output_text, value.text, value.response, value.response_text];
  for (const item of direct) {
    if (typeof item === 'string' && item.trim()) return item;
  }

  if (value.content != null) {
    const nested = collectText(value.content, depth + 1);
    if (nested.trim()) return nested;
  }
  return '';
}

function collectOutput(output) {
  if (!Array.isArray(output)) return collectText(output);
  return output
    .filter((item) => {
      const type = item?.type;
      return type === 'message' || type === 'output_text' || item?.role === 'assistant' || item?.content;
    })
    .map((item) => collectText(item.content ?? item.text ?? item))
    .join('');
}

function extractText(payload) {
  const data = unwrapPayload(payload);
  const choice = data?.choices?.[0];
  const message = choice?.message || choice?.delta;

  const candidates = [
    message?.content,
    // Qwen3 on Workers AI 常把可见回答放在 reasoning / reasoning_content，content 为 null。
    message?.reasoning_content,
    message?.reasoning,
    choice?.text,
    data?.response,
    data?.response_text,
    data?.output_text,
    data?.output ? collectOutput(data.output) : '',
  ];

  for (const candidate of candidates) {
    const text = collectText(candidate);
    if (text.trim()) return text;
  }
  return '';
}

function stripThink(text) {
  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*<\/?think>\s*/gi, '')
    .trim();
}

function summarizePayload(payload) {
  try {
    const raw = JSON.stringify(payload);
    return raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw;
  } catch {
    return Object.prototype.toString.call(payload);
  }
}

/**
 * messages → Cloudflare Workers AI Chat → 文本回答
 * 与 Embedding 共用 env.AI，不引入 Gemini。
 */
export async function generateChat(env, messages) {
  assertAiBinding(env);
  const { model, maxTokens, temperature } = getChatConfig(env);

  let payload;
  let timer;
  try {
    payload = await Promise.race([
      env.AI.run(model, {
        messages,
        max_tokens: maxTokens,
        temperature,
        chat_template_kwargs: { enable_thinking: false },
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error('Workers AI 生成回答超时。');
          err.status = 504;
          reject(err);
        }, LLM_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (error.status === 504) throw error;
    const err = new Error(error.message || 'Workers AI 生成回答失败。');
    err.status = 502;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (payload?.error || payload?.success === false) {
    const err = new Error(extractErrorMessage(payload, 'Workers AI 生成回答失败。'));
    err.status = 502;
    throw err;
  }

  const answer = stripThink(extractText(payload));
  if (!answer) {
    console.error('Workers AI 返回无法解析的结构:', summarizePayload(payload));
    const err = new Error('Workers AI 未返回可用的回答文本。');
    err.status = 502;
    throw err;
  }

  return answer;
}
