const API_BASE = import.meta.env.VITE_API_BASE || '';

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `请求失败 (${res.status})`);
  }
  return data;
}

export async function listDocuments() {
  const res = await fetch(`${API_BASE}/api/documents`);
  return parseResponse(res);
}

export async function uploadDocument(file, { chunkSize, chunkOverlap }) {
  const form = new FormData();
  form.append('file', file);
  form.append('chunkSize', String(chunkSize));
  form.append('chunkOverlap', String(chunkOverlap));

  const res = await fetch(`${API_BASE}/api/documents`, {
    method: 'POST',
    body: form,
  });
  return parseResponse(res);
}

export async function searchChunks(query, topK) {
  const res = await fetch(`${API_BASE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topK }),
  });
  return parseResponse(res);
}

export async function deleteDocument(documentId) {
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
  });
  return parseResponse(res);
}
