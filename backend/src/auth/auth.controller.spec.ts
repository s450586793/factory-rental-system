import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  it("rate limits login attempts without limiting the whole module", () => {
    const loginHandler = AuthController.prototype.login;

    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", loginHandler)).toBe(5);
    expect(Reflect.getMetadata("THROTTLER:TTLdefault", loginHandler)).toBe(60_000);
  });
});
