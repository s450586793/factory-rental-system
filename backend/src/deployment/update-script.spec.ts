import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveDeploymentUpdateConfig } from "../config/deployment-update.config";
import { buildUpdateScript } from "./update-script";
import type { ReleaseManifest } from "./deployment-update.service";

describe("deployment update runner", () => {
  const revision = "a".repeat(40);
  const manifest: ReleaseManifest = {
    schemaVersion: 1, revision, version: "V1.2.3",
    images: { backend: `ghcr.io/example/backend@sha256:${"b".repeat(64)}`, frontend: `ghcr.io/example/frontend@sha256:${"c".repeat(64)}` },
  };
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "update-runner-"));
    writeFileSync(join(directory, "docker"), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  *'pull backend frontend') [ "$SCENARIO" != pull_fail ] || exit 17 ;;
  *'up -d --no-deps --no-build backend frontend') [ "$SCENARIO" != up_fail ] || exit 18 ;;
  *'ps -q backend') echo backend-id ;;
  *'ps -q frontend') echo frontend-id ;;
  inspect*)
    if [ "$SCENARIO" = old_revision ]; then echo 'true|healthy|old';
    elif [ "$SCENARIO" = unhealthy ]; then echo 'true|unhealthy|${revision}';
    else echo 'true|healthy|${revision}'; fi ;;
esac
`, { mode: 0o755 });
    writeFileSync(join(directory, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it.each([["missing", 43], ["failed", 44], ["verified", 0]])("gates service recreation on %s backup", (scenario, expected) => {
    if (scenario !== "missing") {
      mkdirSync(join(directory, "scripts"));
      writeFileSync(join(directory, "scripts/verify-backup.sh"), "#!/bin/sh\nexit 0\n");
      writeFileSync(join(directory, "scripts/backup.sh"), `#!/bin/sh\nprintf '%s\\n' BACKUP >> "$CALL_LOG"\nexit ${scenario === "failed" ? 44 : 0}\n`);
    }
    const config = resolveDeploymentUpdateConfig({ WEB_UPDATE_PROJECT_DIR: directory });
    const result = spawnSync("sh", ["-c", buildUpdateScript(config, manifest)], {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, SCENARIO: "healthy", CALL_LOG: join(directory, "calls") },
      encoding: "utf8", timeout: 5_000,
    });
    expect(result.status).toBe(expected);
    const calls = readFileSync(join(directory, "calls"), "utf8");
    if (scenario !== "verified") expect(calls).not.toContain("up -d");
    else expect(calls.indexOf("BACKUP")).toBeLessThan(calls.indexOf("up -d"));
  });

  it.each([
    ["healthy", 0], ["pull_fail", 17], ["up_fail", 18], ["old_revision", 42], ["unhealthy", 42],
  ])("returns observable result for %s", (scenario, expected) => {
    const config = resolveDeploymentUpdateConfig({
      WEB_UPDATE_PROJECT_DIR: directory, WEB_UPDATE_COMPOSE_FILES: "custom compose.yaml", WEB_UPDATE_HEALTH_TIMEOUT_SECONDS: "1", WEB_UPDATE_BACKUP_ENABLED: "false",
    });
    const result = spawnSync("sh", ["-c", buildUpdateScript(config, manifest)], {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, SCENARIO: scenario, CALL_LOG: join(directory, "calls") },
      encoding: "utf8", timeout: 5_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(expected);
    const calls = readFileSync(join(directory, "calls"), "utf8");
    expect(calls).not.toContain("postgres");
    if (scenario === "pull_fail") expect(calls).not.toContain("up -d");
    if (scenario === "healthy") {
      expect(calls).toContain("ps -q backend");
      expect(calls).toContain("ps -q frontend");
      expect(JSON.parse(readFileSync(join(directory, ".web-update-images.json"), "utf8"))).toEqual({
        services: { backend: { image: manifest.images.backend }, frontend: { image: manifest.images.frontend } },
      });
    }
  });
});
