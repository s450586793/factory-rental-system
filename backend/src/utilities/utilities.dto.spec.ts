import { validate } from "class-validator";
import {
  MarkUtilityRecordPaidDto,
  UtilityPrefillQueryDto,
} from "./utilities.dto";
import { UtilityType } from "./utility-meter-config.entity";

function buildDto(overrides: Partial<MarkUtilityRecordPaidDto> = {}) {
  return Object.assign(new MarkUtilityRecordPaidDto(), overrides);
}

describe("MarkUtilityRecordPaidDto", () => {
  it("allows payment method and attachment file ids to be omitted", async () => {
    const errors = await validate(buildDto());

    expect(errors).toEqual([]);
  });

  it.each([
    ["paymentMethod", { paymentMethod: null }],
    ["attachmentFileIds", { attachmentFileIds: null }],
  ])("rejects explicit null for %s", async (property, overrides) => {
    const errors = await validate(buildDto(overrides as never));

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property,
        }),
      ]),
    );
  });

  it("accepts a payment method and UUID v4 attachment file ids", async () => {
    const errors = await validate(
      buildDto({
        paymentMethod: "微信",
        attachmentFileIds: ["550e8400-e29b-41d4-a716-446655440000"],
      }),
    );

    expect(errors).toEqual([]);
  });

  it("accepts an empty attachment file id array for explicit clearing", async () => {
    const errors = await validate(
      buildDto({
        attachmentFileIds: [],
      }),
    );

    expect(errors).toEqual([]);
  });
});

describe("UtilityPrefillQueryDto", () => {
  it("requires the selected contract id", async () => {
    const dto = Object.assign(new UtilityPrefillQueryDto(), {
      unitId: "unit-1",
      type: UtilityType.ELECTRIC,
      contractId: "",
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "contractId" }),
      ]),
    );
  });
});
