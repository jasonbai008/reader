import { getExtension } from '../utils/validation.js';

function decodeUtf8(buffer) {
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

function parsePlainText(buffer) {
  const text = decodeUtf8(buffer);
  if (!text.trim()) {
    const err = new Error('文件解析后没有可用文本。');
    err.status = 400;
    throw err;
  }
  return text;
}

async function parsePdf(buffer) {
  // 动态加载，避免 TXT/Markdown 路径被 PDF 依赖拖累；unpdf 是面向 Workers 的纯 JS 方案。
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join('\n\n') : result.text;
    if (!text || !String(text).trim()) {
      const err = new Error('PDF 中没有可提取的文本。扫描件/图片型 PDF 需要 OCR，当前阶段不支持。');
      err.status = 400;
      throw err;
    }
    return String(text);
  } catch (error) {
    if (error.status) throw error;
    const err = new Error(`PDF 解析失败：${error.message || 'Worker 运行时无法处理该文件'}`);
    err.status = 400;
    throw err;
  }
}

/**
 * 统一入口：根据文件类型选择 Parser。
 * Markdown 按纯文本读取，保留标题和列表结构，这些标记对后续检索仍然有用。
 */
export async function parseDocument({ filename, buffer }) {
  const ext = getExtension(filename);

  if (ext === 'txt' || ext === 'md') {
    return parsePlainText(buffer);
  }

  if (ext === 'pdf') {
    return parsePdf(buffer);
  }

  const err = new Error('不支持的文件类型。');
  err.status = 400;
  throw err;
}
