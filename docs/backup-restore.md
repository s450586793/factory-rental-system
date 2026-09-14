# 自动备份与恢复验证

`scripts/backup.sh` 同时备份 PostgreSQL 与后端 `/app/storage` 挂载目录，包含合同、收据和收款凭证。备份使用数据库环境中的连接信息，不输出密码；目录和文件默认只有执行用户可读。只支持后端 `/app/storage` 为宿主机目录挂载的现有 Compose 部署。

```sh
BACKUP_DIR=/volume4/docker/docker/rent/backups/automatic \
sh /volume4/docker/docker/rent/scripts/backup.sh
```

每份备份包含 `database.dump`、`storage.tar.gz`、应用镜像 revision、SHA256 校验文件和恢复验证日志。恢复验证启动一个无网络、没有生产挂载的临时 PostgreSQL，实际恢复数据库并逐一检查数据库引用的附件是否存在于归档；验证失败的目录保留为 `.partial-*`，不会被报告为成功。若备份期间附件被删除导致不完整，任务会失败并保留上一份有效备份，应重试。

默认保留 30 天的已验证备份，可通过 `BACKUP_KEEP_DAYS` 调整。只有本脚本命名且已完成验证的备份参与轮换，旧手工备份不会删除。`last-success.txt` 是最近成功时间；定时任务必须保留标准输出和错误输出以便检查失败。

备份与恢复校验均有总时限，数据库命令另有独立时限：

| 环境变量 | 默认值 | 含义 |
| --- | --- | --- |
| `BACKUP_TIMEOUT_SECONDS` | `1800` | 完整备份流程的最大执行秒数，包含恢复校验 |
| `PG_DUMP_TIMEOUT_SECONDS` | `600` | 容器内 `pg_dump` 的最大执行秒数，不超过备份总时限 |
| `PG_DUMP_LOCK_WAIT_TIMEOUT_MS` | `10000` | `pg_dump --lock-wait-timeout` 等待表锁的最大毫秒数 |
| `VERIFY_TIMEOUT_SECONDS` | `900` | 独立恢复校验的总时限，备份内调用时不超过备份总时限 |
| `PG_RESTORE_TIMEOUT_SECONDS` | `600` | 临时容器内 `pg_restore` 的最大执行秒数，不超过恢复校验总时限 |

所有时限必须是正整数；秒数最多为 `86400`，锁等待毫秒数最多为 `86400000`。宿主机与 PostgreSQL 镜像必须提供支持 `-s` 和 `-k` 的 GNU 或 BusyBox `timeout`，现用 DSM、`postgres:16` 和 `docker:27-cli` 对应该接口。执行时间超限会输出具体阶段与总预算，退出码统一为 `124`；表锁等待超限使用 `pg_dump` 的失败退出码并输出数据库错误。失败保留 `.partial-*`，不修改最近成功记录。停止当前步骤和清理临时恢复容器最多另留 20 秒；只有备份主进程持有文件锁，子进程不会继承锁，因此超时退出后可重新执行。若 Docker 无响应导致临时容器清理失败，日志会给出本次 `rent-restore-check-*` 容器名，待 Docker 恢复后检查并删除该临时容器。

网页更新还受 `WEB_UPDATE_TIMEOUT_SECONDS` 限制，应为备份预算、镜像拉取和健康检查留足总时间。例如备份预算 `1800` 秒时，可给网页更新设置 `2400` 秒总预算。按数据量调整预算应基于正常备份耗时；表锁超时应先排查长事务，再重试。

在 DSM 任务计划中以 root 每天 03:30 执行上述命令。部署更新前再执行一次。备份位于同一 NAS 时仍建议通过 Hyper Backup 复制到另一台设备，避免设备故障同时损失原件与备份。

手工重新验证已有备份：

```sh
RESTORE_IMAGE=postgres:16 sh scripts/verify-backup.sh /path/to/rent-YYYYMMDDTHHMMSSZ
```

仅验证超时、子进程退出、锁释放与重试，不启动 Docker 容器：

```sh
sh scripts/test-backup.sh --timeouts-only
```

完整 `sh scripts/test-backup.sh` 还会检查真实 PostgreSQL 备份、归档损坏及附件缺失。

DSM 的 `/tmp` 通常以 `noexec` 挂载，测试替身不能直接执行。测试时将 `TMPDIR` 指向项目下专门创建的可执行临时目录；脚本会先验证替身，失败即停止，并使用无效 Docker 地址阻断测试替身失效时误连正式环境。正式备份脚本无需改变临时目录。

业务恢复前应停止应用写入，另外保留当前数据库和存储，然后将备份恢复到一个新的 PostgreSQL 数据目录，并将附件解压到新的存储目录。在隔离环境核对合同、收费、凭证与版本兼容性后，切换 Compose 挂载到恢复后的目录。不要将 `pg_restore` 直接用于覆盖仍在运行的生产数据库，也不要直接复制正在写入的 PostgreSQL 数据目录作为唯一备份。
