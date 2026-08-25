const PREFIX = 'rag';

export function originalObjectKey(documentId, filename) {
  return `${PREFIX}/${documentId}/${filename}`;
}

export function metaObjectKey(documentId) {
  return `${PREFIX}/${documentId}/_meta.json`;
}

function assertR2(env) {
  if (!env.R2) {
    const err = new Error('未绑定 R2。请检查 wrangler.jsonc 中的 r2_buckets 配置。');
    err.status = 500;
    throw err;
  }
}

export async function saveOriginalFile(env, { documentId, filename, contentType, buffer }) {
  assertR2(env);
  const key = originalObjectKey(documentId, filename);
  await env.R2.put(key, buffer, {
    httpMetadata: { contentType },
    customMetadata: {
      documentId,
      filename,
    },
  });
  return key;
}

export async function saveDocumentMeta(env, meta) {
  assertR2(env);
  const key = metaObjectKey(meta.documentId);
  await env.R2.put(key, JSON.stringify(meta, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  return key;
}

export async function getDocumentMeta(env, documentId) {
  assertR2(env);
  const object = await env.R2.get(metaObjectKey(documentId));
  if (!object) return null;
  return object.json();
}

export async function listDocumentMetas(env) {
  assertR2(env);
  const documents = [];
  let cursor;

  do {
    const page = await env.R2.list({
      prefix: `${PREFIX}/`,
      cursor,
    });

    const metaKeys = page.objects
      .map((item) => item.key)
      .filter((key) => key.endsWith('/_meta.json'));

    for (const key of metaKeys) {
      const object = await env.R2.get(key);
      if (!object) continue;
      documents.push(await object.json());
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  documents.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return documents;
}

export async function deleteDocumentFiles(env, documentId) {
  assertR2(env);
  const prefix = `${PREFIX}/${documentId}/`;
  const keys = [];
  let cursor;

  do {
    const page = await env.R2.list({ prefix, cursor });
    keys.push(...page.objects.map((item) => item.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  await Promise.all(keys.map((key) => env.R2.delete(key)));
  return keys;
}
