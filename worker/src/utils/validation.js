export const ALLOWED_EXTENSIONS = ['txt', 'md', 'pdf'];
export const MAX_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_CHUNKS = 100;
export const MIN_CHUNK_SIZE = 100;
export const MAX_CHUNK_SIZE = 2000;
export const DEFAULT_CHUNK_SIZE = 800;
export const DEFAULT_CHUNK_OVERLAP = 100;

const MIME_BY_EXT = {
  txt: 'text/plain',
  md: 'text/markdown',
  pdf: 'application/pdf',
};

export function getExtension(filename = '') {
  const parts = filename.toLowerCase().split('.');
  if (parts.length < 2) return '';
  return parts.at(-1);
}

export function sanitizeFilename(filename = '') {
  const base = filename.split(/[/\\]/).at(-1) || 'untitled';
  return base.replace(/[^\w.\u4e00-\u9fff()-]/g, '_');
}

export function resolveContentType(filename, contentType) {
  const ext = getExtension(filename);
  if (contentType && contentType !== 'application/octet-stream') {
    return contentType;
  }
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

export function validateFile(file, size) {
  if (!file || typeof file === 'string') {
    const err = new Error('请选择要上传的文件。');
    err.status = 400;
    throw err;
  }

  const filename = sanitizeFilename(file.name || '');
  if (!filename || filename === '_meta.json') {
    const err = new Error('文件名无效。');
    err.status = 400;
    throw err;
  }

  const ext = getExtension(filename);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const err = new Error('仅支持 TXT、Markdown、PDF。');
    err.status = 400;
    throw err;
  }

  if (!size || size <= 0) {
    const err = new Error('文件内容为空。');
    err.status = 400;
    throw err;
  }

  if (size > MAX_FILE_SIZE) {
    const err = new Error('文件不能超过 4MB。当前阶段同步处理 Embedding，过大文件容易超时。');
    err.status = 400;
    throw err;
  }

  return {
    filename,
    ext,
    contentType: resolveContentType(filename, file.type),
  };
}

export function parseChunkParams(form) {
  const chunkSize = Number(form.get('chunkSize') ?? DEFAULT_CHUNK_SIZE);
  const chunkOverlap = Number(form.get('chunkOverlap') ?? DEFAULT_CHUNK_OVERLAP);

  if (!Number.isInteger(chunkSize) || chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE) {
    const err = new Error(`chunkSize 必须是 ${MIN_CHUNK_SIZE}–${MAX_CHUNK_SIZE} 的整数。`);
    err.status = 400;
    throw err;
  }

  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    const err = new Error('chunkOverlap 必须是小于 chunkSize 的非负整数，否则切分无法前进。');
    err.status = 400;
    throw err;
  }

  return { chunkSize, chunkOverlap };
}

export const DEFAULT_TOP_K = 5;
export const MIN_TOP_K = 1;
export const MAX_TOP_K = 10;

export function parseSearchBody(body) {
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!query) {
    const err = new Error('query 不能为空。');
    err.status = 400;
    throw err;
  }

  const topK = Number(body?.topK ?? DEFAULT_TOP_K);
  if (!Number.isInteger(topK) || topK < MIN_TOP_K || topK > MAX_TOP_K) {
    const err = new Error(`topK 必须是 ${MIN_TOP_K}–${MAX_TOP_K} 的整数。`);
    err.status = 400;
    throw err;
  }

  return { query, topK };
}
