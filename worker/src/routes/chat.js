import { retrieve } from '../rag/retrieve.js';
import { buildRagMessages, formatContext } from '../rag/prompt.js';
import { generateChat } from '../services/llm.js';
import { parseSearchBody } from '../utils/validation.js';
import { json } from '../utils/response.js';

function toSource(item) {
  return {
    filename: item.filename || '',
    chunkIndex: item.chunkIndex ?? null,
    score: item.score,
  };
}

/**
 * query → Embedding → Vectorize Top-K → RAG Prompt → Workers AI LLM
 */
export async function handleChat(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    const err = new Error('请求体必须是 JSON。');
    err.status = 400;
    throw err;
  }

  const { query, topK } = parseSearchBody(body);

  let retrieval;
  try {
    retrieval = await retrieve(env, { query, topK });
  } catch (error) {
    if (error.status) throw error;
    const err = new Error(error.message || '向量检索失败。');
    err.status = 502;
    throw err;
  }

  const context = formatContext(retrieval.results);
  const messages = buildRagMessages({ query, context });

  let answer;
  try {
    answer = await generateChat(env, messages);
  } catch (error) {
    if (error.status) throw error;
    const err = new Error(error.message || '生成回答失败。');
    err.status = 502;
    throw err;
  }

  return json({
    answer,
    sources: retrieval.results.map(toSource),
    retrievalResults: retrieval.results,
    query,
    topK,
  });
}
