import { validateEnvironment } from "./env.validation";

const validEnv: Record<string, string> = {
  APP_NAME: "factory-rental-system",
  NODE_ENV: "test",
  PORT: "3000",
  FRONTEND_ORIGIN: "http://localhost:8080",
  JWT_SECRET: "test-secret",
  COOKIE_SECURE: "false",
  COOKIE_NAME: "token",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "admin123456",
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_NAME: "factory_rental",
  DB_USER: "postgres",
  DB_PASSWORD: "postgres",
  DB_SYNCHRONIZE: "false",
  STORAGE_ROOT: "/tmp/storage",
  PDF_FONT_PATH: "/tmp/font.ttf",
};

describe("validateEnvironment", () => {
  it("accepts a complete runtime environment", () => {
    expect(() => validateEnvironment(validEnv)).not.toThrow();
  });

  it("rejects invalid boolean values", () => {
    expect(() =>
      validateEnvironment({
        ...validEnv,
        DB_SYNCHRONIZE: "maybe",
      }),
    ).toThrow("DB_SYNCHRONIZE");
  });

  it("rejects missing required secrets", () => {
    expect(() =>
      validateEnvironment({
        ...validEnv,
        JWT_SECRET: "",
      }),
    ).toThrow("JWT_SECRET");
  });

  it("defaults production cookies to secure", () => {
    const env: Record<string, string> = {
      ...validEnv,
      NODE_ENV: "production",
    };
    delete env.COOKIE_SECURE;

    expect(validateEnvironment(env).COOKIE_SECURE).toBe("true");
  });

  it("defaults production API docs to disabled", () => {
    const env: Record<string, string> = {
      ...validEnv,
      NODE_ENV: "production",
    };
    delete env.API_DOCS_ENABLED;

    expect(validateEnvironment(env).API_DOCS_ENABLED).toBe("false");
  });

  it("rejects invalid web update boolean values", () => {
    expect(() =>
      validateEnvironment({
        ...validEnv,
        WEB_UPDATE_ENABLED: "yes",
      }),
    ).toThrow("WEB_UPDATE_ENABLED");
  });
});
