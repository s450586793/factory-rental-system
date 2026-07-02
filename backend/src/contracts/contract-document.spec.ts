import { spawnSync } from "node:child_process";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  buildContractDocumentPdf,
  buildContractDocumentOverlays,
  buildStandardLeaseContractPages,
} from "./contract-document";
import { Contract, ContractStatus } from "./contract.entity";
import { FactoryUnit } from "../units/factory-unit.entity";
import { UtilityMeterConfig, UtilityType } from "../utilities/utility-meter-config.entity";

function buildContractFixture() {
  return Object.assign(new Contract(), {
    id: "contract-1",
    unitId: "unit-1",
    tenantName: "曹忠",
    contactName: "曹忠",
    tenantPhone: "",
    licenseCode: "",
    startDate: "2025-07-01",
    endDate: "2026-06-30",
    annualRent: 50000,
    status: ContractStatus.ACTIVE,
    businessLicenseFileId: null,
    businessLicenseFile: null,
    attachmentFiles: [],
  });
}

function buildUnitFixture() {
  const electric = Object.assign(new UtilityMeterConfig(), {
    id: "meter-electric",
    unitId: "unit-1",
    type: UtilityType.ELECTRIC,
    name: "电表",
    initialReading: 0,
    multiplier: 1,
    unitPrice: 1,
    lineLossPercent: 5,
    enabled: true,
  });
  const water = Object.assign(new UtilityMeterConfig(), {
    id: "meter-water",
    unitId: "unit-1",
    type: UtilityType.WATER,
    name: "水表",
    initialReading: 0,
    multiplier: 1,
    unitPrice: 1,
    lineLossPercent: 0,
    enabled: true,
  });

  return Object.assign(new FactoryUnit(), {
    id: "unit-1",
    code: "5",
    location: "北门仓库",
    area: 400,
    meterConfigs: [electric, water],
  }) as FactoryUnit & { meterConfigs: UtilityMeterConfig[] };
}

function renderOverlayWithScript() {
  const scriptPath = path.resolve(process.cwd(), "scripts/render_text_overlays.py");
  const fontPath = path.resolve(process.cwd(), "assets/fonts/Songti.ttc");
  const result = spawnSync(
    "python3",
    [scriptPath],
    {
      input: JSON.stringify({
        overlays: [
          {
            id: "tenant",
            text: "曹忠",
            fontPath,
            fontSize: 14,
            fontIndex: 6,
            rasterScale: 4,
          },
        ],
      }),
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr);
  }

  return JSON.parse(result.stdout) as {
    items: Array<{
      id: string;
      width: number;
      height: number;
      pixelWidth: number;
      pixelHeight: number;
      pngBase64: string;
    }>;
  };
}

describe("buildContractDocumentOverlays", () => {
  it("builds a standard factory lease body with core commercial clauses", () => {
    const pages = buildStandardLeaseContractPages({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.map((page) => page.sections.join("\n")).join("\n");

    expect(pages.length).toBeGreaterThanOrEqual(5);
    expect(pages.length).toBeLessThanOrEqual(8);
    expect(bodyText).toContain("租金支付、押金及逾期违约");
    expect(bodyText).toContain("水电、公摊、税费及其他费用");
    expect(bodyText).toContain("用途限制与转租限制");
    expect(bodyText).toContain("提前解除及违约责任");
    expect(bodyText).toContain("装修审批与恢复原状");
    expect(bodyText).toContain("消防、环保与安全责任边界");
    expect(bodyText).toContain("财产损坏、保险与不可抗力");
    expect(bodyText).toContain("争议解决及法院管辖");
  });

  it("appends the existing safety production agreement after the standard lease body", async () => {
    const payload = {
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    };

    const buffer = await buildContractDocumentPdf(payload);
    const pdf = await PDFDocument.load(buffer);

    expect(pdf.getPageCount()).toBe(buildStandardLeaseContractPages(payload).length + 7);
  }, 20000);

  it("uses contract start date in the safety agreement and fully clears replaced template text", () => {
    const overlays = buildContractDocumentOverlays({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const safetySignDate = overlays.find((item) => item.id === "page4-sign-date");
    const utilityClause = overlays.find((item) => item.id === "page1-utility");

    expect(safetySignDate).toMatchObject({
      text: "2025年7月1日签订",
    });
    expect(utilityClause).toBeDefined();
    if (!safetySignDate || !utilityClause) {
      throw new Error("合同覆盖层缺少必要字段");
    }

    const safetyPadding = safetySignDate.padding ?? 2;
    const safetyPaddingX = safetySignDate.paddingX ?? 0;
    expect(safetySignDate.x - safetyPadding).toBeLessThanOrEqual(204);
    expect(safetySignDate.x + safetyPaddingX).toBe(214);
    expect(safetySignDate.x + safetySignDate.clearWidth + safetyPadding).toBeLessThanOrEqual(310);

    expect(utilityClause).toMatchObject({
      text: "1、租赁期间，使用该厂房所发生的水、电等费用由乙方承担，电费1.00元/度，线损耗按5.00%计算，水费1.00元/吨；",
    });
    expect(utilityClause?.x).toBeLessThanOrEqual(64);
    expect(utilityClause.x + (utilityClause.paddingX ?? 0)).toBe(84);
    expect(utilityClause?.clearHeight).toBeGreaterThanOrEqual(70);
  });

  it("keeps the safety contact title text complete when filling contact names", () => {
    const overlays = buildContractDocumentOverlays({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });

    expect(overlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "page10-lessor-contact",
          text: "吴孝斌同志",
        }),
        expect.objectContaining({
          id: "page10-tenant-contact",
          text: "曹忠同志",
        }),
      ]),
    );
  });

  it("fully clears the safety agreement validity period placeholder", () => {
    const overlays = buildContractDocumentOverlays({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const safetyPeriod = overlays.find((item) => item.id === "page10-period");

    expect(safetyPeriod).toBeDefined();
    if (!safetyPeriod) {
      throw new Error("安全协议有效期覆盖层缺失");
    }

    expect(safetyPeriod.text).toBe("2025年7月1日至2026年6月30日；有效");
    expect(safetyPeriod.x - (safetyPeriod.padding ?? 2)).toBeLessThanOrEqual(230);
    expect(safetyPeriod.x + safetyPeriod.clearWidth + (safetyPeriod.padding ?? 2)).toBeGreaterThanOrEqual(
      470,
    );
  });

  it("renders replacement text with the regular Songti face instead of the black face", () => {
    const overlays = buildContractDocumentOverlays({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });

    expect(overlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "page1-tenant",
          fontIndex: 6,
        }),
        expect.objectContaining({
          id: "page1-unit",
          fontIndex: 6,
        }),
        expect.objectContaining({
          id: "page1-period",
          fontIndex: 6,
        }),
      ]),
    );
  });

  it("renders replacement text at a higher raster resolution than the displayed size", () => {
    const rendered = renderOverlayWithScript();
    const item = rendered.items[0];

    expect(item.pixelWidth).toBeGreaterThan(item.width);
    expect(item.pixelHeight).toBeGreaterThan(item.height);
  });
});
