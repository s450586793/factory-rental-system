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

5. 如有反向代理，按实际访问域名修改：

- HTTP：`http://your-domain:port`
- HTTPS：`https://your-domain`

6. `docker-compose.ghcr.yml` 默认只暴露前端 `8080:80`

- 外部浏览器只访问前端
- `backend` 通过 `backend:3000` 提供 API
- `postgres` 通过 `postgres:5432` 提供数据库
- 不建议在群晖对外单独开放后端或数据库端口

## 方式二：服务器命令行部署

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

## 反向代理建议

- 外部只暴露前端服务即可
- backend 与 postgres 优先走容器内服务名通信
- 如果使用 HTTPS 反代，记得把 `COOKIE_SECURE=true`
- 如果反代目标端口不是 `8080`，直接修改 compose 中 frontend 的 `ports` 映射左侧端口

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
