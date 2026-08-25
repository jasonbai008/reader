/**
 * 只做索引前的基础清洗：统一换行、压缩空白。
 * 不做分词/去停用词等 NLP，避免把对检索有用的原文语义洗掉。
 */
export function cleanText(input = '') {
  return String(input)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
