<script setup>
import { computed, onMounted, ref } from 'vue';
import { deleteDocument, listDocuments, uploadDocument } from './api.js';

const documents = ref([]);
const selectedId = ref('');
const uploading = ref(false);
const deletingId = ref('');
const loadError = ref('');
const notice = ref('');

const chunkSize = ref(800);
const chunkOverlap = ref(100);
const fileInput = ref(null);

const question = ref('');
const selected = computed(() => documents.value.find((item) => item.documentId === selectedId.value) || null);

const statusLabel = {
  waiting: '等待中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fileType(doc) {
  const name = doc.filename || '';
  const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
  return ext || (doc.contentType || '').split('/').pop()?.toUpperCase() || 'FILE';
}

async function refreshList() {
  loadError.value = '';
  const data = await listDocuments();
  documents.value = data.documents || [];
  if (selectedId.value && !documents.value.some((item) => item.documentId === selectedId.value)) {
    selectedId.value = documents.value[0]?.documentId || '';
  }
}

onMounted(async () => {
  try {
    await refreshList();
  } catch (err) {
    loadError.value = err.message;
  }
});

function triggerUpload() {
  fileInput.value?.click();
}

async function onFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  uploading.value = true;
  loadError.value = '';
  notice.value = `正在处理「${file.name}」：解析 → Chunk → Embedding → Vectorize`;

  try {
    const result = await uploadDocument(file, {
      chunkSize: Number(chunkSize.value),
      chunkOverlap: Number(chunkOverlap.value),
    });
    await refreshList();
    selectedId.value = result.documentId;
    if (result.status === 'completed') {
      notice.value = `「${result.filename}」已完成索引，共 ${result.chunkCount} 个 Chunk。`;
    } else {
      loadError.value = result.error || '文档处理失败。';
      notice.value = '';
    }
  } catch (err) {
    loadError.value = err.message;
    notice.value = '';
    try {
      await refreshList();
    } catch {
      // 列表刷新失败时保留上传错误即可。
    }
  } finally {
    uploading.value = false;
  }
}

async function onDelete(doc) {
  if (!confirm(`确定删除「${doc.filename}」？将同时删除 R2 原文件和 Vectorize 中的向量。`)) {
    return;
  }

  deletingId.value = doc.documentId;
  loadError.value = '';
  try {
    await deleteDocument(doc.documentId);
    if (selectedId.value === doc.documentId) selectedId.value = '';
    await refreshList();
    notice.value = `已删除「${doc.filename}」。`;
  } catch (err) {
    loadError.value = err.message;
  } finally {
    deletingId.value = '';
  }
}

function selectDocument(doc) {
  selectedId.value = doc.documentId;
}
</script>

<template>
  <div class="app-shell">
    <aside class="kb-panel">
      <header class="panel-head">
        <p class="eyebrow">Knowledge Base</p>
        <h1>知识库</h1>
        <p class="sub">上传文档，完成第一阶段索引流水线。</p>
      </header>

      <div class="upload-box">
        <input
          ref="fileInput"
          class="hidden-input"
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          @change="onFileChange"
        />
        <button class="primary-btn" type="button" :disabled="uploading" @click="triggerUpload">
          {{ uploading ? '正在索引…' : '上传文件' }}
        </button>
        <p class="hint">支持 TXT / Markdown / PDF，最大 4MB。</p>
      </div>

      <section class="params">
        <h2>索引参数</h2>
        <label>
          <span>Chunk Size</span>
          <input v-model.number="chunkSize" type="number" min="100" max="2000" step="50" />
        </label>
        <p class="param-note">每个片段大约包含多少字符。默认 800，兼顾语义完整和 Embedding 输入长度。</p>
        <label>
          <span>Chunk Overlap</span>
          <input v-model.number="chunkOverlap" type="number" min="0" :max="Math.max(chunkSize - 1, 0)" step="10" />
        </label>
        <p class="param-note">相邻片段重叠的字符数。默认 100，避免句子被切断后检索不到。</p>
      </section>

      <section class="file-list">
        <div class="list-head">
          <h2>文件列表</h2>
          <span>{{ documents.length }} 个文件</span>
        </div>

        <p v-if="notice" class="notice">{{ notice }}</p>
        <p v-if="loadError" class="error">{{ loadError }}</p>
        <p v-if="!documents.length && !uploading" class="empty">还没有文档。上传一个 TXT 开始验证索引流程。</p>

        <ul>
          <li
            v-for="doc in documents"
            :key="doc.documentId"
            :class="['file-item', { active: doc.documentId === selectedId }]"
            @click="selectDocument(doc)"
          >
            <div class="file-main">
              <strong>{{ doc.filename }}</strong>
              <div class="meta">
                <span>{{ fileType(doc) }}</span>
                <span>{{ formatSize(doc.size) }}</span>
                <span>{{ doc.chunkCount || 0 }} chunks</span>
              </div>
            </div>
            <div class="file-side">
              <span :class="['status', doc.status]">{{ statusLabel[doc.status] || doc.status }}</span>
              <button
                type="button"
                class="ghost-btn"
                :disabled="deletingId === doc.documentId"
                @click.stop="onDelete(doc)"
              >
                删除
              </button>
            </div>
            <p v-if="doc.status === 'failed' && doc.error" class="item-error">{{ doc.error }}</p>
          </li>
        </ul>
      </section>

      <section v-if="selected" class="selected-card">
        <h2>当前选中</h2>
        <p>{{ selected.filename }}</p>
        <p class="muted">{{ selected.documentId }}</p>
        <p v-if="selected.status === 'completed'" class="muted">
          已写入 {{ selected.vectorCount }} 条向量 · {{ selected.embeddingModel }} / {{ selected.embeddingDimensions }} 维
        </p>
      </section>
    </aside>

    <main class="chat-panel">
      <header class="chat-head">
        <p class="eyebrow">RAG Chat</p>
        <h1>AI 对话</h1>
        <p class="stage-banner">第一阶段尚未启用问答。当前只验证文档是否已被切分并写入 Vectorize。</p>
      </header>

      <div class="transcript">
        <div class="placeholder-card">
          <h2>等待知识库准备完成</h2>
          <p>本阶段数据流：文件 → 解析 → 清洗 → Chunk → Gemini Embedding → Cloudflare Vectorize。</p>
          <p>第二阶段才会把问题变成向量并检索 Top-K；第三阶段才会把检索结果交给 Gemini 生成回答。</p>
        </div>
      </div>

      <form class="composer" @submit.prevent>
        <textarea
          v-model="question"
          rows="2"
          disabled
          placeholder="问答将在后续阶段启用"
        />
        <button type="submit" disabled>发送</button>
      </form>
    </main>
  </div>
</template>
