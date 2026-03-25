# 厂房出租管理系统

这是一个面向单超级用户的厂房出租管理后台，已经整理成可直接发布到 GitHub 的前后端分离项目。

## 技术栈

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
- Docker 部署与 GitHub Actions 自动构建镜像

## 仓库结构

```text
frontend/              Vue 前端
backend/               Nest 后端
.github/workflows/     GitHub Actions 工作流
docs/                  说明文档
docker-compose.yml     本地/源码构建版 compose
docker-compose.ghcr.yml GHCR 镜像部署版 compose
index.html             旧静态原型参考
app.js                 旧静态原型参考
style.css              旧静态原型参考
```

根目录的 `index.html`、`app.js`、`style.css` 仍然保留，作为最早期静态原型参考，不是正式入口。

## GitHub 发布能力

已经补好了两套 GitHub Actions：

- [CI 工作流](/Users/ace/Downloads/锦成租房系统/.github/workflows/ci.yml)
  每次 push / PR 会校验 `docker-compose` 配置，并构建前后端 Docker 镜像，确保仓库状态可发布。

- [Docker 发布工作流](/Users/ace/Downloads/锦成租房系统/.github/workflows/docker-publish.yml)
  在推送到 `main` / `master` 或打 `v*` tag 时，会自动把前后端镜像推送到 `GHCR`。

发布后的镜像命名规则为：

- `ghcr.io/<github-owner>/<repo>-backend`
- `ghcr.io/<github-owner>/<repo>-frontend`

数据库容器不需要自定义构建镜像，直接使用官方 `postgres:16`，并在部署版 compose 里已经包含：

- [docker-compose.ghcr.yml](/Users/ace/Downloads/锦成租房系统/docker-compose.ghcr.yml)

## 数据库与表

- 数据库容器已包含在源码版和 GHCR 部署版 `compose` 中
- 表结构由 TypeORM 实体自动建表
- 默认通过 `DB_SYNCHRONIZE=true` 在第一次启动 `backend` 时自动创建

表说明见：

- [database-schema.md](/Users/ace/Downloads/锦成租房系统/docs/database-schema.md)

## 本地源码启动

### 1. 准备环境变量

```bash
cp .env.example .env
```

### 2. 启动 PostgreSQL + 后端 + 前端

```bash
docker compose up -d --build
```

默认端口：

- 前端：`http://localhost:8080`
- 后端：`http://localhost:3000/api`
- 数据库：`localhost:5432`

## GHCR 镜像部署

### 1. 准备部署环境变量

```bash
cp .env.ghcr.example .env.ghcr
```

把下面两个镜像地址改成你自己的 GitHub 仓库镜像：

- `BACKEND_IMAGE`
- `FRONTEND_IMAGE`

### 2. 使用 GHCR 部署版 compose

```bash
docker compose --env-file .env.ghcr -f docker-compose.ghcr.yml up -d
```

## 推送到 GitHub 的建议步骤

当前目录还不是 Git 仓库，也还没有绑定远程仓库，所以我现在不能直接替你推送到 GitHub。但代码已经整理成可直接发布的状态。你本机可以这样做：

```bash
git init
git add .
git commit -m "feat: initial factory rental management system"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

## 说明

- `README.md` 已恢复为项目说明，之前被外部日志污染的内容已经清理
- 当前工作区里还有一个与本系统无关的 `3D打印设计` 目录；如果你不想把它一起发到 GitHub，建议在推送前移出本目录或补充忽略规则
- 当前环境没有 `node`、`npm`、`docker`，所以我还不能在本地实际跑构建和 GitHub 推送，只能把代码和工作流准备齐
