import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  STANDARD_CONTRACT_SIGNATURE_TAB_STOP,
  assertContractDocumentFieldsComplete,
  buildContractDocumentPdf,
  buildContractDocumentOverlays,
  buildGeneratedContractFilename,
  buildSafetyAgreementSupplementSections,
  buildStandardLeaseContractPages,
} from "./contract-document";
import { Contract, ContractStatus } from "./contract.entity";
import { BillingFrequency, DepositSettlementMode } from "./contract.enums";
import { FactoryUnit } from "../units/factory-unit.entity";
import {
  UtilityMeterConfig,
  UtilityType,
} from "../utilities/utility-meter-config.entity";

const nodeRequire = createRequire(__filename);
const PngJs = nodeRequire("png-js") as {
  new (data: Buffer): {
    decode(callback: (pixels: Buffer) => void): void;
  };
};

function buildContractFixture(): Contract {
  return Object.assign(new Contract(), {
    id: "contract-1",
    unitId: "unit-1",
    lessorName: "江阴市示例产业园有限公司",
    lessorLicenseCode: "91320281TEST000001",
    lessorContactName: "吴孝斌",
    lessorPhone: "18651510352",
    lessorSafetyManager: "吴孝斌",
    tenantName: "曹忠",
    contactName: "曹忠",
    tenantPhone: "",
    licenseCode: "",
    tenantSafetyManager: "曹忠",
    signedDate: "2025-06-28",
    startDate: "2025-07-01",
    endDate: "2026-06-30",
    annualRent: 50000,
    depositAmount: 5000,
    earlyTerminationPenaltyAmount: 4166.67,
    billingFrequency: BillingFrequency.ANNUAL,
    depositSettlementMode: DepositSettlementMode.INITIAL,
    depositCarryoverAmount: 0,
    depositCarryoverSourceContractId: null,
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
    unitPrice: 0.95,
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
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts/render_text_overlays.py",
  );
  const fontPath = path.resolve(process.cwd(), "assets/fonts/Songti.ttc");
  const result = spawnSync("python3", [scriptPath], {
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
  });

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

function renderSignatureOverlay(text: string) {
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts/render_text_overlays.py",
  );
  const fontPath = path.resolve(process.cwd(), "assets/fonts/Songti.ttc");
  const result = spawnSync("python3", [scriptPath], {
    input: JSON.stringify({
      overlays: [
        {
          id: "signature",
          text,
          fontPath,
          fontSize: 10,
          fontIndex: 6,
          rasterScale: 4,
          maxWidth: 480,
          lineHeight: 15,
          tabStops: [STANDARD_CONTRACT_SIGNATURE_TAB_STOP - 58],
        },
      ],
    }),
    encoding: "utf8",
  });

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

async function decodePng(pngBase64: string, width: number, height: number) {
  const png = new PngJs(Buffer.from(pngBase64, "base64"));
  return new Promise<Buffer>((resolve) => {
    png.decode((pixels: Buffer) => resolve(pixels));
  }).then((pixels) => ({ pixels, width, height }));
}

function findFirstInkXNearRow(
  pixels: Buffer,
  width: number,
  height: number,
  row: number,
  startX: number,
) {
  const startRow = Math.max(0, row - 10);
  const endRow = Math.min(height - 1, row + 16);
  let firstX: number | null = null;
  for (let y = startRow; y <= endRow; y += 1) {
    for (let x = startX; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] === 0) {
        continue;
      }
      firstX = firstX === null ? x : Math.min(firstX, x);
      break;
    }
  }
  return firstX;
}

