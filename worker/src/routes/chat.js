import { json } from '../utils/response.js';

/**
 * 第三阶段入口。第一阶段只保留对话 UI，不调用 Gemini 生成回答。
 */
export async function handleChat() {
  return json(
    {
      error: '知识库问答将在第三阶段实现。',
      stage: 1,
    },
    501,
  );
}
