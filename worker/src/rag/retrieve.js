/**
 * 第二阶段实现：Query Embedding → Vectorize Query → Top-K。
 * 第一阶段只完成索引写入，不在这里做检索。
 */
export async function retrieve() {
  const err = new Error('向量检索将在第二阶段实现。');
  err.status = 501;
  throw err;
}
