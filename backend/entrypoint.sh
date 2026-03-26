#!/bin/sh
set -eu

echo "[backend] running migrations"
node dist/database/run-migrations.js

echo "[backend] ensuring admin user"
node dist/database/seed-admin.js

echo "[backend] starting application"
exec node dist/main.js
