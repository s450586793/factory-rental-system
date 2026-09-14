import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UnitsPageQueryDto } from "./units.dto";
import { UnitsService } from "./units.service";

describe("units pagination", () => {
  afterEach(() => jest.useRealTimers());

  it("defaults to 20 items and transforms query strings", async () => {
    expect(plainToInstance(UnitsPageQueryDto, {})).toEqual({ page: 1, pageSize: 20 });
    const query = plainToInstance(UnitsPageQueryDto, { page: "3", pageSize: "50" });
    expect(await validate(query)).toEqual([]);
    expect(query).toEqual({ page: 3, pageSize: 50 });
  });

  it.each([
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "1000001" },
    { pageSize: "0" }, { pageSize: "101" }, { pageSize: "2; SELECT 1" },
  ])("rejects invalid or unbounded pagination %j", async (query) => {
    expect(await validate(plainToInstance(UnitsPageQueryDto, query))).not.toHaveLength(0);
  });

  it("paginates in the database without hydrating legacy relations", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-14T00:00:00Z"));
    const result = {
      items: [], total: 41,
      stats: { occupiedCount: 30, vacantCount: 5, expiredCount: 6, expiringCount: 2, activeRentSum: 100000 },
    };
    const repository = { query: jest.fn().mockResolvedValue([result]), find: jest.fn() };
    const summaries = { getContractSummaries: jest.fn() };
    const service = new UnitsService(repository as never, {} as never, {} as never, summaries as never);

    expect(await service.listPage({ page: 3, pageSize: 20 })).toEqual({ ...result, page: 3, pageSize: 20 });
    expect(repository.query).toHaveBeenCalledWith(expect.any(String), ["2026-09-14", 20, 40]);
    expect(repository.find).not.toHaveBeenCalled();
    expect(summaries.getContractSummaries).not.toHaveBeenCalled();
  });
});
