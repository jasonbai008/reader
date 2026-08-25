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
      if (pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true, stage: 1, name: 'document-indexing' });
      }

      if (pathname === '/api/documents' && request.method === 'POST') {
        return await handleUpload(request, env);
      }

      if (pathname === '/api/documents' && request.method === 'GET') {
        return await handleListDocuments(env);
      }

      const documentMatch = pathname.match(/^\/api\/documents\/([^/]+)$/);
      if (documentMatch && request.method === 'DELETE') {
        return await handleDeleteDocument(env, decodeURIComponent(documentMatch[1]));
      }

      if (pathname === '/api/search' && request.method === 'POST') {
        return await handleSearch();
      }

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
