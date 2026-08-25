import { parseDocument } from '../services/parser.js';
import { saveDocumentMeta, saveOriginalFile } from '../services/storage.js';
import { upsertChunks } from '../services/vectorize.js';
import { buildChunks } from '../rag/chunk.js';
import { embedChunks, getEmbeddingConfig } from '../rag/embed.js';
import { cleanText } from '../utils/text.js';
import { publicDocument } from '../utils/document.js';
import { error, json } from '../utils/response.js';
import { MAX_CHUNKS, parseChunkParams, validateFile } from '../utils/validation.js';

export async function handleUpload(request, env) {
  let file;
  let chunkSize;
  let chunkOverlap;
  let buffer;
  let filename;
  let contentType;

  try {
    const form = await request.formData();
    file = form.get('file');
    ({ chunkSize, chunkOverlap } = parseChunkParams(form));
    buffer = file && typeof file !== 'string' ? await file.arrayBuffer() : new ArrayBuffer(0);
    ({ filename, contentType } = validateFile(file, buffer.byteLength));
  } catch (err) {
    return error(err.message || '请求无效', err.status || 400);
  }

  const documentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { model, dimensions } = getEmbeddingConfig(env);

  let meta = {
    documentId,
    filename,
    contentType,
    size: buffer.byteLength,
    status: 'processing',
    chunkCount: 0,
    vectorCount: 0,
    chunkIds: [],
    chunkSize,
    chunkOverlap,
    embeddingModel: model,
    embeddingDimensions: dimensions,
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  await saveOriginalFile(env, { documentId, filename, contentType, buffer });
  await saveDocumentMeta(env, meta);

  try {
    const rawText = await parseDocument({ filename, buffer });
    const text = cleanText(rawText);
    if (!text) {
      const err = new Error('文本清洗后没有可用内容。');
      err.status = 400;
      throw err;
    }

    const chunks = buildChunks({
      text,
      documentId,
      filename,
      chunkSize,
      chunkOverlap,
    });

    if (!chunks.length) {
      const err = new Error('未能生成任何 Chunk。');
      err.status = 400;
      throw err;
    }

    if (chunks.length > MAX_CHUNKS) {
      const err = new Error(`Chunk 数量为 ${chunks.length}，超过当前阶段上限 ${MAX_CHUNKS}。请减小文件或增大 chunkSize。`);
      err.status = 400;
      throw err;
    }

    // 先记下 Chunk 结果，即使后续 Embedding 失败也能从列表里看出切分是否成功。
    meta = {
      ...meta,
      chunkCount: chunks.length,
      chunkIds: chunks.map((chunk) => chunk.chunkId),
      updatedAt: new Date().toISOString(),
    };
    await saveDocumentMeta(env, meta);

    const embeddedChunks = await embedChunks(chunks, env);
    const { vectorCount } = await upsertChunks(env, embeddedChunks);

    meta = {
      ...meta,
      status: 'completed',
      chunkCount: chunks.length,
      vectorCount,
      chunkIds: chunks.map((chunk) => chunk.chunkId),
      error: null,
      updatedAt: new Date().toISOString(),
    };
    await saveDocumentMeta(env, meta);

    return json({
      ...publicDocument(meta),
      message: '文档已完成解析、切分、Embedding，并写入 Vectorize。',
    });
  } catch (err) {
    meta = {
      ...meta,
      status: 'failed',
      error: err.message || '文档处理失败',
      updatedAt: new Date().toISOString(),
    };
    await saveDocumentMeta(env, meta);
    return json(
      {
        ...publicDocument(meta),
      },
      err.status || 500,
    );
  }
}
