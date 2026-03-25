# 厂房出租管理系统

更新时间：2026-03-25 23:38 CST

单超级用户使用的厂房出租管理后台，采用前后端分离架构：

- 前端：`Vue 3 + Vite + TypeScript + Element Plus`
- 后端：`NestJS + TypeORM + PostgreSQL`
- 部署：`Docker Compose`
- 镜像发布：`GitHub Actions + GHCR`

## 当前功能

- 超级用户登录与登录态校验
- 厂房信息管理
- 合同历史、营业执照、合同附件管理
- 水表/电表配置
- 水电收费记录与多表计汇总
- 房租收费记录
- 押金记录
- 收据 PDF 生成、查看与作废

## 仓库结构

```text
frontend/                Vue 前端
backend/                 Nest 后端
.github/workflows/       GitHub Actions 工作流
docs/                    说明文档
docker-compose.yml       源码构建版 compose
docker-compose.ghcr.yml  GHCR 镜像部署版 compose
index.html               旧静态原型参考
app.js                   旧静态原型参考
style.css                旧静态原型参考
```

根目录的 `index.html`、`app.js`、`style.css` 仅保留为早期静态原型参考，不是正式入口。

## GitHub Actions

- [CI 工作流](./.github/workflows/ci.yml)
  每次 `push` / `pull request` 会校验 `docker-compose` 配置，并构建前后端 Docker 镜像。
- [Docker 发布工作流](./.github/workflows/docker-publish.yml)
  在推送到 `main` / `master` 或打 `v*` tag 时，会自动把前后端镜像推送到 GHCR。

镜像命名规则：

- `ghcr.io/<github-owner>/<repo>-backend`
- `ghcr.io/<github-owner>/<repo>-frontend`

## 数据库与表

- 数据库容器直接使用官方 `postgres:16`
- 数据库服务已包含在 [docker-compose.yml](./docker-compose.yml) 和 [docker-compose.ghcr.yml](./docker-compose.ghcr.yml)
- 表结构由 TypeORM 实体维护
- 当 `DB_SYNCHRONIZE=true` 时，后端首次启动会自动创建表

表结构说明见 [docs/database-schema.md](./docs/database-schema.md)。

## 方式一：源码构建启动

1. 复制环境变量模板

```bash
cp .env.example .env
```

2. 按需修改 `.env`，至少设置这些值：

```env
POSTGRES_PASSWORD=your-postgres-password
DB_PASSWORD=your-postgres-password
JWT_SECRET=your-jwt-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password
FRONTEND_ORIGIN=http://localhost:8080
COOKIE_SECURE=false
DB_SYNCHRONIZE=true
```

3. 直接构建并启动：

```bash
docker compose up -d --build
```

默认端口：

- 前端：`http://localhost:8080`
- 后端：`http://localhost:3000/api`
- 数据库：`localhost:5432`

## 方式二：使用 GHCR 镜像部署

前提：仓库的 Docker 发布工作流已经成功把前后端镜像推送到 GHCR。

1. 复制部署环境变量模板

```bash
cp .env.ghcr.example .env.ghcr
```

2. 修改 `.env.ghcr`，至少确认以下值：

```env
BACKEND_IMAGE=ghcr.io/s450586793/factory-rental-system-backend:latest
FRONTEND_IMAGE=ghcr.io/s450586793/factory-rental-system-frontend:latest
DB_SYNCHRONIZE=true
```

3. 使用 GHCR 部署版 compose 启动：

```bash
docker compose --env-file .env.ghcr -f docker-compose.ghcr.yml up -d
```

这个模式下，前后端直接拉取 GHCR 镜像，数据库仍然使用官方 `postgres:16`。

## 补充说明

- [docker-compose.yml](./docker-compose.yml) 用于本地从源码构建前后端镜像
- [docker-compose.ghcr.yml](./docker-compose.ghcr.yml) 用于直接拉取 GHCR 镜像部署
- 当前环境如果没有 `node`、`npm` 或 `docker`，则无法在本机实际完成前后端构建或容器启动验证
- 仓库里可能存在与本系统无关的其他目录时，应通过 `.gitignore` 或目录清理避免误提交
