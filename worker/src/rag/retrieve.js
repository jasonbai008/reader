import { embedTexts } from './embed.js';
import { queryVectors } from '../services/vectorize.js';

function mapMatch(match) {
  const metadata = match.metadata || {};
  return {
    score: match.score,
    documentId: metadata.documentId || '',
    filename: metadata.filename || '',
    chunkIndex: metadata.chunkIndex ?? null,
    text: metadata.text || '',
  };
}

/**
 * query → Cloudflare Workers AI Embedding → Vectorize Top-K
 * 查询与文档使用同一模型（bge-base-en-v1.5），查询侧使用 RETRIEVAL_QUERY。
 */
export async function retrieve(env, { query, topK }) {
  const [vector] = await embedTexts([query], env, 'RETRIEVAL_QUERY');
  const matches = await queryVectors(env, vector, { topK });

  return {
    query,
    topK,
    embeddingOk: true,
    resultCount: matches.length,
    results: matches.map(mapMatch),
  };
}
