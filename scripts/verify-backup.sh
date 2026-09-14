#!/bin/sh
# 恢复到无网络、无生产挂载的临时 PostgreSQL；不触碰线上数据库。
set -eu
umask 077
backup_path=${1:?Usage: verify-backup.sh /absolute/path/to/backup}
RESTORE_IMAGE=${RESTORE_IMAGE:-postgres:16}
VERIFY_TIMEOUT_SECONDS=${VERIFY_TIMEOUT_SECONDS:-900}
PG_RESTORE_TIMEOUT_SECONDS=${PG_RESTORE_TIMEOUT_SECONDS:-600}
for setting in VERIFY_TIMEOUT_SECONDS PG_RESTORE_TIMEOUT_SECONDS; do
  eval 'value=${'"$setting"'}'
  case "$value" in ''|*[!0-9]*) echo "$setting must be a positive integer" >&2; exit 1;; esac
  [ "$value" -gt 0 ] && [ "$value" -le 86400 ] || { echo "$setting is outside the supported range" >&2; exit 1; }
done
command -v timeout >/dev/null 2>&1 || { echo 'A GNU or BusyBox compatible timeout command is required' >&2; exit 1; }
if [ "${2:-}" != '--within-timeout' ]; then
  timeout -s TERM -k 15 "$VERIFY_TIMEOUT_SECONDS" sh "$0" "$backup_path" --within-timeout &
  supervisor_pid=$!
  trap 'kill -TERM "$supervisor_pid" 2>/dev/null || true; wait "$supervisor_pid" 2>/dev/null || true; exit 143' HUP INT TERM
  if wait "$supervisor_pid"; then result=0; else result=$?; fi
  case "$result" in
    124|137|143) echo "Restore verification timed out or was interrupted (total budget: $VERIFY_TIMEOUT_SECONDS seconds)" >&2; exit 124;;
    *) exit "$result";;
  esac
fi
[ "$PG_RESTORE_TIMEOUT_SECONDS" -le "$VERIFY_TIMEOUT_SECONDS" ] || PG_RESTORE_TIMEOUT_SECONDS=$VERIFY_TIMEOUT_SECONDS
active_pid=''
run_step() {
  # 后台命令默认读取 /dev/null，显式保留 pg_restore 的输入文件。
  exec 3<&0
  "$@" <&3 3>&- 9>&- &
  active_pid=$!
  exec 3<&-
  if wait "$active_pid"; then step_result=0; else step_result=$?; fi
  active_pid=''
  return "$step_result"
}
[ -d "$backup_path" ] || exit 1
backup_path=$(CDPATH='' cd -- "$backup_path" && pwd -P)
check_dir=$(mktemp -d)
check_name="rent-restore-check-$(date +%s)-$$"
container_attempted=0
cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  if [ -n "$active_pid" ]; then
    kill -TERM "$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
  fi
  # 即使 create 响应超时，也尝试清理由本次校验命名的容器。
  if [ "$container_attempted" -eq 1 ]; then
    timeout -s TERM -k 2 10 docker rm -fv "$check_name" >/dev/null 2>&1 || echo "Temporary restore container cleanup failed: $check_name" >&2
  fi
  rm -r -- "$check_dir"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 124' HUP INT TERM
run_step sh -ec 'cd "$1"; exec sha256sum -c SHA256SUMS' sh "$backup_path"
run_step gzip -t "$backup_path/storage.tar.gz"
container_attempted=1
run_step timeout -s TERM -k 5 30 docker create --network none --label factory-rental-system.role=backup-check \
  --name "$check_name" -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=rent_restore -e POSTGRES_DB=rent_restore "$RESTORE_IMAGE" >/dev/null
run_step timeout -s TERM -k 5 15 docker start "$check_name" >/dev/null
attempt=0
until run_step timeout -s TERM -k 5 10 docker exec "$check_name" pg_isready -h 127.0.0.1 -q -U rent_restore -d rent_restore; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 90 ] || { echo 'Restore database did not become ready' >&2; exit 1; }
  sleep 1
done
printf 'Restoring database (limit: %s seconds)\n' "$PG_RESTORE_TIMEOUT_SECONDS"
run_step docker exec -i "$check_name" timeout -s TERM -k 5 "$PG_RESTORE_TIMEOUT_SECONDS" pg_restore --exit-on-error --no-owner --no-acl -U rent_restore -d rent_restore < "$backup_path/database.dump"
run_step timeout -s TERM -k 5 30 docker exec "$check_name" psql -v ON_ERROR_STOP=1 -U rent_restore -d rent_restore -Atc \
  'SELECT "storagePath" FROM stored_files WHERE "deletedAt" IS NULL' > "$check_dir/files.txt"
run_step tar -tzf "$backup_path/storage.tar.gz" > "$check_dir/archive.txt"
while IFS= read -r stored_path; do
  case "$stored_path" in
    /app/storage/*) relative_path=${stored_path#/app/storage/} ;;
    *) echo 'Stored file uses an unexpected storage root' >&2; exit 1 ;;
  esac
  grep -Fxq "./$relative_path" "$check_dir/archive.txt" || {
    echo 'Backup is missing a database-referenced attachment' >&2
    exit 1
  }
done < "$check_dir/files.txt"
run_step timeout -s TERM -k 5 30 docker exec "$check_name" psql -v ON_ERROR_STOP=1 -U rent_restore -d rent_restore -Atc \
  'SELECT '\''contracts='\'' || count(*) FROM contracts; SELECT '\''files='\'' || count(*) FROM stored_files; SELECT '\''rent_payments='\'' || count(*) FROM rent_payments;'
printf 'Restore and attachment verification passed\n'
