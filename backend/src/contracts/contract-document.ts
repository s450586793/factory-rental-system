import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFPage, rgb } from "pdf-lib";
import { toChineseCurrencyUppercase } from "../common/format/chinese-currency";
import { Contract } from "./contract.entity";
import { FactoryUnit } from "../units/factory-unit.entity";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";

export const GENERATED_CONTRACT_PREFIX = "自动生成厂房租赁合同_";
export const GENERATED_CONTRACT_VIRTUAL_FILE_PREFIX = "contract-document--";

const LESSOR_NAME = "吴孝斌";
const LESSOR_COMPANY = "吴孝斌";
const FACTORY_ADDRESS = "江阴市澄江街道澄山路265号";
const TEMPLATE_FILE = "厂房租赁协议+安全协议模板.pdf";
const FONT_FILE = "Songti.ttc";
const RENDER_SCRIPT = "render_text_overlays.py";

type ContractDocumentPayload = {
  contract: Contract;
  unit: FactoryUnit & { meterConfigs: UtilityMeterConfig[] };
  generatedDate: string;
};

type DateParts = {
  year: string;
  month: string;
  day: string;
};

type TemplateOverlay = {
  id: string;
  pageIndex: number;
  text: string;
  x: number;
  top: number;
  clearWidth: number;
  clearHeight: number;
  fontSize?: number;
  maxWidth?: number;
  lineHeight?: number;
  maxLines?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  align?: "left" | "center" | "right";
};

type RasterizedOverlay = {
  id: string;
  width: number;
  height: number;
  png: Buffer;
};

function splitDateParts(value: string): DateParts {
  const [year = "", month = "", day = ""] = value.split("-");
  return {
    year,
    month: String(Number(month || 0) || ""),
    day: String(Number(day || 0) || ""),
  };
}

