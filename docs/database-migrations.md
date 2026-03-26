# 数据库迁移说明

## 当前策略

- 生产默认：`DB_SYNCHRONIZE=false`
- 建表与升级：通过 TypeORM migration
- 管理员初始化：通过 seed 脚本

## 常用命令

```bash
cd backend
npm install
npm run migration:run
npm run seed:admin
```

生成新 migration：

```bash
npm run migration:generate
```

回滚最近一次 migration：

```bash
npm run migration:revert
```

## 容器启动顺序

backend 容器入口会自动执行：

1. `node dist/database/run-migrations.js`
2. `node dist/database/seed-admin.js`
3. `node dist/main.js`

## 兼容旧数据库

仓库内的初始 migration 采用幂等写法，能兼容早期通过 `synchronize` 建出的现有表结构并把 migration 基线补齐。

## 备份与恢复

推荐至少保留两种备份方式：

- 文件级备份：备份 `./volumes/postgres`
- 数据库级备份：使用 `pg_dump`

示例：

```bash
docker exec -t factory-rental-postgres pg_dump -U postgres -d factory_rental > factory_rental.sql
```

恢复：

```bash
cat factory_rental.sql | docker exec -i factory-rental-postgres psql -U postgres -d factory_rental
```
