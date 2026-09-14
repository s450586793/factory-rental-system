# 数据库迁移说明

## 当前策略

- 生产默认：`DB_SYNCHRONIZE=false`
- 建表与升级：通过 TypeORM migration
- 管理员初始化：通过 seed 脚本

## 常用命令

```bash
cd backend
npm ci
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

使用项目的备份脚本，同时保存 PostgreSQL 一致性快照与附件、收据及生成合同文件，并在隔离数据库中实际恢复验证：

```bash
BACKUP_DIR=/volume1/docker/factory-rental-system/backups/automatic sh scripts/backup.sh
```

备份和恢复步骤、保留策略、DSM 定时任务见[备份与恢复说明](./backup-restore.md)。直接复制正在运行的 PostgreSQL 数据目录不能替代一致性快照。

V0.9.0 新增 `1712900000000-contract-document-jobs-and-history` 迁移，创建合同 PDF 任务及金额修改历史表。CI 会在真实 PostgreSQL 中从空库运行全部迁移，再验证第二次运行没有待执行项，以及合同、押金、收款、附件、PDF 和对账流程。