function formatDateForText(parts: DateParts) {
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

function formatArea(area: number | null) {
  if (area === null || area === undefined || Number.isNaN(area)) {
    return "";
  }

  return Number(area).toLocaleString("zh-CN", {
    minimumFractionDigits: Number.isInteger(area) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

function buildUtilityClause(meters: UtilityMeterConfig[]) {
  const enabled = meters.filter((item) => item.enabled);
  const electricMeters = enabled.filter((item) => item.type === "electric");
  const waterMeters = enabled.filter((item) => item.type === "water");

  const electricPrice = electricMeters[0]?.unitPrice;
  const electricLoss = electricMeters[0]?.lineLossPercent;
  const waterPrice = waterMeters[0]?.unitPrice;

  const electricText =
    electricMeters.length === 0
      ? "电费按甲方现场表计配置执行"
      : electricMeters.every(
            (item) =>
              item.unitPrice === electricPrice &&
              item.lineLossPercent === electricLoss,
          )
        ? `电费${formatMoney(electricPrice || 0)}元/度，线损耗按${formatMoney(electricLoss || 0)}%计算`
        : "电费按各启用电表配置执行";

  const waterText =
    waterMeters.length === 0
      ? "水费按甲方现场表计配置执行"
      : waterMeters.every((item) => item.unitPrice === waterPrice)
        ? `水费${formatMoney(waterPrice || 0)}元/吨`
        : "水费按各启用水表配置执行";

  return `1、租赁期间，使用该厂房所发生的水、电等费用由乙方承担，${electricText}，${waterText}；`;
}

function buildUnitLabel(unit: FactoryUnit) {
  const segments = [unit.location];
  if (unit.code) {
    segments.push(`编号${unit.code}`);
  }
  if (unit.area !== null && unit.area !== undefined && !Number.isNaN(unit.area)) {
    segments.push(`面积${formatArea(unit.area)}平方米`);
  }
  return segments.join("，");
}

function resolveRuntimePath(type: "assets" | "scripts", ...segments: string[]) {
  const roots =
    type === "assets"
      ? [
          path.resolve(__dirname, "../../assets"),
          path.resolve(process.cwd(), "assets"),
          path.resolve(process.cwd(), "backend/assets"),
        ]
      : [
          path.resolve(__dirname, "../../scripts"),
          path.resolve(process.cwd(), "scripts"),
          path.resolve(process.cwd(), "backend/scripts"),
        ];

  const matched = roots
    .map((root) => path.resolve(root, ...segments))
    .find((candidate) => existsSync(candidate));

  if (!matched) {
    throw new Error(`模板资源不存在：${type}/${segments.join("/")}`);
  }

  return matched;
}

function clearArea(page: PDFPage, x: number, top: number, width: number, height: number, padding = 2) {
  page.drawRectangle({
    x: x - padding,
    y: page.getHeight() - top - height - padding,
    width: width + padding * 2,
    height: height + padding * 2,
    color: rgb(1, 1, 1),
  });
}

function renderTextOverlays(fontPath: string, overlays: TemplateOverlay[]): RasterizedOverlay[] {
  if (overlays.length === 0) {
    return [];
  }

  const scriptPath = resolveRuntimePath("scripts", RENDER_SCRIPT);
  const result = spawnSync(
    "python3",
    [scriptPath],
    {
      input: JSON.stringify({
        fontPath,
        overlays: overlays.map((overlay) => ({
          id: overlay.id,
          text: overlay.text,
          fontPath,
          fontSize: overlay.fontSize ?? 14,
          maxWidth: overlay.maxWidth ?? null,
          lineHeight: overlay.lineHeight ?? Math.ceil((overlay.fontSize ?? 14) * 1.4),
          maxLines: overlay.maxLines ?? 99,
          align: overlay.align ?? "left",
          paddingX: overlay.paddingX ?? 0,
          paddingY: overlay.paddingY ?? 0,
        })),
      }),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "合同模板文字渲染失败");
  }

  const parsed = JSON.parse(result.stdout) as {
    items: Array<{ id: string; width: number; height: number; pngBase64: string }>;
  };

  return parsed.items.map((item) => ({
    id: item.id,
    width: item.width,
    height: item.height,
    png: Buffer.from(item.pngBase64, "base64"),
  }));
}

async function drawRasterOverlay(
  pdf: PDFDocument,
  page: PDFPage,
  overlay: TemplateOverlay,
  raster: RasterizedOverlay,
) {
  clearArea(
    page,
    overlay.x,
    overlay.top,
    overlay.clearWidth,
    overlay.clearHeight,
    overlay.padding ?? 2,
  );
  const image = await pdf.embedPng(raster.png);
  page.drawImage(image, {
    x: overlay.x,
    y: page.getHeight() - overlay.top - raster.height,
    width: raster.width,
    height: raster.height,
  });
}

export function buildGeneratedContractFilename(contract: Contract, unit: FactoryUnit) {
  const safeTenant = contract.tenantName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "乙方";
  return `${GENERATED_CONTRACT_PREFIX}${unit.code}_${safeTenant}_${contract.startDate}_${contract.endDate}.pdf`;
}

export function buildGeneratedContractVirtualFileId(contractId: string) {
  return `${GENERATED_CONTRACT_VIRTUAL_FILE_PREFIX}${contractId}`;
}

export function parseGeneratedContractVirtualFileId(fileId: string) {
  if (!fileId.startsWith(GENERATED_CONTRACT_VIRTUAL_FILE_PREFIX)) {
    return null;
  }

  return fileId.slice(GENERATED_CONTRACT_VIRTUAL_FILE_PREFIX.length) || null;
}

export async function buildContractDocumentPdf({
  contract,
  unit,
  generatedDate,
}: ContractDocumentPayload) {
  const templatePath = resolveRuntimePath("assets", "templates", TEMPLATE_FILE);
  const fontPath = resolveRuntimePath("assets", "fonts", FONT_FILE);
  const templateBytes = await readFile(templatePath);

  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();

  const startParts = splitDateParts(contract.startDate);
  const endParts = splitDateParts(contract.endDate);
  const generatedParts = splitDateParts(generatedDate);
  const unitLabel = buildUnitLabel(unit);
  const annualRentUppercase = toChineseCurrencyUppercase(contract.annualRent);
  const annualRentText = formatMoney(contract.annualRent);
  const utilityClause = buildUtilityClause(unit.meterConfigs);
  const signDate = formatDateForText(generatedParts);

  const overlays: TemplateOverlay[] = [
    {
      id: "page1-tenant",
      pageIndex: 0,
      text: contract.tenantName,
      x: 170,
      top: 139,
      clearWidth: 260,
      clearHeight: 22,
      fontSize: 14,
      maxWidth: 260,
    },
    {
      id: "page1-unit",
      pageIndex: 0,
      text: unitLabel,
      x: 90,
      top: 325,
      clearWidth: 320,
      clearHeight: 22,
      fontSize: 13,
      maxWidth: 320,
    },
    {
      id: "page1-period",
      pageIndex: 0,
      text: `1、厂房租赁自${formatDateForText(startParts)}起，至${formatDateForText(endParts)}止。`,
      x: 84,
      top: 420,
      clearWidth: 450,
      clearHeight: 22,
      fontSize: 12,
      maxWidth: 450,
    },
    {
      id: "page1-rent",
      pageIndex: 0,
      text: `1、甲、乙双方约定，租赁年租金为：${annualRentText}元。大写：${annualRentUppercase}`,
      x: 84,
      top: 607,
      clearWidth: 430,
      clearHeight: 22,
      fontSize: 12,
      maxWidth: 430,
    },
    {
      id: "page1-utility",
      pageIndex: 0,
      text: utilityClause,
      x: 84,
      top: 700,
      clearWidth: 445,
      clearHeight: 52,
      fontSize: 12,
      maxWidth: 445,
      lineHeight: 18,
      maxLines: 3,
    },
    {
      id: "page4-lessor",
      pageIndex: 3,
      text: LESSOR_COMPANY,
      x: 302,
      top: 103,
      clearWidth: 210,
      clearHeight: 22,
      fontSize: 12,
      maxWidth: 210,
    },
    {
      id: "page4-tenant",
      pageIndex: 3,
      text: contract.tenantName,
      x: 302,
      top: 146,
      clearWidth: 210,
      clearHeight: 22,
      fontSize: 12,
      maxWidth: 210,
    },
    {
      id: "page4-sign-date",
      pageIndex: 3,
      text: signDate,
      x: 214,
      top: 364,
      clearWidth: 115,
      clearHeight: 22,
      fontSize: 11,
      maxWidth: 115,
    },
    {
      id: "page10-lessor-contact",
      pageIndex: 9,
      text: LESSOR_NAME,
      x: 178,
      top: 155,
      clearWidth: 46,
      clearHeight: 20,
      fontSize: 11,
      maxWidth: 46,
    },
    {
      id: "page10-tenant-contact",
      pageIndex: 9,
      text: contract.contactName || contract.tenantName,
      x: 301,
      top: 186,
      clearWidth: 48,
      clearHeight: 20,
      fontSize: 11,
      maxWidth: 48,
    },
    {
      id: "page10-period",
      pageIndex: 9,
      text: `${formatDateForText(startParts)}至${formatDateForText(endParts)}`,
      x: 230,
      top: 592,
      clearWidth: 195,
      clearHeight: 22,
      fontSize: 11,
      maxWidth: 195,
    },
  ];

  const rasterized = renderTextOverlays(fontPath, overlays);
  const rasterMap = new Map(rasterized.map((item) => [item.id, item]));

  for (const overlay of overlays) {
    const raster = rasterMap.get(overlay.id);
    if (!raster) {
      continue;
    }
    await drawRasterOverlay(pdf, pages[overlay.pageIndex], overlay, raster);
  }

  return Buffer.from(await pdf.save());
}
