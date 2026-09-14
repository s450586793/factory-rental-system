import { enableAutoUnmount, flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ElMessage, ElMessageBox } from "element-plus";
import { deploymentUpdateApi } from "../api";
import AppShell from "./AppShell.vue";

enableAutoUnmount(afterEach);

vi.mock("../api", () => ({
  deploymentUpdateApi: {
    status: vi.fn(),
    start: vi.fn(),
  },
}));

vi.mock("element-plus", () => ({
  ElMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(),
  },
}));

vi.mock("../stores/auth", () => ({
  useAuthStore: () => ({
    state: {
      user: {
        username: "jarvis",
      },
    },
    logout: vi.fn(),
  }),
}));

vi.mock("vue-router", async () => {
  const actual = await vi.importActual<typeof import("vue-router")>("vue-router");
  return {
    ...actual,
    useRoute: () => ({
      path: "/units",
      fullPath: "/units",
    }),
    useRouter: () => ({
      push: vi.fn(),
    }),
  };
});

function mountShell() {
  return mount(AppShell, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        "el-dropdown": true,
        "el-dropdown-menu": true,
        "el-dropdown-item": true,
      },
    },
  });
}

describe("AppShell deployment update", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(deploymentUpdateApi.status).mockResolvedValue({
      enabled: true,
      running: false,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
      onlineVersion: "V0.2.2",
      onlineVersionCheckedAt: "2026-07-02T04:00:00.000Z",
      onlineVersionError: null,
    });
    vi.mocked(deploymentUpdateApi.start).mockResolvedValue({
      started: true,
      containerName: "factory-rental-updater",
      message: "系统更新已开始，前端页面可能会短暂断开。",
    });
    vi.mocked(ElMessageBox.confirm).mockResolvedValue({} as Awaited<ReturnType<typeof ElMessageBox.confirm>>);
  });

  it("does not show the old sidebar web update button", async () => {
    const wrapper = mountShell();
    await flushPromises();

    expect(wrapper.find("button.web-update-button").exists()).toBe(false);
  });

  it("opens a version update dialog from the current version badge", async () => {
    const wrapper = mountShell();
    await flushPromises();

    await wrapper.get("button.app-version").trigger("click");

    await flushPromises();
    expect(wrapper.get(".version-update-dialog").text()).toContain("当前版本");
    expect(wrapper.get(".version-update-dialog").text()).toContain("V0.2.2");
    expect(wrapper.get(".version-update-dialog").text()).toContain("线上版本");
    expect(wrapper.get(".version-update-dialog").text()).toContain("V0.2.2");
    expect(wrapper.get("button.version-update-refresh-button").attributes("disabled")).toBeUndefined();
    expect((wrapper.get("button.version-update-start-button").element as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables the dialog update button when backend updates are disabled", async () => {
    vi.mocked(deploymentUpdateApi.status).mockResolvedValue({
      enabled: false,
      running: false,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
      onlineVersion: "V0.2.2",
      onlineVersionCheckedAt: "2026-07-02T04:00:00.000Z",
      onlineVersionError: null,
    });

    const wrapper = mountShell();
    await flushPromises();
    await wrapper.get("button.app-version").trigger("click");

    expect(wrapper.get("button.version-update-start-button").attributes("disabled")).toBeDefined();
    expect(wrapper.get("button.version-update-start-button").text()).toContain("未启用");
  });

  it("disables the dialog update button while an update is already running", async () => {
    vi.mocked(deploymentUpdateApi.status).mockResolvedValue({
      enabled: true,
      running: true,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
      onlineVersion: "V0.2.2",
      onlineVersionCheckedAt: "2026-07-02T04:00:00.000Z",
      onlineVersionError: null,
    });

    const wrapper = mountShell();
    await flushPromises();
    await wrapper.get("button.app-version").trigger("click");

    expect(wrapper.get("button.version-update-start-button").attributes("disabled")).toBeDefined();
    expect(wrapper.get("button.version-update-start-button").text()).toContain("执行中");
  });

  it("refreshes the online version from the dialog", async () => {
    vi.mocked(deploymentUpdateApi.status)
      .mockResolvedValueOnce({
        enabled: true,
        running: false,
        services: ["backend", "frontend"],
        composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
        onlineVersion: "V0.2.2",
        onlineVersionCheckedAt: "2026-07-02T04:00:00.000Z",
        onlineVersionError: null,
      })
      .mockResolvedValueOnce({
        enabled: true,
        running: false,
        services: ["backend", "frontend"],
        composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
        onlineVersion: "V0.2.3",
        onlineVersionCheckedAt: "2026-07-02T04:10:00.000Z",
        onlineVersionError: null,
      })
      .mockResolvedValueOnce({
        enabled: true,
        running: false,
        services: ["backend", "frontend"],
        composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
        onlineVersion: "V0.2.4",
        onlineVersionCheckedAt: "2026-07-02T04:20:00.000Z",
        onlineVersionError: null,
      });

    const wrapper = mountShell();
    await flushPromises();
    await wrapper.get("button.app-version").trigger("click");
    await flushPromises();
    await wrapper.get("button.version-update-refresh-button").trigger("click");
    await flushPromises();

    expect(deploymentUpdateApi.status).toHaveBeenCalledTimes(3);
    expect(wrapper.get(".version-update-dialog").text()).toContain("V0.2.4");
  });

  it("refreshes deployment status when opening the version dialog", async () => {
    vi.mocked(deploymentUpdateApi.status)
      .mockResolvedValueOnce({
        enabled: true,
        running: false,
        services: ["backend", "frontend"],
        composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
        onlineVersion: null,
        onlineVersionCheckedAt: null,
        onlineVersionError: "fetch failed",
      })
      .mockResolvedValueOnce({
        enabled: true,
        running: false,
        services: ["backend", "frontend"],
        composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
        onlineVersion: "V0.2.14",
        onlineVersionCheckedAt: "2026-07-02T04:20:00.000Z",
        onlineVersionError: null,
      });

    const wrapper = mountShell();
    await flushPromises();
    await wrapper.get("button.app-version").trigger("click");
    await flushPromises();

    expect(deploymentUpdateApi.status).toHaveBeenCalledTimes(2);
    expect(wrapper.get(".version-update-dialog").text()).toContain("V0.2.14");
    expect(wrapper.get("button.version-update-start-button").text()).toContain("更新");
  });

  it("keeps the update button from showing disabled when status refresh fails", async () => {
    vi.mocked(deploymentUpdateApi.status).mockRejectedValue(new Error("fetch failed"));

    const wrapper = mountShell();
    await flushPromises();
    await wrapper.get("button.app-version").trigger("click");

    expect(wrapper.get(".version-update-dialog").text()).toContain("查询失败");
    expect(wrapper.get("button.version-update-start-button").text()).toContain("刷新后重试");
    expect(wrapper.get("button.version-update-start-button").attributes("disabled")).toBeDefined();
    expect(wrapper.get("button.version-update-start-button").text()).not.toContain("未启用");
  });

  it("prompts reload only after successful deployment of the newer version", async () => {
    vi.mocked(deploymentUpdateApi.status).mockResolvedValue({
      enabled: true,
      running: false,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
      onlineVersion: "V9.9.9",
      onlineVersionCheckedAt: "2026-07-02T04:20:00.000Z",
      onlineVersionError: null,
      result: {
        status: "succeeded", exitCode: 0, message: "更新成功", logs: "healthy", version: "V9.9.9",
        revision: "a".repeat(40), startedAt: null, finishedAt: null,
      },
    });

    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        reload,
      },
    });

    const wrapper = mountShell();
    await flushPromises();
    await wrapper.get("button.app-version").trigger("click");

    expect(wrapper.get(".version-update-dialog").text()).toContain("当前页面仍是旧版本，请刷新页面加载最新前端");
    expect(wrapper.find("button.version-update-reload-button").exists()).toBe(true);
    expect((wrapper.get("button.version-update-start-button").element as HTMLButtonElement).disabled).toBe(false);
    expect(wrapper.get("button.version-update-start-button").text()).toContain("更新");

    await wrapper.get("button.version-update-reload-button").trigger("click");

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("starts the backend update after operator confirmation", async () => {
    const wrapper = mountShell();
    await flushPromises();
    await wrapper.get("button.app-version").trigger("click");

    await wrapper.get("button.version-update-start-button").trigger("click");
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalled();
    expect(deploymentUpdateApi.start).toHaveBeenCalledTimes(1);
    expect(ElMessage.success).toHaveBeenCalledWith("系统更新已开始，前端页面可能会短暂断开。");
  });

  it("does not suggest reloading for a published version that has not been deployed", async () => {
    const status = await deploymentUpdateApi.status();
    vi.mocked(deploymentUpdateApi.status).mockResolvedValue({ ...status, onlineVersion: "V9.9.9" });
    const wrapper = mountShell();
    await flushPromises();
    await wrapper.get("button.app-version").trigger("click");
    await flushPromises();
    expect(wrapper.find("button.version-update-reload-button").exists()).toBe(false);
  });

  it("reconnects after restart, shows retained failure, and cancels polling on unmount", async () => {
    vi.useFakeTimers();
    try {
      const status = await deploymentUpdateApi.status();
      vi.mocked(deploymentUpdateApi.status).mockResolvedValue({ ...status, running: true });
      const wrapper = mountShell();
      await flushPromises();
      await wrapper.get("button.app-version").trigger("click");
      await flushPromises();
      vi.mocked(deploymentUpdateApi.status).mockRejectedValueOnce(new Error("disconnected"));
      await vi.advanceTimersByTimeAsync(3_000);
      await flushPromises();
      expect(wrapper.text()).toContain("正在重新连接并确认更新结果");
      expect(wrapper.get("button.version-update-start-button").attributes("disabled")).toBeDefined();
      vi.mocked(deploymentUpdateApi.status).mockResolvedValue({ ...status, running: false, result: {
        status: "failed", exitCode: 42, message: "健康或版本校验超时", logs: "Health verification timed out",
        revision: "a".repeat(40), version: "V9.9.9", startedAt: null, finishedAt: null,
      } });
      await vi.advanceTimersByTimeAsync(3_000);
      await flushPromises();
      expect(wrapper.text()).toContain("健康或版本校验超时");
      expect(wrapper.text()).toContain("退出码 42");
      expect(wrapper.text()).not.toContain("正在重新连接");
      expect(wrapper.find("button.version-update-reload-button").exists()).toBe(false);
      wrapper.unmount();
      const callCount = vi.mocked(deploymentUpdateApi.status).mock.calls.length;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(deploymentUpdateApi.status).toHaveBeenCalledTimes(callCount);
    } finally { vi.useRealTimers(); }
  });

  it("continues polling an update after closing the version dialog", async () => {
    vi.useFakeTimers();
    try {
      const status = await deploymentUpdateApi.status();
      vi.mocked(deploymentUpdateApi.status).mockResolvedValue({ ...status, running: true });
      const wrapper = mountShell();
      await flushPromises();
      await wrapper.get("button.app-version").trigger("click");
      await flushPromises();
      await wrapper.get("button.version-update-close-button").trigger("click");
      const count = vi.mocked(deploymentUpdateApi.status).mock.calls.length;
      await vi.advanceTimersByTimeAsync(3_000);
      await flushPromises();
      expect(deploymentUpdateApi.status).toHaveBeenCalledTimes(count + 1);
      wrapper.unmount();
    } finally { vi.useRealTimers(); }
  });

  it("aborts a stalled status request and retries after the timeout", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(deploymentUpdateApi.status).mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }));
      const wrapper = mountShell();
      await wrapper.get("button.app-version").trigger("click");
      await vi.advanceTimersByTimeAsync(30_000);
      await flushPromises();
      expect(wrapper.text()).toContain("查询失败，正在重试");
      await vi.advanceTimersByTimeAsync(3_000);
      await flushPromises();
      expect(wrapper.text()).not.toContain("查询失败，正在重试");
      expect(deploymentUpdateApi.status).toHaveBeenCalledTimes(2);
      wrapper.unmount();
    } finally { vi.useRealTimers(); }
  });
});
