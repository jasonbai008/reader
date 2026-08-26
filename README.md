# reader
基于 Cloudflare Workers + Vue + Embedding + Vector Store + LLM 实现的个人 RAG 知识库。

## Project Structure

```
reader/
│
├── frontend/                ← 前端 Pages
│   ├── index.html
│   ├── style.css
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue          ← 左侧知识库 + 右侧问答
│   │   ├── api.js           ← /api/documents /search /chat
│   │   └── markdown.js      ← 回答区轻量 Markdown
│   ├── package.json
│   └── vite.config.js
│
├── worker/                  ← 后端 Worker
│   ├── src/
│   │   ├── index.js         ← 路由分发
│   │   ├── routes/
│   │   │   ├── chat.js      ← POST /api/chat（RAG 闭环）
│   │   │   ├── upload.js    ← 文档上传与索引流水线
│   │   │   ├── search.js    ← POST /api/search
│   │   │   └── documents.js ← 文件列表 / 删除
│   │   ├── rag/
│   │   │   ├── chunk.js     ← 文本切分
│   │   │   ├── embed.js     ← Workers AI Embedding（qwen3-embedding-0.6b）
│   │   │   ├── retrieve.js  ← Query Embedding + Vectorize Top-K
│   │   │   └── prompt.js    ← RAG Prompt（Context 与问题分离）
│   │   ├── services/
│   │   │   ├── storage.js   ← R2 原文件与文档元数据
│   │   │   ├── parser.js    ← TXT / Markdown / PDF 解析
│   │   │   ├── vectorize.js ← Vectorize 写入、删除与查询
│   │   │   └── llm.js       ← Workers AI 文本生成（qwen3-30b-a3b-fp8）
│   │   └── utils/
│   ├── wrangler.jsonc
│   └── package.json
│
├── docs/                    ← 开发提示词
└── README.md
```

## 核心 RAG 数据流

```
上传文档 → R2 → Parser → 清洗 → Chunk
       → Workers AI Embedding（文档侧 RETRIEVAL_DOCUMENT）
       → Cloudflare Vectorize

用户问题 → Workers AI Embedding（查询侧 RETRIEVAL_QUERY）
       → Vectorize Top-K
       → 组装 Context + Prompt
       → Workers AI LLM（Qwen3-30B-A3B）
       → Answer + Sources
```

本项目的 RAG 是自己把 Indexing / Retrieval / Generation 串起来的，没有使用 Cloudflare AI Search 或其它一站式 RAG 服务。向量库是 Vectorize，检索是 cosine Top-K，Prompt 在 `rag/prompt.js` 中显式约束「只能把 Context 当成知识库」。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `parser.js` | 解析 TXT / Markdown / PDF |
| `chunk.js` | 按 Chunk Size / Overlap 切分 |
| `embed.js` | 调用 Workers AI 生成 1024 维向量 |
| `vectorize.js` | 向量写入、按 id 删除、相似度查询 |
| `retrieve.js` | 问题向量化 + Top-K 检索 |
| `prompt.js` | 构造 RAG system/user messages |
| `llm.js` | 调用 Workers AI 生成最终回答 |
| `App.vue` 左侧 | 上传、删除、索引状态、RAG 参数 |
| `App.vue` 右侧 | 空态提示句、回答、参考资料、底部输入 |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，`stage: 3` |
| GET | `/api/documents` | 文档列表 |
| POST | `/api/documents` | 上传并索引 |
| DELETE | `/api/documents/:id` | 删除原文件与向量 |
| POST | `/api/search` | 只检索，不生成回答 |
| POST | `/api/chat` | 完整 RAG 问答 |

`POST /api/chat` 请求：

```json
{ "query": "这个 RAG 项目使用什么向量数据库？", "topK": 3 }
```

返回：`answer`、`sources`（filename / chunkIndex / score）、`retrievalResults`。

## Cloudflare 资源配置

- **R2**：bucket `asset`，binding `R2`，公网路径 `https://asset.jasonbai.dpdns.org/rag/`
- **Vectorize**：index `rag-chunks-qwen`，1024 维，binding `VECTORIZE`，本地 `remote: true`
- **Workers AI**：binding `AI`，本地 `remote: true`
- **Pages**：托管 `frontend/`
- **Workers**：托管 `worker/`

## 模型配置

不使用 Gemini。Embedding 与 Chat 都走已绑定的 `env.AI.run()`。

- Embedding：`@cf/qwen/qwen3-embedding-0.6b`（1024 维）
- Chat：`@cf/qwen/qwen3-30b-a3b-fp8`（可通过 `CHAT_MODEL` 覆盖）

默认 Top-K = 3。无需配置 Gemini API Key。

## 本地开发

```bash
npm run install:all
npm run dev:worker    # wrangler dev，默认 8787
npm run dev:frontend  # Vite，5173，/api 代理到 8787
```

## 部署

```bash
npm --prefix worker run deploy     # Cloudflare Workers
npm --prefix frontend run build    # 产物交给 Pages
```

前端需配置 `VITE_API_BASE` 指向 Worker 域名（本地开发走 Vite proxy，可留空）。

## 测试

正向：上传含明确事实的文档，例如「本项目使用 Cloudflare Vectorize 保存向量」，再问「这个 RAG 项目使用什么向量数据库？」。应检索到相关 Chunk，并由 Qwen3 根据 Context 回答 Vectorize，同时展示来源。

反向：问文档完全未提及的内容。应出现「知识库中没有找到足够相关的资料」，而不是编造知识库事实。

## 部署关系

```
                GitHub
                    │
            rag-project 仓库
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
    frontend/                 worker/
        │                       │
        ▼                       ▼
Cloudflare Pages          Cloudflare Workers
        │                       │
        └───────────┬───────────┘
                    │
                HTTPS API
                    │
                    ▼
                RAG 后端
```
