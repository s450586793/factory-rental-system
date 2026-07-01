import { mount, RouterLinkStub } from "@vue/test-utils";
import AppShell from "./AppShell.vue";

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

    expect(wrapper.text()).toContain("版本 V0.1.9");
    expect(wrapper.text()).toContain("2026-07-01 21:51 CST");
  });
});
