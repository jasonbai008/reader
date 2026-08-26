<script setup>
import { onMounted, ref } from "vue";
import {
  deleteDocument,
  listDocuments,
  searchChunks,
  uploadDocument,
} from "./api.js";

const documents = ref([]);
const uploading = ref(false);
const deletingId = ref("");
const loadError = ref("");
const notice = ref("");

const chunkSize = ref(800);
const chunkOverlap = ref(100);
const topK = ref(5);
const fileInput = ref(null);

const question = ref("");
const searching = ref(false);
const searchError = ref("");
const lastQuery = ref("");
const retrieval = ref(null);

const statusLabel = {
  waiting: "等待中",
  processing: "处理中",
  completed: "已完成",
  failed: "失败",
};

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fileType(doc) {
  const name = doc.filename || "";
  const ext = name.includes(".") ? name.split(".").pop().toUpperCase() : "";
  return (
    ext || (doc.contentType || "").split("/").pop()?.toUpperCase() || "FILE"
  );
}

async function refreshList() {
  loadError.value = "";
  const data = await listDocuments();
  documents.value = data.documents || [];
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
  event.target.value = "";
  if (!file) return;

  uploading.value = true;
  loadError.value = "";
  notice.value = `正在处理「${file.name}」：解析 → Chunk → Embedding → Vectorize`;

  try {
    const result = await uploadDocument(file, {
      chunkSize: Number(chunkSize.value),
      chunkOverlap: Number(chunkOverlap.value),
    });
    await refreshList();
    if (result.status === "completed") {
      notice.value = `「${result.filename}」已完成索引，共 ${result.chunkCount} 个 Chunk。`;
    } else {
      loadError.value = result.error || "文档处理失败。";
      notice.value = "";
    }
  } catch (err) {
    loadError.value = err.message;
    notice.value = "";
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
  if (
    !confirm(
      `确定删除「${doc.filename}」？将同时删除 R2 原文件和 Vectorize 中的向量。`
    )
  ) {
    return;
  }

  deletingId.value = doc.documentId;
  loadError.value = "";
  try {
    await deleteDocument(doc.documentId);
    await refreshList();
    notice.value = `已删除「${doc.filename}」。`;
  } catch (err) {
    loadError.value = err.message;
  } finally {
    deletingId.value = "";
  }
}

function formatScore(score) {
  if (typeof score !== "number") return "-";
  return score.toFixed(4);
}

async function onSearch() {
  const query = question.value.trim();
  if (!query || searching.value) return;

  searching.value = true;
  searchError.value = "";
  lastQuery.value = query;

  try {
    retrieval.value = await searchChunks(query, Number(topK.value) || 5);
  } catch (err) {
    searchError.value = err.message;
    retrieval.value = null;
  } finally {
    searching.value = false;
  }
}
</script>

<template>
  <div class="app-shell">
    <aside class="kb-panel">
      <header class="panel-head">
        <p class="eyebrow">Knowledge Base</p>
        <!-- <h1>知识库</h1> -->
      </header>

      <div class="upload-box">
        <input
          ref="fileInput"
          class="hidden-input"
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          @change="onFileChange"
        />
        <button
          class="primary-btn"
          type="button"
          :disabled="uploading"
          @click="triggerUpload"
        >
          {{ uploading ? "正在索引…" : "上传文件" }}
        </button>
        <p class="hint">支持 TXT / Markdown / PDF，最大 4MB</p>
      </div>

      <section class="params">
        <label style="margin-top: 0">
          <span>Chunk Size</span>
          <p class="param-note">单个片段字符数，默认 800</p>
          <input
            v-model.number="chunkSize"
            type="number"
            min="100"
            max="2000"
            step="50"
          />
        </label>
        <label>
          <span>Chunk Overlap</span>
          <p class="param-note">相邻片段重叠字符数，默认 100</p>
          <input
            v-model.number="chunkOverlap"
            type="number"
            min="0"
            :max="Math.max(chunkSize - 1, 0)"
            step="10"
          />
        </label>
        <label>
          <span>Top K</span>
          <p class="param-note">检索返回的片段数量，默认 5</p>
          <input
            v-model.number="topK"
            type="number"
            min="1"
            max="10"
            step="1"
            placeholder="1-10"
          />
        </label>
      </section>

      <section class="file-list">
        <div class="list-head">
          <h2>文件列表</h2>
          <span>{{ documents.length }} 个文件</span>
        </div>

        <p v-if="notice" class="notice">{{ notice }}</p>
        <p v-if="loadError" class="error">{{ loadError }}</p>
        <p v-if="!documents.length && !uploading" class="empty">
          还没有文档。上传一个 TXT 开始验证索引流程。
        </p>

        <ul>
          <li v-for="doc in documents" :key="doc.documentId" class="file-item">
            <strong :title="doc.filename">{{ doc.filename }}</strong>
            <div class="meta">
              <span>{{ fileType(doc) }}</span>
              <span>{{ formatSize(doc.size) }}</span>
              <span>{{ doc.chunkCount || 0 }} chunks</span>
              <span :class="['status', doc.status]">{{
                statusLabel[doc.status] || doc.status
              }}</span>
            </div>
            <button
              type="button"
              class="ghost-btn"
              :disabled="deletingId === doc.documentId"
              @click.stop="onDelete(doc)"
            >
              删除
            </button>
            <p v-if="doc.status === 'failed' && doc.error" class="item-error">
              {{ doc.error }}
            </p>
          </li>
        </ul>
      </section>
    </aside>

    <main class="chat-panel">
      <header class="chat-head">
        <p class="eyebrow">RAG Chat</p>
        <!-- <h1>AI 对话</h1> -->
      </header>

      <div class="transcript">
        <div
          v-if="!retrieval && !searchError && !searching"
          class="placeholder-card"
        >
          <p class="placeholder-tip">← 请对左侧已上传的文档内容进行提问</p>
        </div>

        <p v-if="searching" class="notice">正在检索…</p>
        <p v-if="searchError" class="error">{{ searchError }}</p>

        <section v-if="lastQuery || retrieval" class="retrieval">
          <article class="query-card">
            <p class="eyebrow">Query</p>
            <h2>{{ lastQuery }}</h2>
            <p v-if="retrieval" class="debug-line">
              Embedding {{ retrieval.embeddingOk ? "成功" : "失败" }} · 请求
              Top-K {{ retrieval.topK }} · 返回 {{ retrieval.resultCount }} 条
            </p>
          </article>

          <div class="result-head">
            <p class="eyebrow">Retrieved Context</p>
            <h2>检索结果</h2>
          </div>

          <p v-if="retrieval && !retrieval.results.length" class="empty">
            没有检索到相关 Chunk。
          </p>

          <article
            v-for="(item, index) in retrieval?.results || []"
            :key="`${item.documentId}-${item.chunkIndex}-${index}`"
            class="result-card"
          >
            <header>
              <strong>{{ item.filename || "未知文件" }}</strong>
              <span>相似度 {{ formatScore(item.score) }}</span>
            </header>
            <p class="meta">
              Chunk #{{ item.chunkIndex }} · {{ item.documentId }}
            </p>
            <p class="chunk-text">{{ item.text }}</p>
          </article>
        </section>
      </div>

      <form class="composer" @submit.prevent="onSearch">
        <div class="composer-input">
          <textarea
            v-model="question"
            rows="4"
            :disabled="searching"
            placeholder="请输入您的问题..."
          />
          <button
            type="submit"
            class="send-btn"
            :disabled="searching || !question.trim()"
            aria-label="发送"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M3.4 20.4l17.45-8.3a1 1 0 0 0 0-1.8L3.4 1.99a1 1 0 0 0-1.4.95v4.2c0 .5.36.92.85 1l11.15 1.86L2.85 11.86c-.49.08-.85.5-.85 1v4.59c0 .72.74 1.2 1.4.86z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </form>
    </main>
  </div>
</template>
