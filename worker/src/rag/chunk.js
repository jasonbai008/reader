import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from '../utils/validation.js';

/**
 * 固定窗口 + overlap 的字符级切分。
 * overlap 让相邻 Chunk 共享边界上下文，降低句子被切断后检索召回失败的概率。
 */
export function chunkText(text, chunkSize = DEFAULT_CHUNK_SIZE, chunkOverlap = DEFAULT_CHUNK_OVERLAP) {
  if (!text || !text.trim()) return [];

  if (chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap 必须小于 chunkSize。');
  }

  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // 优先在窗口后部按段落/空格断开，避免把一个词或一行从中间切开。
    if (end < text.length) {
      const windowStart = Math.max(start + Math.floor(chunkSize * 0.7), start);
      const window = text.slice(windowStart, end);
      const breakAt = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf(' '));
      if (breakAt > 0) {
        end = windowStart + breakAt + 1;
      }
    }

    const piece = text.slice(start, end).trim();
    if (piece) {
      chunks.push({
        chunkIndex,
        text: piece,
      });
      chunkIndex += 1;
    }

    if (end >= text.length) break;

    const nextStart = end - chunkOverlap;
    // 强制前进，防止 overlap 过大或 trim 导致死循环。
    start = nextStart <= start ? end : nextStart;
  }

  return chunks;
}

export function buildChunks({ text, documentId, filename, chunkSize, chunkOverlap }) {
  return chunkText(text, chunkSize, chunkOverlap).map((chunk) => ({
    chunkId: `${documentId}_${chunk.chunkIndex}`,
    documentId,
    filename,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
  }));
}
