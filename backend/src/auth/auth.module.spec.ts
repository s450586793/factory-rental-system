import { AuthModule } from "./auth.module";

describe("AuthModule", () => {
  it("imports throttler support for login rate limiting", () => {
    const imports = Reflect.getMetadata("imports", AuthModule);

    expect(imports.some((item: { module?: { name?: string } }) => item.module?.name === "ThrottlerModule")).toBe(true);
  });
});
