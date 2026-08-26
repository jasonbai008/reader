const SYSTEM_PROMPT = `你是一个知识库问答助手。

请严格遵守以下规则：
1. 优先根据用户消息中提供的「知识库 Context」回答问题。
2. 不要把 Context 中不存在的信息伪装成知识库内容。
3. 如果 Context 为空，或其中的资料不足以回答问题，必须明确告诉用户：「知识库中没有找到足够相关的资料。」
4. 可以使用你自身的常识帮助理解问题，但不能假装这些内容来自知识库。若需要补充常识，请单独标明「以下内容来自模型常识，不是知识库原文」。
5. 尽量引用相关文档（文件名、Chunk 编号），让用户能核对来源。
6. 回答清晰、准确，使用 Markdown（可用标题、列表、代码块）。
7. 使用与用户问题相同的语言作答。`;

export function formatContext(results = []) {
  if (!results.length) {
    return '（本次检索没有返回任何相关片段。）';
  }

  return results
    .map((item, index) => {
      const filename = item.filename || '未知文件';
      const chunkIndex = item.chunkIndex ?? '-';
      const score = typeof item.score === 'number' ? item.score.toFixed(4) : '-';
      const text = item.text || '';
      return `[#${index + 1}] 文件: ${filename} | Chunk: ${chunkIndex} | 相似度: ${score}\n${text}`;
    })
    .join('\n\n');
}

/**
 * Context 与用户问题分块传入，避免模型把检索片段当成自己的知识。
 */
export function buildRagMessages({ query, context }) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `【知识库 Context】\n${context}\n\n【用户问题】\n${query}`,
    },
  ];
}
