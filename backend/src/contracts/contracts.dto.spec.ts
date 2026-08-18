import { validate } from "class-validator";
import { CreateContractDto } from "./contracts.dto";

function buildDto(overrides: Partial<CreateContractDto> = {}) {
  return Object.assign(new CreateContractDto(), {
    unitId: "unit-1",
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    annualRent: 50000,
    depositAmount: 10000,
    ...overrides,
  });
}

describe("CreateContractDto", () => {
  it("allows all party identity fields to be omitted", async () => {
    const errors = await validate(buildDto());

    expect(errors).toEqual([]);
  });

  it("enforces the lessor name length limit", async () => {
    const errors = await validate(
      buildDto({
        lessorName: "甲".repeat(121),
      } as Partial<CreateContractDto>),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: "lessorName",
        }),
      ]),
    );
  });
});
