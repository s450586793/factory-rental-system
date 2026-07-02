# 群晖部署说明

## 方式一：直接粘贴 GHCR compose

适用于群晖 Container Manager 图形界面。

1. 在 GitHub Actions 确认镜像已经发布到 GHCR
2. 在群晖新建 Compose 项目
3. 直接粘贴仓库里的 `docker-compose.ghcr.yml`
4. 按实际环境替换以下占位值：

- `POSTGRES_PASSWORD`
- `DB_PASSWORD`
- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `FRONTEND_ORIGIN`
- `COOKIE_SECURE`
- `API_DOCS_ENABLED`
- 如需 Web 端一键更新，再按“Web 端更新”章节启用覆盖配置

5. 如有反向代理，按实际访问域名修改：

- HTTPS：`https://your-domain`

6. `docker-compose.ghcr.yml` 默认只暴露前端 `8080:80`

- 外部浏览器只访问前端
- `backend` 通过 `backend:3000` 提供 API
- `postgres` 通过 `postgres:5432` 提供数据库
- 不建议在群晖对外单独开放后端或数据库端口
- 生产默认关闭 Swagger：`API_DOCS_ENABLED=false`
- 生产默认只支持 HTTPS 安全 Cookie：`COOKIE_SECURE=true`

## 方式二：服务器命令行部署

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

## Web 端更新

Web 端更新功能默认关闭。启用后，登录用户可以在侧栏点击“更新系统”，后端会通过宿主机 Docker socket 启动一个一次性 updater 容器，执行：

```bash
docker compose -f docker-compose.ghcr.yml pull backend frontend
docker compose -f docker-compose.ghcr.yml up -d --remove-orphans
```

命令行部署时使用覆盖文件启用：

```bash
WEB_UPDATE_PROJECT_DIR=/volume1/docker/factory-rental-system \
docker compose -f docker-compose.ghcr.yml -f docker-compose.web-update.yml up -d
```

`WEB_UPDATE_PROJECT_DIR` 必须是 DSM 上保存 `docker-compose.ghcr.yml`、`volumes/` 的宿主机绝对路径。覆盖文件会把这个路径以同一路径挂入 backend 和 updater 容器，确保相对数据卷仍然解析到原来的 PostgreSQL 与附件目录。

覆盖文件默认设置 `WEB_UPDATE_COMPOSE_FILES=docker-compose.ghcr.yml,docker-compose.web-update.yml`，更新时会同时加载主 compose 和 Web 更新覆盖配置，避免服务重建后按钮功能被关闭。

安全注意：

- 覆盖文件会把 `/var/run/docker.sock` 挂给 backend，等同授予 Docker 管理权限
- 仅建议在单管理员、强密码、HTTPS 或可信内网环境启用
- 不需要 Web 更新时，不要加载 `docker-compose.web-update.yml`
- 群晖 GUI 如果不能设置多 compose 文件，需在项目 YAML 中手动合并覆盖文件里的 backend `environment` 和 `volumes`

## 反向代理建议

- 外部只暴露前端服务即可
- backend 与 postgres 优先走容器内服务名通信
- 建议在 DSM 控制面板申请 Let's Encrypt 证书，并把外部 HTTP 自动跳转到 HTTPS
- DSM 反向代理目标填写前端容器端口，例如 `http://127.0.0.1:8080`
- `FRONTEND_ORIGIN` 必须填写浏览器实际访问来源，例如 `https://rent.example.com`
- HTTPS 反代必须保持 `COOKIE_SECURE=true`
- 如果反代目标端口不是 `8080`，直接修改 compose 中 frontend 的 `ports` 映射左侧端口

## 生产安全项

- 保持 `API_DOCS_ENABLED=false`，避免公网暴露 `/api/docs` 和 `/api/docs-json`
- 保持 `COOKIE_SECURE=true`，避免登录态 Cookie 在明文 HTTP 下发送
- 不要继续使用 compose 文件中的 `change-this-*` 占位密码
- 登录接口已有应用层限速；如公网流量较大，可在 DSM 或上游 Nginx 对 `/api/auth/login` 继续加频率限制

## 健康检查

backend 健康检查使用：

```text
/api/health
```

只要 backend 完整启动并连上数据库，该接口会返回 200。

## 持久化目录

- PostgreSQL 数据：`./volumes/postgres`
- 附件与收据：`./volumes/storage`

群晖实际部署时可替换成绝对路径挂载。
