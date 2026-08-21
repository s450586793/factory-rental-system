import router from "./index";

vi.mock("../stores/auth", () => ({
  useAuthStore: () => ({
    state: { user: null },
    initialize: vi.fn(),
  }),
}));

describe("router", () => {
  it("registers rent reconciliation as an authenticated route", () => {
    const route = router.getRoutes().find((item) => item.name === "rent-reconciliation");

    expect(route).toEqual(
      expect.objectContaining({
        path: "/rent-reconciliation",
        meta: expect.objectContaining({ requiresAuth: true }),
      }),
    );
  });
});
