import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("returns app and database status", () => {
    const service = new HealthService(
      { isInitialized: true } as never,
      {
        getOrThrow: jest.fn().mockReturnValue({
          name: "factory-rental-system",
          environment: "test",
        }),
      } as never,
    );

    expect(service.getHealth()).toMatchObject({
      status: "ok",
      app: {
        name: "factory-rental-system",
        environment: "test",
      },
      database: {
        initialized: true,
      },
    });
  });
});
