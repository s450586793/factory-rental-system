import { securityHeaders } from "./security-headers";

describe("securityHeaders", () => {
  it("sets defensive browser headers", () => {
    const setHeader = jest.fn();
    const next = jest.fn();

    securityHeaders({} as never, { setHeader } as never, next);

    expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    expect(setHeader).toHaveBeenCalledWith("Referrer-Policy", "strict-origin-when-cross-origin");
    expect(setHeader).toHaveBeenCalledWith("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
    );
    expect(next).toHaveBeenCalled();
  });
});
