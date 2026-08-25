# reader
基于 Cloudflare Workers + Vue + Embedding + Vector Store + LLM 实现的个人 RAG 知识库。

## Project Structure

frontend/   前端
backend/    RAG API 后端

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
│   │   ├── index.js         ← Worker 入口
│   │   ├── routes/
│   │   │   ├── chat.js
│   │   │   ├── upload.js
│   │   │   └── search.js
│   │   │
│   │   ├── rag/
│   │   │   ├── chunk.js
│   │   │   ├── embed.js
│   │   │   └── retrieve.js
│   │   │
│   │   └── utils/
│   │
│   ├── wrangler.jsonc
│   ├── package.json
│   └── .dev.vars
│
├── frontend/                ← 前端 Pages
│   ├── index.html
│   └── style.css
│
├── prompts/                 ← 提示词文件
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
    frontend/                 backend/
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