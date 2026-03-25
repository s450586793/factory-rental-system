# 厂房出租管理系统

更新时间：2026-03-26 00:07 CST

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
- 两份 compose 都已经包含启动依赖、健康检查、持久化目录和可配置端口，可直接拉起完整项目

表结构说明见 [docs/database-schema.md](./docs/database-schema.md)。

## 方式一：源码构建启动

1. 复制环境变量模板

```bash
cp .env.example .env
```

2. 按需修改 `.env`，至少设置这些值：

```env
TZ=Asia/Shanghai
POSTGRES_PORT=5432
BACKEND_PORT=3000
FRONTEND_PORT=8080
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

这个 compose 会一次启动 `postgres`、`backend`、`frontend`，并自动挂载：

- `./volumes/postgres` 数据库数据
- `./volumes/storage` 上传文件和收据文件

默认端口：

- 前端：`http://localhost:8080`
- 后端：`http://localhost:3000/api`
- 数据库：`localhost:5432`

## 方式二：使用 GHCR 镜像部署

前提：仓库的 Docker 发布工作流已经成功把前后端镜像推送到 GHCR。

这种方式已经改成单文件部署，适合群晖 Container Manager 的 GUI 直接新建 compose 项目。

1. 直接使用 [docker-compose.ghcr.yml](./docker-compose.ghcr.yml)

群晖 GUI 里新建项目时，直接粘贴这个文件内容即可，不需要再准备 `.env.ghcr`。

2. 在 compose 文件里直接修改这些值

必须改：

- `POSTGRES_PASSWORD`
- `DB_PASSWORD`
- `JWT_SECRET`
- `FRONTEND_ORIGIN`
- `ADMIN_PASSWORD`

建议按需改：

- 前端端口 `8080:80`
- 后端端口 `3000:3000`
- 数据库端口 `5432:5432`
- `COOKIE_SECURE`
- `DB_SYNCHRONIZE`

3. 直接部署整套项目

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

这个 compose 同样会一次启动 `postgres`、`backend`、`frontend`，并包含：

- PostgreSQL 持久化目录 `./volumes/postgres`
- 文件存储目录 `./volumes/storage`
- `postgres -> backend -> frontend` 的健康检查和启动依赖
- 固定的 GHCR 镜像地址
- 固定默认端口，改 compose 文件即可调整

这个模式下，前后端直接拉取 GHCR 镜像，数据库仍然使用官方 `postgres:16`。

## 补充说明

- [docker-compose.yml](./docker-compose.yml) 用于本地从源码构建前后端镜像
- [docker-compose.ghcr.yml](./docker-compose.ghcr.yml) 用于群晖 GUI 直接粘贴部署
- [`.env.ghcr.example`](./.env.ghcr.example) 现在仅作为参数参考，不是 GHCR 部署必需文件
- 当前环境如果没有 `node`、`npm` 或 `docker`，则无法在本机实际完成前后端构建或容器启动验证
- 仓库里可能存在与本系统无关的其他目录时，应通过 `.gitignore` 或目录清理避免误提交
