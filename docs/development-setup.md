# 开发环境说明

## 环境要求

- Node.js 20
- npm 10 或兼容版本
- PostgreSQL 16
- Docker / Docker Compose（推荐）

## 后端开发

```bash
cd backend
npm install
npm run migration:run
npm run seed:admin
npm run start:dev
```

后端默认读取根目录或 `backend` 当前工作目录下的 `.env` / `.env.local`。

常用命令：

- `npm run build`
- `npm test`
- `npm run migration:run`
- `npm run migration:generate`
- `npm run seed:admin`

## 前端开发

```bash
cd frontend
npm install
npm run dev
```

常用命令：

- `npm run type-check`
- `npm run build`
- `npm test`
- `npm run generate:api`

`npm run generate:api` 默认从 `http://localhost:3000/api/docs-json` 读取 OpenAPI 文档并刷新 `src/generated/openapi.ts`。

## 一体化本地启动

推荐直接使用 compose：

```bash
cp .env.example .env
docker compose up -d --build
```

这种方式会自动启动 PostgreSQL、backend、frontend，并在 backend 容器启动时执行 migration 和管理员初始化。
