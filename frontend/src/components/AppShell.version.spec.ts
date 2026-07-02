import { mount, RouterLinkStub } from "@vue/test-utils";
import AppShell from "./AppShell.vue";
import { APP_UPDATED_AT, APP_VERSION } from "../config/app-meta";

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

describe("AppShell", () => {
  it("shows the current web version and update time", () => {
    const wrapper = mount(AppShell, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
          "el-dropdown": true,
          "el-dropdown-menu": true,
          "el-dropdown-item": true,
        },
      },
    });

    expect(wrapper.text()).toContain(`版本 ${APP_VERSION}`);
    expect(wrapper.text()).toContain(APP_UPDATED_AT);
  });
});
