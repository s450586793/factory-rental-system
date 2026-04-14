# 厂房出租管理系统

> 此项目由 Codex 生成，并按实际业务需求持续迭代。

当前版本：V0.1.6

更新时间：2026-04-14 18:08 CST

版本规则：小修复递增补丁号（例如 `V0.1.2`），大功能或结构调整递增小版本号（例如 `V0.2.0`）。

单超级用户使用的厂房出租管理后台，采用单仓库前后端分离架构：

- 前端：`Vue 3 + Vite + TypeScript + Element Plus`
- 后端：`NestJS + TypeORM + PostgreSQL`
- 部署：`Docker Compose`
- 镜像发布：`GitHub Actions + GHCR`
- API 文档：运行后访问 `/api/docs`

## 更新历史

- `2026-04-14 18:08 CST` `V0.1.6` 编辑合同弹窗按钮文案由“保存合同”调整为“保存”
- `2026-04-14 17:51 CST` `V0.1.5` 收据开具默认使用原付款日期，不再写死生成当天日期
- `2026-04-14 16:42 CST` `V0.1.4` 修复编辑合同时点击“保存合同”误触发下载合同
- `2026-04-14 13:41 CST` `V0.1.3` 侧栏版本号移动到右下角
- `2026-04-14 13:02 CST` `V0.1.2` 修复 GitHub Actions 后端测试类型错误，保证镜像发布链路可继续执行
- `2026-04-14 12:57 CST` `V0.1.1` 左下角与 README 增加版本号，修复附件上传 413 与镜像发布构建失败
- `2026-04-10 13:52 CST` `74cc4f8` README 更新历史改为按时间降序展示
- `2026-04-10 11:00 CST` `80c9f54` README 标注项目由 Codex 生成并补全历史记录
- `2026-04-06 11:01 CST` `d361731` 合同 PDF 生成字体调整为更接近原模板的宋体系
- `2026-04-05 21:57 CST` `1a864ba` 新增基于 PDF 模板的合同 PDF 生成与下载
- `2026-04-05 01:50 CST` `d5c45dd` 修复合同文件下载兼容与前端缓存问题
- `2026-04-04 13:40 CST` `1e3b8c7` 新增保存后直接下载合同文件的流程
- `2026-04-03 13:27 CST` `abaa3c0` 收据排版与合同历史表格进一步收口
- `2026-04-03 02:45 CST` `cea7410` 收据日期版式和统计卡片布局修正
- `2026-04-03 02:09 CST` `afa5f44` 收据模板与统计卡片排版调整
- `2026-04-02 23:14 CST` `cc6af80` 收据版式和统计区单行布局调整
- `2026-04-02 18:58 CST` `dd1268d` 新增按 Word 模板生成收费收据
- `2026-04-01 16:44 CST` `55dfa21` 收据 PDF 版式细调
- `2026-04-01 16:02 CST` `9f6cb4b` 修正厂房状态判断和收据版式
- `2026-04-01 12:08 CST` `ab48514` 新增合同生成入口和收据模板流程
- `2026-04-01 11:11 CST` `812146e` 厂房状态新增“已到期”
- `2026-04-01 10:36 CST` `5a333e1` 刷新 README 时间
- `2026-04-01 10:11 CST` `deb99dc` 简化厂房管理仪表板头部
- `2026-04-01 09:49 CST` `d7a56c9` 增加收据状态并支持页内预览
- `2026-04-01 01:13 CST` `55427e4` 修复房租收据生成
- `2026-03-31 22:50 CST` `b077c74` 房租收费录入弹窗显示选中合同欠费
- `2026-03-31 20:54 CST` `264bca7` 房租收费合同选择器隐藏已付清合同
- `2026-03-31 20:29 CST` `1543396` 厂房列表列间距继续压缩
- `2026-03-31 18:53 CST` `ff57414` 增加合同欠费展示
- `2026-03-31 16:16 CST` `7600079` 使用本地日期判断状态并隐藏厂房租金金额
- `2026-03-31 00:29 CST` `906d5e8` 默认隐藏租金汇总金额
- `2026-03-31 00:06 CST` `20e596d` 恢复厂房“即将到期”状态
- `2026-03-30 18:53 CST` `beb1850` 修复厂房详情弹窗溢出布局
- `2026-03-30 18:40 CST` `cb2f3a0` 合同新增负责人和营业执照代码字段
- `2026-03-30 18:07 CST` `28cbe82` 持久化附件命名改为可读格式
- `2026-03-29 13:08 CST` `d55ced1` 厂房详情表格限制在面板内部滚动
- `2026-03-29 12:58 CST` `4f9944d` 厂房管理改为居中弹窗并统一面板宽度
- `2026-03-29 11:44 CST` `db85f86` 二层区块操作按钮与顶栏行为对齐
- `2026-03-28 18:05 CST` `964de96` 将页面主操作移入统一顶栏
- `2026-03-28 17:40 CST` `af45fc4` 进一步修正手机端顶部操作按钮位置
- `2026-03-28 17:30 CST` `c4033c4` 保持移动端右上操作区固定
- `2026-03-28 17:20 CST` `7da0feb` 修正移动端页头间距
- `2026-03-28 16:48 CST` `168b32f` 完成移动端页面适配
- `2026-03-28 13:04 CST` `5363f3f` 新增厂房面积字段
- `2026-03-27 17:23 CST` `167ec4f` 移除侧栏模式切换按钮
- `2026-03-27 17:05 CST` `76a4f94` 新增合同默认继承最新一期合同信息
- `2026-03-27 16:50 CST` `24a5b82` 厂房编号重复时显示明确错误
- `2026-03-27 16:45 CST` `a9fd314` Element Plus 日期选择器本地化中文
- `2026-03-27 10:54 CST` `643a62e` 窄屏下页面按钮换行优化
- `2026-03-27 09:57 CST` `f9999d6` 合同附件支持页内预览
- `2026-03-27 09:47 CST` `b72f8fe` 保留新增合同时更准确的错误提示
- `2026-03-27 09:27 CST` `4fc3e92` 合并厂房详情与编辑流程
- `2026-03-27 09:16 CST` `6febdcd` 启动时兼容老合同表结构
- `2026-03-27 09:04 CST` `a487a5f` 新增厂房时支持录入初始合同字段
- `2026-03-26 16:31 CST` `cbf8d3e` 刷新 README 更新时间
- `2026-03-26 14:16 CST` `14f48b8` 将用户菜单移到侧栏底部
- `2026-03-26 11:47 CST` `ad410c4` 简化前端壳层布局
- `2026-03-26 10:33 CST` `00a38b4` 补齐工程化架构、迁移和部署工作流
- `2026-03-26 00:55 CST` `931d6ad` 修复 PostgreSQL 下可空文本字段声明
- `2026-03-26 00:09 CST` `12ec3c3` 内联群晖 GHCR 部署配置
- `2026-03-25 23:49 CST` `be331c2` 设置 GHCR 部署默认镜像
- `2026-03-25 23:48 CST` `00e124c` 加固 compose 部署配置
- `2026-03-25 23:40 CST` `dce9991` 修复 CI 中 compose 校验环境
- `2026-03-25 23:38 CST` `e926bf3` README 增加更新时间
- `2026-03-25 23:26 CST` `0c92066` 修复 GitHub README 链接和 Docker 说明
- `2026-03-25 19:36 CST` `5fcd72e` 建立厂房出租管理系统前后端基础结构
- `2026-03-25 19:34 CST` `fcf2eab` 初始化 Git 仓库

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
