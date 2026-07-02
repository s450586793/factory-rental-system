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
    vi.mocked(deploymentUpdateApi.status).mockResolvedValue({
      enabled: true,
      running: false,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
    });
    vi.mocked(deploymentUpdateApi.start).mockResolvedValue({
      started: true,
      containerName: "factory-rental-updater",
      message: "系统更新已开始，前端页面可能会短暂断开。",
    });
    vi.mocked(ElMessageBox.confirm).mockResolvedValue({} as Awaited<ReturnType<typeof ElMessageBox.confirm>>);
  });

  it("shows an enabled web update button when backend updates are available", async () => {
    const wrapper = mountShell();
    await flushPromises();

    const updateButton = wrapper.get("button.web-update-button");
    expect(updateButton.text()).toContain("更新系统");
    expect(updateButton.attributes("disabled")).toBeUndefined();
  });

  it("disables the web update button when backend updates are disabled", async () => {
    vi.mocked(deploymentUpdateApi.status).mockResolvedValue({
      enabled: false,
      running: false,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
    });

    const wrapper = mountShell();
    await flushPromises();

    expect(wrapper.get("button.web-update-button").attributes("disabled")).toBeDefined();
  });

  it("disables the web update button while an update is already running", async () => {
    vi.mocked(deploymentUpdateApi.status).mockResolvedValue({
      enabled: true,
      running: true,
      services: ["backend", "frontend"],
      composeFiles: ["docker-compose.ghcr.yml", "docker-compose.web-update.yml"],
    });

    const wrapper = mountShell();
    await flushPromises();

    expect(wrapper.get("button.web-update-button").attributes("disabled")).toBeDefined();
    expect(wrapper.get("button.web-update-button").text()).toContain("执行中");
  });

  it("starts the backend update after operator confirmation", async () => {
    const wrapper = mountShell();
    await flushPromises();

    await wrapper.get("button.web-update-button").trigger("click");
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalled();
    expect(deploymentUpdateApi.start).toHaveBeenCalledTimes(1);
    expect(ElMessage.success).toHaveBeenCalledWith("系统更新已开始，前端页面可能会短暂断开。");
  });
});
