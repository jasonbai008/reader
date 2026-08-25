import { deleteDocumentFiles, getDocumentMeta, listDocumentMetas } from '../services/storage.js';
import { deleteVectorsByIds } from '../services/vectorize.js';
import { publicDocument } from '../utils/document.js';
import { json } from '../utils/response.js';

export async function handleListDocuments(env) {
  const documents = await listDocumentMetas(env);
  return json({
    documents: documents.map(publicDocument),
  });
}

export async function handleDeleteDocument(env, documentId) {
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) {
    return json({ error: '文档不存在。' }, 404);
  }

  // 没有成功写入的向量就不要调用 Vectorize，避免对空索引/不存在的 ID 触发远程 500。
  let deletedVectors = 0;
  let vectorError = null;
  const shouldDeleteVectors = meta.status === 'completed' && Array.isArray(meta.chunkIds) && meta.chunkIds.length > 0;
  if (shouldDeleteVectors) {
    try {
      const vectorResult = await deleteVectorsByIds(env, meta.chunkIds);
      deletedVectors = vectorResult.deleted;
    } catch (err) {
      vectorError = err.message || 'Vectorize 删除失败';
    }
  }

  const deletedKeys = await deleteDocumentFiles(env, documentId);

  return json({
    documentId,
    deleted: true,
    deletedVectors,
    deletedR2Keys: deletedKeys,
    vectorError,
  });
}
