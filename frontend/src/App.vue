<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import {
  askChat,
  deleteDocument,
  listDocuments,
  uploadDocument,
} from "./api.js";
import { renderMarkdown } from "./markdown.js";

const documents = ref([]);
const uploading = ref(false);
const deletingId = ref("");
const toast = ref(null);

let toastTimer = 0;
let toastSeq = 0;

function showToast(message, type = "info") {
  clearTimeout(toastTimer);
  toast.value = { id: ++toastSeq, message, type };
  // 进行中提示保持到下一次覆盖；成功 / 错误自动收起。
  if (type !== "info") {
    toastTimer = setTimeout(
      () => {
        toast.value = null;
      },
      type === "error" ? 5000 : 3500,
    );
  }
}

const chunkSize = ref(1200);
const chunkOverlap = ref(150);
const topK = ref(3);
const fileInput = ref(null);

const question = ref("");
const searching = ref(false);
const lastQuery = ref("");
const chatResult = ref(null);

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
  const data = await listDocuments();
  documents.value = data.documents || [];
}

onMounted(async () => {
  try {
    await refreshList();
  } catch (err) {
    showToast(err.message, "error");
  }
});

onUnmounted(() => {
  clearTimeout(toastTimer);
});

function triggerUpload() {
  fileInput.value?.click();
}

async function onFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  uploading.value = true;
  showToast(
    `正在处理「${file.name}」：解析 → Chunk → Embedding → Vectorize`,
    "info",
  );

  try {
    const result = await uploadDocument(file, {
      chunkSize: Number(chunkSize.value),
      chunkOverlap: Number(chunkOverlap.value),
    });
    await refreshList();
    if (result.status === "completed") {
      showToast(
        `「${result.filename}」已完成索引，共 ${result.chunkCount} 个 Chunk。`,
        "success",
      );
    } else {
      showToast(result.error || "文档处理失败。", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
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
      `确定删除「${doc.filename}」？将同时删除 R2 原文件和 Vectorize 中的向量。`,
    )
  ) {
    return;
  }

  deletingId.value = doc.documentId;
  try {
    await deleteDocument(doc.documentId);
    await refreshList();
    showToast(`已删除「${doc.filename}」。`, "success");
  } catch (err) {
    showToast(err.message, "error");
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

  // 已捕获 query 到 lastQuery，立即清空输入框，方便用户继续追问。
  question.value = "";
  searching.value = true;
  lastQuery.value = query;
  chatResult.value = null;
  showToast("正在思考…", "info");

  try {
    chatResult.value = await askChat(query, Number(topK.value) || 3);
    showToast("回答已生成。", "success");
  } catch (err) {
    chatResult.value = null;
    showToast(err.message, "error");
  } finally {
    searching.value = false;
  }
}
</script>

<template>
  <div class="app-shell">
    <Teleport to="body">
      <Transition name="toast">
        <div
          v-if="toast"
          :key="toast.id"
          :class="['toast', toast.type]"
          role="status"
        >
          {{ toast.message }}
        </div>
      </Transition>
    </Teleport>
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
          <p class="param-note">单个片段字符数，默认 1200</p>
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
          <p class="param-note">相邻片段重叠字符数，默认 150</p>
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
          <p class="param-note">检索返回的片段数量，默认 3</p>
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
          v-if="!chatResult && !searching && !lastQuery"
          class="placeholder-card"
        >
          <!-- 空态：介绍 / 使用方法 / 开发者 / 技术栈，自上而下单列 -->
          <div class="placeholder-content">
            <p class="placeholder-intro">
              一个基于 Cloudflare Workers 的个人 RAG 知识库问答应用
            </p>

            <section class="placeholder-section">
              <h3 class="placeholder-title">使用方法</h3>
              <ol class="usage-steps">
                <li>
                  <span class="step-label">Step 1</span>
                  <span class="step-text"
                    >在左侧上传 TXT / Markdown / PDF 文档并完成索引</span
                  >
                </li>
                <li>
                  <span class="step-label">Step 2</span>
                  <span class="step-text"
                    >在底部输入框对文档内容提问，Enter 或点击发送</span
                  >
                </li>
              </ol>
            </section>

            <section class="placeholder-section">
              <h3 class="placeholder-title">开发者</h3>
              <ul class="tech-list">
                <li>
                  <span class="tech-label">作者</span>
                  <span class="tech-value">Jason Bai</span>
                </li>
                <li>
                  <span class="tech-label">系统设计</span>
                  <span class="tech-value">gpt-5.6-sol</span>
                </li>
                <li>
                  <span class="tech-label">编码辅助</span>
                  <span class="tech-value">cursor-grok-4.6</span>
                </li>
              </ul>
            </section>

            <section class="placeholder-section">
              <h3 class="placeholder-title">技术栈</h3>
              <ul class="tech-list">
                <li>
                  <span class="tech-label">前端</span>
                  <span class="tech-value">Vue 3.5</span>
                </li>
                <li>
                  <span class="tech-label">后端</span>
                  <span class="tech-value">Cloudflare Workers</span>
                </li>
                <li>
                  <span class="tech-label">嵌入向量</span>
                  <span class="tech-value">qwen3-embedding-0.6b</span>
                </li>
                <li>
                  <span class="tech-label">向量库</span>
                  <span class="tech-value">Cloudflare Vectorize</span>
                </li>
                <li>
                  <span class="tech-label">大模型</span>
                  <span class="tech-value">qwen3-30b-a3b-fp8</span>
                </li>
                <li>
                  <span class="tech-label">对象存储</span>
                  <span class="tech-value">Cloudflare R2</span>
                </li>
                <li>
                  <span class="tech-label">PDF 解析</span>
                  <span class="tech-value">unpdf</span>
                </li>
              </ul>
            </section>
          </div>
        </div>

        <section v-if="lastQuery || chatResult" class="retrieval">
          <article class="query-card">
            <p class="eyebrow">Query</p>
            <h2>{{ lastQuery }}</h2>
            <p v-if="chatResult" class="debug-line">
              Top-K {{ chatResult.topK }} · 参考
              {{ chatResult.sources?.length || 0 }} 条
            </p>
          </article>

          <article v-if="chatResult?.answer" class="result-card answer-card">
            <p class="eyebrow">Answer</p>
            <div
              class="answer-body"
              v-html="renderMarkdown(chatResult.answer)"
            ></div>
          </article>

          <section v-if="chatResult?.sources?.length" class="sources">
            <p class="eyebrow">Sources</p>
            <ul>
              <li
                v-for="(source, index) in chatResult.sources"
                :key="`${source.filename}-${source.chunkIndex}-${index}`"
              >
                <strong>{{ source.filename || "未知文件" }}</strong>
                <span>Chunk #{{ source.chunkIndex }}</span>
                <span>相似度 {{ formatScore(source.score) }}</span>
              </li>
            </ul>
          </section>
        </section>
      </div>

      <form class="composer" @submit.prevent="onSearch">
        <div class="composer-input">
          <textarea
            v-model="question"
            rows="4"
            :disabled="searching"
            placeholder="请输入您的问题..."
            @keydown.enter.exact.prevent="onSearch"
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
