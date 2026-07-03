import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ElMessage, ElMessageBox } from "element-plus";
import { deploymentUpdateApi } from "../api";
import AppShell from "./AppShell.vue";

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
    vi.clearAllMocks();
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
        onlineVersion: "V0.2.13",
        onlineVersionCheckedAt: "2026-07-02T04:20:00.000Z",
        onlineVersionError: null,
      });

    const wrapper = mountShell();
    await flushPromises();
    await wrapper.get("button.app-version").trigger("click");
    await flushPromises();

    expect(deploymentUpdateApi.status).toHaveBeenCalledTimes(2);
    expect(wrapper.get(".version-update-dialog").text()).toContain("V0.2.13");
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

  it("prompts the operator to reload when the running page is behind the online version", async () => {
    vi.mocked(deploymentUpdateApi.status).mockResolvedValue({
      enabled: true,
      running: false,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
      onlineVersion: "V0.2.13",
      onlineVersionCheckedAt: "2026-07-02T04:20:00.000Z",
      onlineVersionError: null,
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
});
