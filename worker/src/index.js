import { handleChat } from './routes/chat.js';
import { handleDeleteDocument, handleListDocuments } from './routes/documents.js';
import { handleSearch } from './routes/search.js';
import { handleUpload } from './routes/upload.js';
import { corsHeaders, error, json } from './utils/response.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    try {
      // 健康检查接口：返回服务状态
      if (pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true, stage: 2, name: 'vector-retrieval' });
      }

      // 上传文档接口：接收并索引新文档
      if (pathname === '/api/documents' && request.method === 'POST') {
        return await handleUpload(request, env);
      }

      // 获取文档列表接口：返回已索引的所有文档
      if (pathname === '/api/documents' && request.method === 'GET') {
        return await handleListDocuments(env);
      }

      // 删除文档接口：根据文档 ID 删除指定文档
      const documentMatch = pathname.match(/^\/api\/documents\/([^/]+)$/);
      if (documentMatch && request.method === 'DELETE') {
        return await handleDeleteDocument(env, decodeURIComponent(documentMatch[1]));
      }

      // 搜索接口：在已索引文档中进行语义搜索
      if (pathname === '/api/search' && request.method === 'POST') {
        return await handleSearch(request, env);
      }

      // 对话接口：基于文档内容进行 AI 问答
      if (pathname === '/api/chat' && request.method === 'POST') {
        return await handleChat();
      }

      return error('接口不存在。', 404);
    } catch (err) {
      if (!err.status || err.status >= 500) {
        console.error(err);
      }
      return error(err.message || '服务器内部错误', err.status || 500);
    }
  },
};
