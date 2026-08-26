# reader
基于 Cloudflare Workers + Vue + Embedding + Vector Store + LLM 实现的个人 RAG 知识库。

当前进度：第二阶段（向量检索）。问题用 Cloudflare Workers AI Embedding 向量化后检索 Top-K；Gemini 最终回答尚未启用。

## Project Structure

frontend/   前端
worker/     RAG API 后端（Cloudflare Worker）

## Deployment

Frontend → Cloudflare Pages
Backend  → Cloudflare Workers

## Cloudflare

R2 存储路径：https://asset.jasonbai.dpdns.org/rag/

## 目录结构

```
reader/
│
├── worker/                  ← 后端 Worker
│   ├── src/
│   │   ├── index.js         ← Worker 入口与路由分发
│   │   ├── routes/
│   │   │   ├── chat.js      ← 第三阶段占位
│   │   │   ├── upload.js    ← 文档上传与索引流水线
│   │   │   ├── search.js    ← POST /api/search
│   │   │   └── documents.js ← 文件列表 / 删除
│   │   │
│   │   ├── rag/
│   │   │   ├── chunk.js     ← 文本切分
│   │   │   ├── embed.js     ← Workers AI Embedding（@cf/qwen/qwen3-embedding-0.6b）
│   │   │   └── retrieve.js  ← Query Embedding + Vectorize Top-K
│   │   │
│   │   ├── services/
│   │   │   ├── storage.js   ← R2 原文件与文档元数据
│   │   │   ├── parser.js    ← TXT / Markdown / PDF 解析
│   │   │   └── vectorize.js ← Vectorize 写入、删除与查询
│   │   │
│   │   └── utils/
│   │       ├── response.js
│   │       ├── validation.js
│   │       ├── text.js
│   │       └── document.js
│   │
│   ├── wrangler.jsonc
│   ├── package.json
│   └── .dev.vars
│
├── frontend/                ← 前端 Pages
│   ├── index.html
│   ├── style.css
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue
│   │   └── api.js
│   ├── package.json
│   └── vite.config.js
│
├── docs/                    ← 文档目录
│
└── README.md
```

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
