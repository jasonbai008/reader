import { json } from '../utils/response.js';

/**
 * 第二阶段入口。第一阶段只保留路由占位，避免前端误以为检索已接通。
 */
export async function handleSearch() {
  return json(
    {
      error: '向量检索将在第二阶段实现。',
      stage: 1,
    },
    501,
  );
}
