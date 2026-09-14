#!/bin/sh
# 仅操作本测试创建的容器与目录。
set -eu
umask 077
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

# 使用本地 Docker 替身验证截止时间和锁清理，不启动真实数据库。
if [ "${1:-}" = '--timeouts-only' ]; then
  test_root=$(mktemp -d)
  trap 'rm -r -- "$test_root"' EXIT
  mkdir -p "$test_root/bin" "$test_root/storage/payment-voucher" "$test_root/backups" "$test_root/state"
  printf 'voucher fixture\n' > "$test_root/storage/payment-voucher/test.png"
  cat > "$test_root/bin/docker" <<'MOCK_DOCKER'
#!/bin/sh
set -eu
if [ "${1:-}" = '--backup-test-probe' ]; then
  printf 'factory-rental-backup-docker-mock\n'
  exit 0
fi
printf '%s\n' "$*" >> "$MOCK_ROOT/state/commands"
block_step() {
  sleep 60 &
  blocked_pid=$!
  printf '%s\n' "$blocked_pid" > "$MOCK_ROOT/state/blocked-pid"
  trap 'kill "$blocked_pid" 2>/dev/null || true; wait "$blocked_pid" 2>/dev/null || true; exit 143' TERM INT HUP
  wait "$blocked_pid"
}
case "$*" in
  *'range .Mounts'*)
    [ "$MOCK_MODE" != dump_hang ] || sleep "$MOCK_PREPARATION_DELAY_SECONDS"
    printf '%s\n' "$MOCK_ROOT/storage";;
  *'.Config.Image'*) printf '%s\n' postgres:16;;
  inspect*) printf '%s\n' 'fixture-image fixture-revision';;
  *pg_dump*)
    [ "$MOCK_MODE" != dump_hang ] || block_step
    printf 'database fixture\n';;
  *pg_restore*)
    [ "$MOCK_MODE" != restore_hang ] || block_step
    [ -n "$(cat)" ] || { echo 'Restore stdin was lost' >&2; exit 1; };;
  *'SELECT "storagePath"'*) printf '%s\n' /app/storage/payment-voucher/test.png;;
  create*)
    [ "$MOCK_MODE" != restore_hang ] || sleep "$MOCK_PREPARATION_DELAY_SECONDS"
    touch "$MOCK_ROOT/state/restore-container";;
  rm*) rm -f "$MOCK_ROOT/state/restore-container";;
esac
MOCK_DOCKER
  chmod +x "$test_root/bin/docker"
  export PATH="$test_root/bin:$PATH" MOCK_ROOT="$test_root" BACKUP_DIR="$test_root/backups"
  export BACKEND_CONTAINER="rent-backup-mock-backend-$$" POSTGRES_CONTAINER="rent-backup-mock-postgres-$$"
  export DOCKER_HOST="unix://$test_root/nonexistent-docker.sock"
  unset DOCKER_CONTEXT
  # noexec 挂载可能让 Shell 跳过替身并继续搜索 PATH，必须先验证绝对路径和子 Shell。
  if ! "$test_root/bin/docker" --backup-test-probe > "$test_root/probe.txt" 2>/dev/null; then
    echo "Temporary directory cannot execute test fixtures: $test_root" >&2
    echo 'Set TMPDIR to a writable filesystem without noexec before running backup tests' >&2
    exit 1
  fi
  if [ "$(cat "$test_root/probe.txt")" != factory-rental-backup-docker-mock ] \
    || [ "$(timeout -s TERM -k 2 5 sh -c 'docker --backup-test-probe' 2>/dev/null)" != factory-rental-backup-docker-mock ]; then
    echo 'Docker mock command resolution failed; backup tests were not started' >&2
    exit 1
  fi
  export MOCK_PREPARATION_DELAY_SECONDS=${BACKUP_TEST_PREPARATION_DELAY_SECONDS:-0}
  for scenario in dump_hang restore_hang; do
    export MOCK_MODE="$scenario"
    target_reached=0
    # NAS 负载可能使准备工作超过短预算；只有阻塞步骤真正启动才验证子进程清理。
    for budget in 2 5 15; do
      rm -f "$test_root/state/blocked-pid"
      if [ "$scenario" = dump_hang ]; then
        export BACKUP_TIMEOUT_SECONDS="$budget" VERIFY_TIMEOUT_SECONDS=30
      else
        export BACKUP_TIMEOUT_SECONDS=120 VERIFY_TIMEOUT_SECONDS="$budget"
      fi
      scenario_log="$test_root/$scenario-$budget.log"
      if sh "$script_dir/backup.sh" > "$scenario_log" 2>&1; then
        echo "Blocked $scenario was incorrectly accepted" >&2
        exit 1
      else
        result=$?
        [ "$result" -eq 124 ] || { cat "$scenario_log" >&2; exit 1; }
      fi
      grep -q 'timed out' "$scenario_log"
      [ ! -f "$BACKUP_DIR/last-success.txt" ]
      [ ! -f "$test_root/state/restore-container" ]
      (exec 9>"$BACKUP_DIR/.backup.lock"; flock -n 9) || { echo 'Backup lock was not released' >&2; exit 1; }
      if [ -s "$test_root/state/blocked-pid" ]; then
        blocked_pid=$(cat "$test_root/state/blocked-pid")
        ! kill -0 "$blocked_pid" 2>/dev/null || { echo 'Timed out child is still running' >&2; exit 1; }
        target_reached=1
        break
      fi
      printf 'Preparation exceeded %s seconds before %s; retrying with a larger budget\n' "$budget" "$scenario"
    done
    if [ "$target_reached" -ne 1 ]; then
      echo "Timeout test never reached $scenario; check machine load and preparation logs" >&2
      cat "$scenario_log" >&2
      exit 1
    fi
  done
  grep -q -- '--lock-wait-timeout=' "$test_root/state/commands"
  export MOCK_MODE=healthy BACKUP_TIMEOUT_SECONDS=120 VERIFY_TIMEOUT_SECONDS=60
  sh "$script_dir/backup.sh" > "$test_root/retry.log" 2>&1 || { cat "$test_root/retry.log" >&2; exit 1; }
  [ -f "$BACKUP_DIR/last-success.txt" ]
  exec 8>"$BACKUP_DIR/.backup.lock"
  flock -n 8
  if sh "$script_dir/backup.sh" > "$test_root/locked.log" 2>&1; then
    echo 'Concurrent backup unexpectedly acquired the lock' >&2
    exit 1
  fi
  grep -q 'already running' "$test_root/locked.log"
  exec 8>&-
  printf 'Dump/restore timeout, child cleanup, lock release and retry checks passed\n'
  exit 0