describe("buildContractDocumentOverlays", () => {
  it("builds a contract filename without the auto-generated label", () => {
    expect(
      buildGeneratedContractFilename(
        buildContractFixture(),
        buildUnitFixture(),
      ),
    ).toBe("厂房租赁合同_5_曹忠_2025-07-01_2026-06-30.pdf");
  });

  it("builds a standard factory lease body with core commercial clauses", () => {
    const pages = buildStandardLeaseContractPages({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.map((page) => page.sections.join("\n")).join("\n");

    expect(pages).toHaveLength(7);
    expect(bodyText).toContain("租金支付、押金及逾期违约");
    expect(bodyText).toContain("水电、公摊、税费及其他费用");
    expect(bodyText).toContain("用途限制与转租限制");
    expect(bodyText).toContain("提前解除及违约责任");
    expect(bodyText).toContain("装修审批与恢复原状");
    expect(bodyText).toContain("消防、环保与安全责任边界");
    expect(bodyText).toContain("财产损坏、保险与不可抗力");
    expect(bodyText).toContain("争议解决及法院管辖");
  });

  it("renders complete lessor and tenant identity information", () => {
    const contract = buildContractFixture();
    contract.tenantName = "测试租户有限公司";
    contract.contactName = "张三";
    contract.tenantPhone = "13800000000";
    contract.licenseCode = "91320281TEST000002";
    const pages = buildStandardLeaseContractPages({
      contract,
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    expect(pages[0].sections).toEqual(
      expect.arrayContaining([
        "出租方（甲方）：江阴市示例产业园有限公司    营业执照代码：91320281TEST000001",
        "甲方联系人：吴孝斌    联系电话：18651510352",
        "承租方（乙方）：测试租户有限公司    营业执照代码：91320281TEST000002",
        "乙方联系人：张三    联系电话：13800000000",
      ]),
    );
    expect(pages[0].sections.join("\n")).not.toContain("证照号码");
  });

  it("uses the contract deposit amount in the standard lease body", () => {
    const pages = buildStandardLeaseContractPages({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.map((page) => page.sections.join("\n")).join("\n");

    expect(bodyText).toContain("履约保证金人民币5000.00元");
    expect(bodyText).not.toContain("8333.33元");
  });

  it("renders explicit placeholders instead of fake zero values in a generic template", () => {
    const contract = buildContractFixture();
    contract.signedDate = "____-__-__";
    contract.startDate = "____-__-__";
    contract.endDate = "____-__-__";
    contract.annualRent = Number.NaN;
    contract.earlyTerminationPenaltyAmount = Number.NaN;
    const pages = buildStandardLeaseContractPages({
      contract,
      unit: buildUnitFixture(),
      generatedDate: "2026-08-28",
    });
    const bodyText = pages.flatMap((page) => page.sections).join("\n");

    expect(bodyText).toContain("【填写日期】");
    expect(bodyText).toContain("年租金为人民币【填写】元");
    expect(bodyText).toContain("大写：【填写】");
    expect(bodyText).toContain("履约保证金人民币5000.00元");
    expect(bodyText).toContain("提前解除合同违约金人民币【填写】元");
    expect(bodyText).not.toContain("NaN");
  });

  it("uses the standard delivery condition without deposit carryover wording", () => {
    const pages = buildStandardLeaseContractPages({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.flatMap((page) => page.sections).join("\n");

    expect(bodyText).toContain(
      "甲方应在乙方按约支付首期租金、押金并完成入驻资料提交后，将厂房按现状交付乙方使用。",
    );
    expect(bodyText).not.toContain("支付、结转、补足或退还安排");
  });

  it("states annual rent payments using the contract billing frequency snapshot", () => {
    const pages = buildStandardLeaseContractPages({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.flatMap((page) => page.sections).join("\n");

    expect(bodyText).toContain(
      "租金按年支付，先付后用；每期租金应于该租赁年度开始日支付。",
    );
  });

  it("states semiannual rent payments using the contract billing frequency snapshot", () => {
    const contract = buildContractFixture();
    contract.billingFrequency = BillingFrequency.SEMIANNUAL;
    const pages = buildStandardLeaseContractPages({
      contract,
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.flatMap((page) => page.sections).join("\n");

    expect(bodyText).toContain(
      "租金按半年支付，先付后用；每期租金应于该期开始日支付。",
    );
  });

  it("describes an initial zero deposit without using a carryover snapshot", () => {
    const contract = buildContractFixture();
    contract.depositAmount = 0;
    const pages = buildStandardLeaseContractPages({
      contract,
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.flatMap((page) => page.sections).join("\n");

    expect(bodyText).toContain(
      "乙方应向甲方支付履约保证金人民币0.00元。押金不计利息。",
    );
    expect(bodyText).not.toContain("原已支付押金");
  });

  it("ignores legacy carryover snapshots and uses the current contract deposit amount", () => {
    const contract = buildContractFixture();
    contract.depositSettlementMode = DepositSettlementMode.CARRYOVER;
    contract.depositAmount = 0;
    contract.depositCarryoverAmount = 15000;
    contract.depositCarryoverSourceContractId = "legacy-contract";
    const pages = buildStandardLeaseContractPages({
      contract,
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.flatMap((page) => page.sections).join("\n");

    expect(bodyText).toContain(
      "乙方应向甲方支付履约保证金人民币0.00元。押金不计利息。",
    );
    expect(bodyText).not.toContain("原已支付押金");
    expect(bodyText).not.toContain("乙方尚需补足");
    expect(bodyText).not.toContain("甲方应退还");
  });

  it("states that the lessor provides invoicing and the tenant bears resulting taxes", () => {
    const pages = buildStandardLeaseContractPages({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.map((page) => page.sections.join("\n")).join("\n");

    expect(bodyText).toContain("甲方可按乙方要求提供开票服务");
    expect(bodyText).toContain("乙方应承担并支付因此产生的相应税金");
    expect(bodyText).not.toContain("法律法规有明确承担主体的从其规定");
    expect(bodyText).not.toContain(
      "无明确规定的，由产生该费用或取得相应收益的一方承担",
    );
  });

  it("places the tenant signature column farther to the right", () => {
    const pages = buildStandardLeaseContractPages({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.map((page) => page.sections.join("\n")).join("\n");

    expect(bodyText).toContain(
      "甲方（出租方）：江阴市示例产业园有限公司\t乙方（承租方）：曹忠",
    );
    expect(bodyText).toContain("签字/盖章：\t签字/盖章：");
    expect(bodyText).toContain("日期：2025年6月28日\t日期：2025年6月28日");
  });

  it("renders tenant signature labels on one fixed right-side column", async () => {
    const pages = buildStandardLeaseContractPages({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const lastPage = pages[pages.length - 1];
    const signatureText = lastPage.sections[lastPage.sections.length - 1];
    const rendered = renderSignatureOverlay(signatureText);
    const item = rendered.items[0];
    const image = await decodePng(
      item.pngBase64,
      item.pixelWidth,
      item.pixelHeight,
    );
    const expectedStartX = (STANDARD_CONTRACT_SIGNATURE_TAB_STOP - 58) * 4;
    const tenantStarts = [0, 2, 4].map((lineIndex) =>
      findFirstInkXNearRow(
        image.pixels,
        image.width,
        image.height,
        lineIndex * 15 * 4,
        expectedStartX - 4,
      ),
    );

    for (const startX of tenantStarts) {
      expect(startX).not.toBeNull();
      expect(Math.abs((startX ?? 0) - expectedStartX)).toBeLessThanOrEqual(8);
      expect(startX).toBeGreaterThan(185 * 4);
    }
  });

  it("includes strengthened industrial park risk-control clauses in the lease body", () => {
    const pages = buildStandardLeaseContractPages({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const bodyText = pages.map((page) => page.sections.join("\n")).join("\n");

    expect(bodyText).toContain("逾期超过七日");
    expect(bodyText).toContain("催告送达后七日内");
    expect(bodyText).toContain("甲方有权单方解除本合同");
    expect(bodyText).toContain("从保证金或其他应付乙方的款项中直接抵扣");
    expect(bodyText).toContain(
      "不得将本厂房作为其他企业注册地址、分公司注册地址或其他经营主体备案地址",
    );
    expect(bodyText).toContain("合同终止、解除或期满后三日内");
    expect(bodyText).toContain("超过七日未领取的，视为乙方放弃所有权");
    expect(bodyText).toContain(
      "不得储存易燃易爆、危险化学品、危险废物及国家限制物品",
    );
    expect(bodyText).toContain(
      "乙方应自行购买财产保险、公众责任险、安全生产责任险",
    );
    expect(bodyText).toContain(
      "甲方有权提前通知进入承租区域检查消防、环保、线路、漏水、违建等事项",
    );
    expect(bodyText).toContain("包括电线、配电箱、地坪、门窗、隔墙、广告牌");
    expect(bodyText).toContain("不得在厂房内设置宿舍、住宿或留宿人员");
    expect(bodyText).toContain(
      "停产整顿、限期整改、行政强制措施、民事赔偿或第三方索赔",
    );
    expect(bodyText).toContain("包括罚款、律师费、诉讼费、停租损失等");
    expect(bodyText).toContain("提前解除合同违约金人民币4166.67元");
    expect(bodyText).toContain("甲方委托的第三方专业服务机构");
    expect(bodyText).toContain("停止相关设备、区域、危险作业或生产经营活动");
    expect(bodyText).toContain("乙方不得以行政文书所列责任主体为甲方");
    expect(bodyText).toContain("交接清单、照片、视频");
    expect(bodyText).toContain("搬运费、人工费、仓储费、保管费、垃圾清运费");
  });

  it("adds concise tenant safety duties without weakening the lessor recourse", () => {
    const text = buildSafetyAgreementSupplementSections().join("\n");

    expect(text).toContain("2.21");
    expect(text).toContain("甲方委托的第三方专业服务机构");
    expect(text).toContain("不得拒绝、阻碍、拖延");
    expect(text).toContain("2.22");
    expect(text).toContain("停止相关设备、区域、危险作业或生产经营活动");
    expect(text).toContain("单方面解除租赁合同");
    expect(text).toContain("2.23");
    expect(text).toContain("行政主管部门基于出租方");
    expect(text).toContain("向甲方承担全部补偿、赔偿及追偿责任");
    expect(text).toContain("收到甲方通知后五日内");
    expect(text).not.toContain("按照甲乙双方过错比例");
  });

  it("rejects formal generation when required safety agreement information is blank", () => {
    const contract = buildContractFixture();
    contract.tenantSafetyManager = "";

    expect(() =>
      assertContractDocumentFieldsComplete({
        contract,
        unit: buildUnitFixture(),
        generatedDate: "2026-07-01",
      }),
    ).toThrow("乙方安全管理负责人");
  });

  it("appends the existing safety production agreement after the standard lease body", async () => {
    const payload = {
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    };

    const buffer = await buildContractDocumentPdf(payload);
    const pdf = await PDFDocument.load(buffer);

    expect(pdf.getPageCount()).toBe(
      buildStandardLeaseContractPages(payload).length + 8,
    );
  }, 20000);

  it("replaces the full safety agreement introduction with fluent text and the signing date", () => {
    const overlays = buildContractDocumentOverlays({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });
    const safetyIntroduction = overlays.find(
      (item) => item.id === "page4-introduction",
    );
    const safetyClause27 = overlays.find(
      (item) => item.id === "page8-clause-2-7",
    );
    const utilityClause = overlays.find((item) => item.id === "page1-utility");

    expect(safetyIntroduction).toMatchObject({
      pageIndex: 3,
      x: 78,
      top: 174,
      clearWidth: 460,
      clearHeight: 244,
      maxWidth: 460,
      lineHeight: 28,
      maxLines: 8,
    });
    expect(safetyIntroduction?.text).toContain(
      "甲乙双方就已于2025年6月28日签订的《厂房租赁合同》所涉安全管理事项订立本协议",
    );
    expect(safetyIntroduction?.text).toContain(
      "本协议为该租赁合同的附件，与该租赁合同具有同等法律效力",
    );
    expect(safetyIntroduction?.text).not.toContain("在原签订的租赁合同");
    expect(safetyClause27?.text).toContain(
      "甲方及甲方委托的第三方专业服务机构",
    );
    expect(safetyClause27?.text).toContain("如实提供相关资料");
    expect(utilityClause).toBeDefined();
    if (!safetyIntroduction || !utilityClause) {
      throw new Error("合同覆盖层缺少必要字段");
    }

    expect(utilityClause).toMatchObject({
      text: "1、租赁期间，使用该厂房所发生的水、电等费用由乙方承担，电费0.95元/度，线损耗按5.00%计算，水费1.00元/吨；",
    });
    expect(utilityClause?.x).toBeLessThanOrEqual(64);
    expect(utilityClause.x + (utilityClause.paddingX ?? 0)).toBe(84);
    expect(utilityClause?.clearHeight).toBeGreaterThanOrEqual(70);
  });

  it("keeps the generic signing-date placeholder inside the safety agreement introduction", () => {
    const contract = buildContractFixture();
    contract.signedDate = "____-__-__";
    const overlays = buildContractDocumentOverlays({
      contract,
      unit: buildUnitFixture(),
      generatedDate: "2026-08-28",
    });
    const safetyIntroduction = overlays.find(
      (item) => item.id === "page4-introduction",
    );

    expect(safetyIntroduction?.text).toContain(
      "就已于【填写日期】签订的《厂房租赁合同》所涉安全管理事项",
    );
    expect(safetyIntroduction?.maxWidth).toBeLessThanOrEqual(
      safetyIntroduction?.clearWidth ?? 0,
    );
  });

  it("fills safety managers and authorized representatives without blanks", () => {
    const overlays = buildContractDocumentOverlays({
      contract: buildContractFixture(),
      unit: buildUnitFixture(),
      generatedDate: "2026-07-01",
    });

    expect(overlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "page4-lessor",
          text: "江阴市示例产业园有限公司",
        }),
        expect.objectContaining({
          id: "page10-lessor-contact",
          text: "吴孝斌同志",
        }),
        expect.objectContaining({
          id: "page10-tenant-contact",
          text: "曹忠同志",
        }),
        expect.objectContaining({
          id: "page10-lessor-signatory",
          text: "吴孝斌",
        }),
        expect.objectContaining({
          id: "page10-tenant-signatory",
          text: "曹忠",
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
    expect(safetyPeriod.x - (safetyPeriod.padding ?? 2)).toBeLessThanOrEqual(
      230,
    );
    expect(
      safetyPeriod.x + safetyPeriod.clearWidth + (safetyPeriod.padding ?? 2),
    ).toBeGreaterThanOrEqual(470);
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
