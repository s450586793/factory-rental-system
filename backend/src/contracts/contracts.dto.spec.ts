import { validate } from "class-validator";
import { BillingFrequency } from "./contract.enums";
import { CreateContractDto } from "./contracts.dto";

function buildDto(overrides: Record<string, unknown> = {}) {
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

  it("accepts the supported billing frequency", async () => {
    const errors = await validate(
      buildDto({
        billingFrequency: BillingFrequency.SEMIANNUAL,
      }),
    );

    expect(errors).toEqual([]);
  });

  it.each([
    ["annualRent", 0],
    ["billingFrequency", "monthly"],
  ])("rejects an invalid %s", async (property, value) => {
    const errors = await validate(buildDto({ [property]: value }));

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property }),
      ]),
    );
  });

  it("rejects an explicit null billing frequency", async () => {
    const property = "billingFrequency";
    const errors = await validate(buildDto({ [property]: null }));

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property }),
      ]),
    );
  });

  it.each([
    ["depositSettlementMode", "carryover"],
    ["depositCarryoverAmount", 10000],
    ["depositCarryoverSourceContractId", "00000000-0000-4000-8000-000000000001"],
  ])("rejects the legacy non-whitelisted %s field", async (property, value) => {
    const errors = await validate(buildDto({ [property]: value }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property }),
      ]),
    );
  });
});
