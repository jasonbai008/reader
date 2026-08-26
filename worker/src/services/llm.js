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

function collectText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .join('');
  }
  if (value && typeof value === 'object') {
    return value.text || value.content || '';
  }
  return '';
}

function extractText(payload) {
  const message = payload?.choices?.[0]?.message;
  const fromMessage = collectText(message?.content);
  if (fromMessage.trim()) return fromMessage;

  const fromResponse = collectText(payload?.response);
  if (fromResponse.trim()) return fromResponse;

  const fromResult = collectText(payload?.result?.response);
  if (fromResult.trim()) return fromResult;

  const fromOutput = collectText(payload?.output_text);
  if (fromOutput.trim()) return fromOutput;

  return '';
}

function stripThink(text) {
  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*<\/?think>\s*/gi, '')
    .trim();
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
    const err = new Error('Workers AI 未返回可用的回答文本。');
    err.status = 502;
    throw err;
  }

  return answer;
}
