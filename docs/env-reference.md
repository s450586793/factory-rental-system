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
- `API_DOCS_ENABLED`
  是否暴露 Swagger/OpenAPI 文档。生产建议 `false`，本地联调可设为 `true`

## 鉴权层

- `JWT_SECRET`
  JWT 密钥，必须设置为高强度随机字符串
- `COOKIE_NAME`
  登录态 Cookie 名称，默认 `token`
- `COOKIE_SECURE`
  HTTPS 部署必须设为 `true`；仅本地 HTTP 调试可设为 `false`
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

## Web 端更新

- `WEB_UPDATE_ENABLED`
  是否启用 Web 端“更新系统”按钮，默认 `false`
- `WEB_UPDATE_DOCKER_SOCKET`
  Docker socket 路径，默认 `/var/run/docker.sock`
- `WEB_UPDATE_PROJECT_DIR`
  DSM 宿主机上的 compose 项目绝对路径，启用 Web 更新时必须配置
- `WEB_UPDATE_COMPOSE_FILES`
  用于更新的 compose 文件名列表，多个文件用英文逗号分隔；GHCR Web 更新默认 `docker-compose.ghcr.yml,docker-compose.web-update.yml`
- `WEB_UPDATE_RUNNER_IMAGE`
  一次性 updater 容器镜像，默认 `docker:27-cli`
- `WEB_UPDATE_SERVICES`
  拉取镜像时限定的服务列表，默认 `backend,frontend`
- `WEB_UPDATE_PROXY_URL`
  DSM 访问 GitHub 或 GHCR 需要代理时填写，例如 `http://192.168.0.6:7890`；会用于查询线上版本，也会传入 updater 容器拉取镜像
- `WEB_UPDATE_NO_PROXY`
  不走代理的地址列表，例如 `localhost,127.0.0.1,postgres,factory-rental-postgres,192.168.0.0/16,.local`
- `WEB_UPDATE_ONLINE_VERSION_TIMEOUT_MS`
  查询线上版本的超时时间，默认 `5000`，最小 `1000`

启用 Web 端更新需要额外挂载 Docker socket。默认 compose 不挂载该权限，需显式加载 `docker-compose.web-update.yml`。

## Compose 端口变量

- `POSTGRES_PORT`
- `BACKEND_PORT`
- `FRONTEND_PORT`

这些变量只用于源码构建版 `docker-compose.yml` 的宿主机端口映射，不影响容器间互联。部署版 `docker-compose.ghcr.yml` 默认只暴露前端端口，backend 与 postgres 不向宿主机开放。

容器内部通信固定使用：

- `postgres:5432`
- `backend:3000`
