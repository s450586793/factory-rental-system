import type { DeploymentUpdateConfig } from "../config/deployment-update.config";
import type { ReleaseManifest } from "./deployment-update.service";

export function buildUpdateScript(config: DeploymentUpdateConfig, manifest: ReleaseManifest) {
  const override = ".web-update-images.json";
  const composeArgs = [...config.composeFiles, override].map((file) => `-f ${quoteShell(file)}`).join(" ");
  const compose = `docker compose ${composeArgs}`;
  const images = JSON.stringify({ services: {
    backend: { image: manifest.images.backend },
    frontend: { image: manifest.images.frontend },
  } });
  return [
    "set -eu",
    `cd ${quoteShell(config.projectDir)}`,
    `printf '%s\\n' ${quoteShell(images)} > ${quoteShell(override)}`,
    "echo 'Pulling published backend and frontend images'",
    `${compose} pull backend frontend`,
    ...(config.backupEnabled ? [
      "echo 'Creating and verifying pre-update backup'",
      "[ -f scripts/backup.sh ] && [ -f scripts/verify-backup.sh ] || { echo 'Backup scripts missing: install scripts/backup.sh and scripts/verify-backup.sh in WEB_UPDATE_PROJECT_DIR' >&2; exit 43; }",
      `BACKUP_DIR=${quoteShell(`${config.projectDir}/backups/automatic`)} sh scripts/backup.sh`,
    ] : []),
    "echo 'Starting application services'",
    `${compose} up -d --no-deps --no-build backend frontend`,
    "echo 'Waiting for both services to be healthy at the published revision'",
    `deadline=$(( $(date +%s) + ${config.healthTimeoutSeconds} ))`,
    "while [ \"$(date +%s)\" -lt \"$deadline\" ]; do",
    "  ready=1",
    "  for service in backend frontend; do",
    `    id=$(${compose} ps -q "$service" 2>/dev/null) || id=''`,
    "    state=''",
    "    if [ -n \"$id\" ]; then",
    "      state=$(docker inspect --format '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{index .Config.Labels \"org.opencontainers.image.revision\"}}' \"$id\" 2>/dev/null) || state=''",
    "    fi",
    `    if [ "$state" != ${quoteShell(`true|healthy|${manifest.revision}`)} ]; then ready=0; fi`,
    "  done",
    "  if [ \"$ready\" = 1 ]; then echo 'Update completed: both services are healthy at the published revision'; exit 0; fi",
    "  sleep 5",
    "done",
    "echo 'Health or revision verification timed out for application services' >&2",
    "exit 42",
  ].join("\n");
}

function quoteShell(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
