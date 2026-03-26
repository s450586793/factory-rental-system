import { mount } from "@vue/test-utils";
import LoginView from "./LoginView.vue";

vi.mock("vue-router", () => ({
  useRoute: () => ({
    query: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("../../../stores/auth", () => ({
  useAuthStore: () => ({
    login: vi.fn(),
    state: {
      user: null,
    },
  }),
}));

describe("LoginView", () => {
  it("renders the login entry page", () => {
    const wrapper = mount(LoginView, {
      global: {
        stubs: {
          "el-form": true,
          "el-form-item": true,
          "el-input": true,
          "el-button": true,
        },
      },
    });

    expect(wrapper.text()).toContain("登录系统");
    expect(wrapper.text()).toContain("进入后台");
  });
});
