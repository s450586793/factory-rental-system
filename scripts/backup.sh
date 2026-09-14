#!/bin/sh
# 数据库快照和文件归档通过恢复检查后，才成为可轮换的正式备份。
set -eu
umask 077

BACKUP_DIR=${BACKUP_DIR:?Set BACKUP_DIR to an absolute backup directory}
BACKEND_CONTAINER=${BACKEND_CONTAINER:-factory-rental-backend}
POSTGRES_CONTAINER=${POSTGRES_CONTAINER:-factory-rental-postgres}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}
BACKUP_TIMEOUT_SECONDS=${BACKUP_TIMEOUT_SECONDS:-1800}
PG_DUMP_TIMEOUT_SECONDS=${PG_DUMP_TIMEOUT_SECONDS:-600}
PG_DUMP_LOCK_WAIT_TIMEOUT_MS=${PG_DUMP_LOCK_WAIT_TIMEOUT_MS:-10000}
VERIFY_TIMEOUT_SECONDS=${VERIFY_TIMEOUT_SECONDS:-900}
case "$BACKUP_DIR" in /*) ;; *) echo 'BACKUP_DIR must be absolute' >&2; exit 1;; esac
case "$BACKUP_KEEP_DAYS" in ''|*[!0-9]*) echo 'BACKUP_KEEP_DAYS must be a positive integer' >&2; exit 1;; esac
[ "$BACKUP_KEEP_DAYS" -gt 0 ] || exit 1
for setting in BACKUP_TIMEOUT_SECONDS PG_DUMP_TIMEOUT_SECONDS PG_DUMP_LOCK_WAIT_TIMEOUT_MS VERIFY_TIMEOUT_SECONDS; do
  eval 'value=${'"$setting"'}'
  case "$value" in ''|*[!0-9]*) echo "$setting must be a positive integer" >&2; exit 1;; esac
  maximum=86400
  [ "$setting" != PG_DUMP_LOCK_WAIT_TIMEOUT_MS ] || maximum=86400000
  [ "$value" -gt 0 ] && [ "$value" -le "$maximum" ] || { echo "$setting is outside the supported range" >&2; exit 1; }
done
command -v timeout >/dev/null 2>&1 || { echo 'A GNU or BusyBox compatible timeout command is required' >&2; exit 1; }

# 外层负责总时限，内层通过后台 wait 接收信号并清理当前步骤。
if [ "${1:-}" != '--within-timeout' ]; then
  timeout -s TERM -k 20 "$BACKUP_TIMEOUT_SECONDS" sh "$0" --within-timeout &
  supervisor_pid=$!
  trap 'kill -TERM "$supervisor_pid" 2>/dev/null || true; wait "$supervisor_pid" 2>/dev/null || true; exit 143' HUP INT TERM
  if wait "$supervisor_pid"; then result=0; else result=$?; fi
  case "$result" in
    124|137|143) echo "Backup timed out or was interrupted (total budget: $BACKUP_TIMEOUT_SECONDS seconds)" >&2; exit 124;;
    *) exit "$result";;
  esac
fi
[ "$PG_DUMP_TIMEOUT_SECONDS" -le "$BACKUP_TIMEOUT_SECONDS" ] || PG_DUMP_TIMEOUT_SECONDS=$BACKUP_TIMEOUT_SECONDS
[ "$VERIFY_TIMEOUT_SECONDS" -le "$BACKUP_TIMEOUT_SECONDS" ] || VERIFY_TIMEOUT_SECONDS=$BACKUP_TIMEOUT_SECONDS

active_pid=''
run_step() {
  # 只有备份主进程持有锁，Docker CLI、归档和恢复子进程均不继承它。
  exec 3<&0
  "$@" <&3 3>&- 9>&- &
  active_pid=$!
  exec 3<&-
  if wait "$active_pid"; then step_result=0; else step_result=$?; fi
  active_pid=''
  return "$step_result"
}

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || { echo 'A backup is already running' >&2; exit 1; }
staging=''
completed=0
finish() {
  result=$?
  trap - EXIT HUP INT TERM
  if [ -n "$active_pid" ]; then
    kill -TERM "$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
  fi
  exec 9>&-
  if [ "$completed" -eq 0 ]; then
    printf '%s backup failed; inspect %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${staging:-$BACKUP_DIR}" >&2
  fi
  exit "$result"
}
trap finish EXIT
trap 'exit 124' HUP INT TERM
storage_dir=$(exec 9>&-; timeout -s TERM -k 5 15 docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/storage"}}{{.Source}}{{end}}{{end}}' "$BACKEND_CONTAINER")
[ -d "$storage_dir" ] || { echo 'Cannot locate the /app/storage bind mount' >&2; exit 1; }
storage_real=$(CDPATH='' cd -- "$storage_dir" && pwd -P)
backup_real=$(CDPATH='' cd -- "$BACKUP_DIR" && pwd -P)
case "$backup_real/" in "$storage_real/"*) echo 'Backup directory cannot be inside storage' >&2; exit 1;; esac

stamp=$(date -u +%Y%m%dT%H%M%SZ)
staging=$(mktemp -d "$BACKUP_DIR/.partial-$stamp-XXXXXX")

printf 'Backing up PostgreSQL (limit: %s seconds; lock wait: %s ms)\n' "$PG_DUMP_TIMEOUT_SECONDS" "$PG_DUMP_LOCK_WAIT_TIMEOUT_MS"
run_step docker exec "$POSTGRES_CONTAINER" sh -ec 'exec timeout -s TERM -k 5 "$1" pg_dump --lock-wait-timeout="$2" --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' sh "$PG_DUMP_TIMEOUT_SECONDS" "$PG_DUMP_LOCK_WAIT_TIMEOUT_MS" > "$staging/database.dump"
[ -s "$staging/database.dump" ]
printf 'Archiving application storage\n'
run_step tar -czf "$staging/storage.tar.gz" -C "$storage_dir" .
run_step timeout -s TERM -k 5 15 docker inspect --format '{{.Name}} {{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$BACKEND_CONTAINER" > "$staging/application.txt"
printf '%s\n' "$stamp" > "$staging/created-at.txt"
run_step sh -ec 'cd "$1"; exec sha256sum database.dump storage.tar.gz application.txt created-at.txt > SHA256SUMS' sh "$staging"
restore_image=$(exec 9>&-; timeout -s TERM -k 5 15 docker inspect --format '{{.Config.Image}}' "$POSTGRES_CONTAINER")
printf 'Verifying isolated restore (budget: %s seconds)\n' "$VERIFY_TIMEOUT_SECONDS"
if run_step env RESTORE_IMAGE="$restore_image" VERIFY_TIMEOUT_SECONDS="$VERIFY_TIMEOUT_SECONDS" sh "$script_dir/verify-backup.sh" "$staging" > "$staging/verification.log" 2>&1; then
  :
else
  result=$?
  tail -n 30 "$staging/verification.log" >&2
  exit "$result"
fi
mv "$staging" "$BACKUP_DIR/rent-$stamp"
completed=1
printf '%s\n' "$stamp" > "$BACKUP_DIR/last-success.txt"

# 只轮换本脚本创建且验证通过的目录，历史手工备份不受影响。
run_step find "$BACKUP_DIR" -maxdepth 1 -type d -name 'rent-????????T??????Z' -mtime "+$BACKUP_KEEP_DAYS" -exec sh -c '
  for backup_path do
    if [ -f "$backup_path/verification.log" ] && [ -f "$backup_path/SHA256SUMS" ]; then
      rm -r -- "$backup_path"
    fi
  done
' sh {} +
printf 'Backup verified: %s/rent-%s\n' "$BACKUP_DIR" "$stamp"
