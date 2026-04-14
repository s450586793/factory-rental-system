import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { Response } from "express";
import { AuthService } from "./auth.service";

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
}));

describe("AuthService", () => {
  const authConfig = {
    jwtSecret: "secret",
    cookieSecure: true,
    cookieName: "token",
    adminUsername: "admin",
    adminPassword: "admin123456",
  };

  function createService(overrides?: { compareResult?: boolean; user?: { id: string; username: string; passwordHash: string } | null }) {
    const usersService = {
      findByUsername: jest.fn().mockResolvedValue(
        overrides?.user ?? {
          id: "u1",
          username: "admin",
          passwordHash: "$2b$10$123456789012345678901uQyYo7f3rroWAt4EvsC0BpFkOukgqS6",
        },
      ),
      getRepository: jest.fn(),
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue("jwt-token"),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(authConfig),
    };

    const service = new AuthService(
      usersService as never,
      jwtService as never,
      configService as never,
    );

    return {
      service,
      usersService,
      jwtService,
      configService,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockCompare(result: boolean) {
    const compareMock = bcrypt.compare as unknown as jest.Mock<
      Promise<boolean>,
      [string, string]
    >;
    compareMock.mockResolvedValue(result);
    return compareMock;
  }

  it("writes login cookie when credentials are valid", async () => {
    const { service, jwtService } = createService();
    const compareSpy = mockCompare(true);
    const response = {
      cookie: jest.fn(),
    } as unknown as Response;

    const result = await service.login(
      { username: "admin", password: "admin123456" },
      response,
    );

    expect(compareSpy).toHaveBeenCalled();
    expect(jwtService.signAsync).toHaveBeenCalled();
    expect((response.cookie as jest.Mock).mock.calls[0][0]).toBe("token");
    expect(result).toEqual({
      user: {
        id: "u1",
        username: "admin",
      },
    });
  });

  it("rejects invalid credentials", async () => {
    const { service } = createService();
    mockCompare(false);

    await expect(
      service.login(
        { username: "admin", password: "wrong-password" },
        { cookie: jest.fn() } as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("clears the auth cookie on logout", () => {
    const { service } = createService();
    const response = {
      clearCookie: jest.fn(),
    } as unknown as Response;

    expect(service.logout(response)).toEqual({ success: true });
    expect((response.clearCookie as jest.Mock).mock.calls[0][0]).toBe("token");
  });
});
