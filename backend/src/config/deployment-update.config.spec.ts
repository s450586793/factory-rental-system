import { resolveDeploymentUpdateConfig } from "./deployment-update.config";

describe("deployment update configuration", () => {
  it("uses the published manifest and keeps custom DSM compose settings", () => {
    const config = resolveDeploymentUpdateConfig({ WEB_UPDATE_PROJECT_DIR: "/volume4/docker/docker/rent", WEB_UPDATE_COMPOSE_FILE: "compose.yaml" });
    expect(config.onlineVersionUrl).toContain("releases/latest/download/release-manifest.json");
    expect(config.composeFiles).toEqual(["compose.yaml"]);
    expect(config.projectDir).toBe("/volume4/docker/docker/rent");
    expect(config.updateTimeoutSeconds).toBe(900);
  });

  it.each(["Infinity", "0", "-1", "1.5"])("rejects unbounded or invalid timeout %s", (value) => {
    expect(() => resolveDeploymentUpdateConfig({ WEB_UPDATE_TIMEOUT_SECONDS: value })).toThrow("WEB_UPDATE_TIMEOUT_SECONDS");
  });
});
