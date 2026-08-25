const GEMINI_EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const BATCH_SIZE = 50;

export function getEmbeddingConfig(env) {
  return {
    model: env.EMBEDDING_MODEL || 'gemini-embedding-001',
    dimensions: Number(env.EMBEDDING_DIMENSIONS || 768),
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

function assertApiKey(env) {
  if (!env.GEMINI_API_KEY || /your_gemini_api_key/i.test(env.GEMINI_API_KEY)) {
    const err = new Error('未配置有效的 GEMINI_API_KEY。请在 Worker Secret 或 worker/.dev.vars 中填入真实 Key。');
    err.status = 500;
    throw err;
  }
}

async function embedBatch(texts, env, taskType) {
  assertApiKey(env);
  const { model, dimensions } = getEmbeddingConfig(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  let response;
  try {
    response = await fetch(`${GEMINI_EMBED_URL}/${model}:batchEmbedContents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          // 文档与查询必须使用同一模型、同一维度；taskType 仅告诉模型这段文本在 RAG 中的角色。
          taskType,
          outputDimensionality: dimensions,
        })),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      const err = new Error('Gemini Embedding 请求超时。请检查网络或 API Key。');
      err.status = 504;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `Gemini Embedding 请求失败 (${response.status})`;
    const err = new Error(message);
    err.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw err;
  }

  const embeddings = payload.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    const err = new Error('Gemini Embedding 返回数量与 Chunk 数量不一致。');
    err.status = 502;
    throw err;
  }

  // gemini-embedding-001 在截断到 768 维后不会自动归一化；不归一化会让 cosine 检索被向量模长干扰。
  return embeddings.map((item) => l2Normalize(item.values || []));
}

/**
 * text → Gemini Embedding → vector
 * 文档侧固定使用 RETRIEVAL_DOCUMENT；第二阶段查询应改用 RETRIEVAL_QUERY，但模型与维度必须保持一致。
 */
export async function embedTexts(texts, env, taskType = 'RETRIEVAL_DOCUMENT') {
  if (!texts.length) return [];

  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const batch = await embedBatch(slice, env, taskType);
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
