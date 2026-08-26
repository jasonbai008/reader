import { retrieve } from '../rag/retrieve.js';
import { parseSearchBody } from '../utils/validation.js';
import { json } from '../utils/response.js';

export async function handleSearch(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    const err = new Error('请求体必须是 JSON。');
    err.status = 400;
    throw err;
  }

  const { query, topK } = parseSearchBody(body);
  const data = await retrieve(env, { query, topK });
  return json(data);
}
