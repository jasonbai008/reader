export function publicDocument(meta) {
  return {
    documentId: meta.documentId,
    filename: meta.filename,
    contentType: meta.contentType,
    size: meta.size,
    status: meta.status,
    chunkCount: meta.chunkCount || 0,
    vectorCount: meta.vectorCount || 0,
    chunkSize: meta.chunkSize,
    chunkOverlap: meta.chunkOverlap,
    embeddingModel: meta.embeddingModel,
    embeddingDimensions: meta.embeddingDimensions,
    error: meta.error || null,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}