fi

sh "$script_dir/test-backup.sh" --timeouts-only
test_root=$(mktemp -d)
db_name="rent-backup-test-db-$$"
source_name="rent-backup-test-source-$$"
image=${RESTORE_IMAGE:-postgres:16-alpine}
cleanup() {
  docker rm -fv "$source_name" "$db_name" >/dev/null 2>&1 || true
  rm -r -- "$test_root"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
mkdir -p "$test_root/storage/payment-voucher" "$test_root/backups"
printf 'voucher fixture\n' > "$test_root/storage/payment-voucher/test.png"
docker run -d --network none --name "$db_name" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=rent_test -e POSTGRES_DB=rent_test "$image" >/dev/null
docker create --network none --name "$source_name" -v "$test_root/storage:/app/storage:ro" "$image" /bin/true >/dev/null
attempt=0
until docker exec "$db_name" pg_isready -h 127.0.0.1 -q -U rent_test -d rent_test; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || exit 1
  sleep 1
done
docker exec "$db_name" psql -v ON_ERROR_STOP=1 -U rent_test -d rent_test -c '
  CREATE TABLE contracts (id integer); INSERT INTO contracts VALUES (1);
  CREATE TABLE rent_payments (id integer); INSERT INTO rent_payments VALUES (1);
  CREATE TABLE stored_files ("storagePath" text, "deletedAt" timestamp);
  INSERT INTO stored_files VALUES ('\''/app/storage/payment-voucher/test.png'\'', NULL);
' >/dev/null
export BACKUP_DIR="$test_root/backups" BACKEND_CONTAINER="$source_name" POSTGRES_CONTAINER="$db_name"
sh "$script_dir/backup.sh"
stamp=$(cat "$BACKUP_DIR/last-success.txt")
[ -f "$BACKUP_DIR/rent-$stamp/verification.log" ]
grep -q 'Restore and attachment verification passed' "$BACKUP_DIR/rent-$stamp/verification.log"
printf 'corruption' >> "$BACKUP_DIR/rent-$stamp/database.dump"
if RESTORE_IMAGE="$image" sh "$script_dir/verify-backup.sh" "$BACKUP_DIR/rent-$stamp" >/dev/null 2>&1; then
  echo 'Corrupt backup was incorrectly accepted' >&2
  exit 1
fi
rm "$test_root/storage/payment-voucher/test.png"
if sh "$script_dir/backup.sh" >/dev/null 2>&1; then
  echo 'Missing attachment was incorrectly accepted' >&2
  exit 1
fi
[ "$(cat "$BACKUP_DIR/last-success.txt")" = "$stamp" ]
printf 'Backup success, corruption and missing-attachment checks passed\n'
