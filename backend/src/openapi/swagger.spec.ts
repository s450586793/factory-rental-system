import { setupSwagger } from "./swagger";

jest.mock("@nestjs/swagger", () => ({
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addCookieAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  })),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({}),
    setup: jest.fn(),
  },
}));

const { SwaggerModule } = jest.requireMock("@nestjs/swagger");

describe("setupSwagger", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("does not expose Swagger when API docs are disabled", () => {
    setupSwagger({} as never, {
      cookieName: "token",
      enabled: false,
    });

    expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
    expect(SwaggerModule.setup).not.toHaveBeenCalled();
  });

  it("exposes Swagger when API docs are enabled", () => {
    const app = {} as never;

    setupSwagger(app, {
      cookieName: "token",
      enabled: true,
    });

    expect(SwaggerModule.createDocument).toHaveBeenCalledWith(app, {});
    expect(SwaggerModule.setup).toHaveBeenCalledWith("api/docs", app, {}, {
      jsonDocumentUrl: "api/docs-json",
    });
  });
});
