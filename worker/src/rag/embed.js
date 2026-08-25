const DEFAULT_MODEL = '@cf/baai/bge-base-en-v1.5';
const DEFAULT_DIMENSIONS = 768;
const BATCH_SIZE = 50;
// Cloudflare 建议 cls pooling，准确度更好；文档与查询必须使用同一 pooling。
const POOLING = 'cls';
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

export function getEmbeddingConfig(env) {
  return {
    model: env.EMBEDDING_MODEL || DEFAULT_MODEL,
    dimensions: Number(env.EMBEDDING_DIMENSIONS || DEFAULT_DIMENSIONS),
  };
}

function l2Normalize(vector) {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);
  if (!norm) return vector;
  return vector.map((value) => value / norm);
}

function assertAiBinding(env) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    const err = new Error('未绑定 Workers AI。请在 wrangler.jsonc 中配置 ai.binding。');
    err.status = 500;
    throw err;
  }
}

function prepareTexts(texts, taskType) {
  if (taskType === 'RETRIEVAL_QUERY') {
    return texts.map((text) => `${QUERY_PREFIX}${text}`);
  }
  return texts;
}

function extractErrorMessage(payload, fallback) {
  return payload?.error?.message || payload?.errors?.[0]?.message || fallback;
}

async function embedBatch(texts, env) {
  assertAiBinding(env);
  const { model, dimensions } = getEmbeddingConfig(env);

  let payload;
  let timer;
  try {
    payload = await Promise.race([
      env.AI.run(model, {
        text: texts,
        pooling: POOLING,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error('Workers AI Embedding 请求超时。');
          err.status = 504;
          reject(err);
        }, 45000);
      }),
    ]);
  } catch (error) {
    if (error.status === 504) throw error;
    const err = new Error(error.message || 'Workers AI Embedding 请求失败。');
    err.status = 502;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (payload?.error || payload?.success === false) {
    const err = new Error(extractErrorMessage(payload, 'Workers AI Embedding 请求失败。'));
    err.status = 502;
    throw err;
  }

  const embeddings = payload?.data;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    const err = new Error('Workers AI Embedding 返回数量与输入数量不一致。');
    err.status = 502;
    throw err;
  }

  return embeddings.map((values) => {
    const vector = Array.isArray(values) ? values : [];
    if (vector.length !== dimensions) {
      const err = new Error(`Workers AI Embedding 维度为 ${vector.length}，期望 ${dimensions}。`);
      err.status = 502;
      throw err;
    }
    return l2Normalize(vector);
  });
}

/**
 * text → Cloudflare Workers AI Embedding → vector
 * 文档侧固定使用 RETRIEVAL_DOCUMENT；查询应改用 RETRIEVAL_QUERY，但模型与维度必须保持一致。
 */
export async function embedTexts(texts, env, taskType = 'RETRIEVAL_DOCUMENT') {
  if (!texts.length) return [];

  const prepared = prepareTexts(texts, taskType);
  const vectors = [];
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const slice = prepared.slice(i, i + BATCH_SIZE);
    const batch = await embedBatch(slice, env);
    vectors.push(...batch);
  }
  return vectors;
}

export async function embedChunks(chunks, env) {
  const vectors = await embedTexts(
    chunks.map((chunk) => chunk.text),
    env,
    'RETRIEVAL_DOCUMENT',
  );

  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: vectors[index],
  }));
}
