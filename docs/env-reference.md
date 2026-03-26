# 环境变量说明

## 应用层

- `APP_NAME`
  应用名，默认 `factory-rental-system`
- `NODE_ENV`
  运行环境，建议生产为 `production`
- `PORT`
  后端监听端口，容器内固定建议 `3000`
- `FRONTEND_ORIGIN`
  允许跨域的前端来源，多个地址可用英文逗号分隔

## 鉴权层

- `JWT_SECRET`
  JWT 密钥，必须设置为高强度随机字符串
- `COOKIE_NAME`
  登录态 Cookie 名称，默认 `token`
- `COOKIE_SECURE`
  生产 HTTPS 场景建议设为 `true`
- `ADMIN_USERNAME`
  超级管理员用户名
- `ADMIN_PASSWORD`
  超级管理员密码；容器启动 seed 会以此初始化或重置管理员密码

## 数据库层

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_SYNCHRONIZE`

说明：

- 生产默认应为 `false`
- 仅本地临时开发才建议改成 `true`
- 正式部署依赖 migration，不依赖自动建表

## 存储层

- `STORAGE_ROOT`
  上传文件、收据 PDF、临时文件的根目录
- `PDF_FONT_PATH`
  收据 PDF 使用的中文字体路径

## Compose 端口变量

- `POSTGRES_PORT`
- `BACKEND_PORT`
- `FRONTEND_PORT`

这些变量只用于源码构建版 `docker-compose.yml` 的宿主机端口映射，不影响容器间互联。部署版 `docker-compose.ghcr.yml` 默认只暴露前端端口，backend 与 postgres 不向宿主机开放。

容器内部通信固定使用：

- `postgres:5432`
- `backend:3000`
