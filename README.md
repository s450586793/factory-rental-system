# 厂房出租管理系统

更新时间：2026-04-04 13:36 CST

单超级用户使用的厂房出租管理后台，采用单仓库前后端分离架构：

- 前端：`Vue 3 + Vite + TypeScript + Element Plus`
- 后端：`NestJS + TypeORM + PostgreSQL`
- 部署：`Docker Compose`
- 镜像发布：`GitHub Actions + GHCR`
- API 文档：运行后访问 `/api/docs`

## 当前功能

- 超级用户登录与登录态校验
- 厂房管理、合同历史、营业执照和合同附件管理
- 水表/电表配置与水电收费记录
- 房租收费记录、押金记录
- 收据 PDF 生成、查看与作废

## 仓库结构

```text
frontend/                Vue 前端
backend/                 Nest 后端
docs/                    开发、环境变量、数据库、群晖部署文档
.github/workflows/       GitHub Actions 工作流
docker-compose.yml       源码构建版 compose
docker-compose.ghcr.yml  GHCR 镜像部署版 compose
```

根目录的 `index.html`、`app.js`、`style.css` 仅保留为早期静态原型参考，不是正式入口。

## 快速开始

### 本地源码构建

```bash
cp .env.example .env
docker compose up -d --build
```

源码构建版会暴露这三个端口，便于本地调试：

- PostgreSQL：`localhost:5432`
- 前端：`http://localhost:8080`
- 后端：`http://localhost:3000/api`
- Swagger：`http://localhost:3000/api/docs`

### 群晖 / GHCR 镜像部署

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

`docker-compose.ghcr.yml` 已包含 `postgres`、`backend`、`frontend` 三个服务；数据库镜像直接使用官方 `postgres:16`。

部署版 compose 的默认策略：

- 外部只暴露前端：`http://localhost:8080`
- `backend` 与 `postgres` 只走容器内互联：`backend -> postgres:5432`
- 前端通过容器网络访问后端：`frontend -> backend:3000`
- 如果使用群晖反向代理，优先把外部域名代理到前端容器端口，不单独暴露后端或数据库

## 工程约定

- 数据库生产默认走 migration，不依赖 `DB_SYNCHRONIZE=true`
- 后端容器启动顺序为：`migration -> seed admin -> start app`
- 健康检查使用 `/api/health`
- 前端接口类型已切到 `frontend/src/generated/openapi.ts`，后续可通过 `npm run generate:api` 刷新

## 文档索引

- [开发环境说明](./docs/development-setup.md)
- [环境变量说明](./docs/env-reference.md)
- [群晖部署说明](./docs/synology-deploy.md)
- [数据库迁移说明](./docs/database-migrations.md)
- [数据库表结构说明](./docs/database-schema.md)

## Docker 文件说明

- [docker-compose.yml](./docker-compose.yml)
  源码构建版，适合本地开发和自建镜像调试
- [docker-compose.ghcr.yml](./docker-compose.ghcr.yml)
  GHCR 镜像部署版，适合群晖 GUI 直接粘贴或服务器直接启动
- [.env.example](./.env.example)
  本地源码构建版环境变量模板
- [.env.ghcr.example](./.env.ghcr.example)
  GHCR 部署版参数检查清单，用于替换 `docker-compose.ghcr.yml` 里的默认占位值

## GitHub Actions

- [CI 工作流](./.github/workflows/ci.yml)
  包含 compose 校验、前后端检查、数据库 migration smoke 和镜像构建
- [Docker 发布工作流](./.github/workflows/docker-publish.yml)
  在推送到 `main` / `master` 或打 `v*` tag 时，把前后端镜像推送到 GHCR
