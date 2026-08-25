const UPSERT_BATCH = 100;
const DELETE_BATCH = 100;

function toVectorRecord(chunk) {
  return {
    id: chunk.chunkId,
    values: chunk.embedding,
    metadata: {
      documentId: chunk.documentId,
      filename: chunk.filename,
      chunkIndex: chunk.chunkIndex,
      // 检索阶段需要直接拿到原文片段；Chunk 已被限制在 2000 字以内，不会超过 Vectorize 10KiB metadata 上限。
      text: chunk.text,
    },
  };
}

export async function upsertChunks(env, chunks) {
  if (!env.VECTORIZE) {
    const err = new Error('未绑定 Vectorize。请检查 wrangler.jsonc 中的 vectorize 配置。');
    err.status = 500;
    throw err;
  }

  const records = chunks.map(toVectorRecord);
  const mutationIds = [];

  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    const result = await env.VECTORIZE.upsert(records.slice(i, i + UPSERT_BATCH));
    if (result?.mutationId) mutationIds.push(result.mutationId);
  }

  return {
    vectorCount: records.length,
    mutationIds,
  };
}

export async function deleteVectorsByIds(env, ids = []) {
  if (!ids.length) return { deleted: 0 };
  if (!env.VECTORIZE) {
    const err = new Error('未绑定 Vectorize。请检查 wrangler.jsonc 中的 vectorize 配置。');
    err.status = 500;
    throw err;
  }

  let deleted = 0;
  for (let i = 0; i < ids.length; i += DELETE_BATCH) {
    const batch = ids.slice(i, i + DELETE_BATCH);
    await env.VECTORIZE.deleteByIds(batch);
    deleted += batch.length;
  }

  return { deleted };
}
