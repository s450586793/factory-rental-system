import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import PDFDocument from "pdfkit";
import { access, mkdir, rm } from "fs/promises";
import { createWriteStream } from "fs";
import { join } from "path";
import { Repository } from "typeorm";
import { formatShanghaiDate } from "../common/date/shanghai-date";
import { toChineseCurrencyUppercase } from "../common/format/chinese-currency";
import type { StorageConfig } from "../config/storage.config";
import { StoredFileCategory } from "../files/stored-file.entity";
import { FilesService } from "../files/files.service";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { UtilityChargeRecord, UtilityChargeStatus } from "../utilities/utility-charge-record.entity";
import { convertDocxToPdf, renderReceiptTemplateDocx } from "./receipt-template";
import { CreateReceiptDto } from "./receipts.dto";
import { Receipt, ReceiptSourceType, ReceiptStatus } from "./receipt.entity";

type ReceiptSourcePayload = {
  amount: number;
  tenantName: string;
  unitCode: string;
  summary: string;
  paymentDate: string;
  paymentMethod: string;
  reason: string;
};

const RECEIPT_OPERATOR_NAME = "吴孝斌";

function today() {
  return formatShanghaiDate();
}

function formatChineseDate(value: string) {
  const [year = "", month = "", day = ""] = value.split("-");
  return `${year}年${Number(month || 0)}月${Number(day || 0)}日`;
}

@Injectable()
export class ReceiptsService {
  private readonly tempRoot: string;
  private readonly templatePath: string;

  constructor(
    @InjectRepository(Receipt)
    private readonly receiptsRepository: Repository<Receipt>,
    @InjectRepository(UtilityChargeRecord)
    private readonly utilityRecordsRepository: Repository<UtilityChargeRecord>,
    @InjectRepository(RentPayment)
    private readonly rentPaymentsRepository: Repository<RentPayment>,
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
  ) {
    const storageRoot = this.configService.getOrThrow<StorageConfig>("storage").root;
    this.tempRoot = join(storageRoot, "tmp");
    this.templatePath = join(__dirname, "..", "..", "assets", "templates", "receipt-template.docx");
  }

  list() {
    return this.receiptsRepository.find({
      order: {
        issueDate: "DESC",
        createdAt: "DESC",
      },
    });
  }

  async findOneOrFail(id: string) {
    const receipt = await this.receiptsRepository.findOne({ where: { id } });
    if (!receipt) {
      throw new NotFoundException("收据不存在");
    }
    return receipt;
  }

  async create(dto: CreateReceiptDto) {
    const issueDate = dto.issueDate ?? today();
    await this.ensureNoDuplicate(dto.sourceType, dto.sourceId);
    const source = await this.resolveSource(dto.sourceType, dto.sourceId);
    const receiptNo = await this.generateReceiptNo(issueDate);

    const tempDir = join(this.tempRoot, "receipts", receiptNo);
    const tempDocxPath = join(tempDir, `${receiptNo}.docx`);
    const tempPdfPath = join(tempDir, `${receiptNo}.pdf`);
    const libreOfficeProfile = join(tempDir, "libreoffice-profile");

    await mkdir(tempDir, { recursive: true });
    let pdfFile;
    try {
      try {
        await this.generateTemplatePdf(tempDocxPath, tempPdfPath, libreOfficeProfile, {
          receiptNo,
          issueDate,
          ...source,
        });
      } catch {
        await this.generateFallbackPdf(tempPdfPath, {
          receiptNo,
          issueDate,
          ...source,
        });
      }

      pdfFile = await this.filesService.registerGeneratedFile({
        filename: `${receiptNo}.pdf`,
        mimeType: "application/pdf",
        category: StoredFileCategory.RECEIPT,
        sourcePath: tempPdfPath,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    const entity = this.receiptsRepository.create({
      receiptNo,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      tenantNameSnapshot: source.tenantName,
      unitCodeSnapshot: source.unitCode,
      amountSnapshot: source.amount,
      issueDate,
      summary: source.summary,
      pdfFileId: pdfFile.id,
      pdfFile,
      status: ReceiptStatus.ACTIVE,
      voidedAt: null,
    });

    return this.receiptsRepository.save(entity);
  }

  async voidReceipt(id: string) {
    const receipt = await this.findOneOrFail(id);
    receipt.status = ReceiptStatus.VOID;
    receipt.voidedAt = today();
    return this.receiptsRepository.save(receipt);
  }

  private async resolveSource(sourceType: ReceiptSourceType, sourceId: string): Promise<ReceiptSourcePayload> {
    if (sourceType === ReceiptSourceType.UTILITY) {
      const record = await this.utilityRecordsRepository.findOne({ where: { id: sourceId } });
      if (!record) {
        throw new BadRequestException("水电收费记录不存在");
      }
      if (record.status !== UtilityChargeStatus.PAID) {
        throw new BadRequestException("只能为已缴费的水电记录开具收据");
      }

      return {
        amount: record.amount,
        tenantName: record.tenantNameSnapshot,
        unitCode: record.unit.code,
        summary: `${record.type === "electric" ? "电费" : "水费"}，抄表日期 ${record.previousReadAt} 至 ${record.currentReadAt}`,
        paymentDate: record.paidAt ?? record.recordedAt,
        paymentMethod: record.paymentMethod?.trim() || "未填写",
        reason: `${record.type === "electric" ? "电费" : "水费"}结算（${record.previousReadAt} 至 ${record.currentReadAt}）`,
      };
    }

    const rentPayment = await this.rentPaymentsRepository.findOne({ where: { id: sourceId } });
    if (!rentPayment) {
      throw new BadRequestException("房租收费记录不存在");
    }

    return {
      amount: rentPayment.amount,
      tenantName: rentPayment.tenantNameSnapshot,
      unitCode: rentPayment.unit.code,
      summary: `房租收款，付款方式 ${rentPayment.method}`,
      paymentDate: rentPayment.paymentDate,
      paymentMethod: rentPayment.method.trim(),
      reason: `房租收款（${rentPayment.contract.startDate} 至 ${rentPayment.contract.endDate}）`,
    };
  }

  private async ensureNoDuplicate(sourceType: ReceiptSourceType, sourceId: string) {
    const existing = await this.receiptsRepository.findOne({
      where: {
        sourceType,
        sourceId,
        status: ReceiptStatus.ACTIVE,
      },
    });

    if (existing) {
      throw new BadRequestException("该记录已经开具过收据");
    }
  }

  private async generateReceiptNo(issueDate: string) {
    const datePart = issueDate.replaceAll("-", "");
    const count = await this.receiptsRepository.count({ where: { issueDate } });
    return `RC${datePart}-${String(count + 1).padStart(3, "0")}`;
  }

  private async generateTemplatePdf(
    targetDocxPath: string,
    targetPdfPath: string,
    libreOfficeProfile: string,
    payload: ReceiptSourcePayload & { receiptNo: string; issueDate: string },
  ) {
    await renderReceiptTemplateDocx(this.templatePath, targetDocxPath, payload);
    await convertDocxToPdf(targetDocxPath, targetPdfPath, libreOfficeProfile);
  }

  private async generateFallbackPdf(
    targetPath: string,
    payload: ReceiptSourcePayload & { receiptNo: string; issueDate: string },
  ) {
    const doc = new PDFDocument({
      size: "A5",
      layout: "landscape",
      margin: 36,
    });
    const stream = createWriteStream(targetPath);
    const fontPath = await this.resolveFontPath();

    doc.pipe(stream);
    if (fontPath) {
      doc.font(fontPath);
    }

    const pageWidth = doc.page.width;
    const boxX = 56;
    const boxY = 132;
    const boxWidth = pageWidth - boxX * 2;
    const boxHeight = 176;
    const amountBoxWidth = 150;
    const amountBoxHeight = 58;
    const amountBoxX = boxX + boxWidth - amountBoxWidth - 34;
    const amountBoxY = boxY + 58;
    const paymentMethodLabelX = boxX + 332;
    const paymentMethodLineStartX = paymentMethodLabelX + 92;
    const paymentMethodLineEndX = boxX + boxWidth - 22;
    const footerY = boxY + boxHeight + 18;
    const footerLineWidth = 86;
    const footerUnitTextX = boxX;
    const footerUnitLineX = footerUnitTextX + 88;
    const footerReceiverTextX = boxX + 200;
    const footerReceiverLineX = footerReceiverTextX + 62;
    const footerDateX = boxX + boxWidth - 136;
    const reasonLineEndX = amountBoxX - 34;

    doc.fillColor("#111111");
    doc.fontSize(24).text("收    据", 0, 28, { align: "center" });
    doc
      .moveTo(boxX + 70, 66)
      .lineTo(pageWidth - boxX - 140, 66)
      .lineWidth(1)
      .stroke("#222222");

    doc.fillColor("#2c79c1").fontSize(12).text(payload.receiptNo, pageWidth - 228, 92, {
      width: 196,
      align: "right",
      lineBreak: false,
    });

    doc.fillColor("#111111").fontSize(15).text(`入账日期：${formatChineseDate(payload.issueDate)}`, 0, 95, {
      align: "center",
    });

    doc.rect(boxX, boxY, boxWidth, boxHeight).lineWidth(1).stroke("#222222");

    doc.fontSize(15).text("交款单位", boxX + 20, boxY + 22);
    doc
      .moveTo(boxX + 102, boxY + 42)
      .lineTo(boxX + 334, boxY + 42)
      .stroke("#222222");
    doc.text(payload.tenantName, boxX + 110, boxY + 16, {
      width: 220,
    });

    doc.fontSize(15).text("收款方式", paymentMethodLabelX, boxY + 22);
    doc
      .moveTo(paymentMethodLineStartX, boxY + 42)
      .lineTo(paymentMethodLineEndX, boxY + 42)
      .stroke("#222222");
    doc.text(payload.paymentMethod, paymentMethodLineStartX + 10, boxY + 16, {
      width: paymentMethodLineEndX - paymentMethodLineStartX - 20,
      align: "left",
      lineBreak: false,
    });

    doc.fontSize(15).text("人民币（大写）", boxX + 20, boxY + 82);
    doc
      .moveTo(boxX + 134, boxY + 102)
      .lineTo(amountBoxX - 16, boxY + 102)
      .stroke("#222222");
    doc.text(toChineseCurrencyUppercase(payload.amount), boxX + 145, boxY + 76, {
      width: amountBoxX - boxX - 176,
    });

    doc.fontSize(20).fillColor("#111111").text("￥", amountBoxX - 24, amountBoxY + 16);
    doc.rect(amountBoxX, amountBoxY, amountBoxWidth, amountBoxHeight).stroke("#d7d7d7");
    for (let row = 1; row < 8; row += 1) {
      const y = amountBoxY + row * (amountBoxHeight / 8);
      doc.moveTo(amountBoxX, y).lineTo(amountBoxX + amountBoxWidth, y).stroke("#e9e9e9");
    }
    doc.fillColor("#df1e1e").fontSize(28).text(payload.amount.toFixed(2), amountBoxX + 16, amountBoxY + 14, {
      width: amountBoxWidth - 24,
      align: "center",
    });

    doc.fillColor("#111111").fontSize(15).text("收款事由", boxX + 20, boxY + 138);
    doc
      .moveTo(boxX + 102, boxY + 158)
      .lineTo(reasonLineEndX, boxY + 158)
      .stroke("#222222");
    doc.text(payload.reason, boxX + 110, boxY + 132, {
      width: reasonLineEndX - boxX - 122,
      lineBreak: false,
    });

    doc.fontSize(13).text(`收款单位：${RECEIPT_OPERATOR_NAME}`, footerUnitTextX, footerY, {
      width: 170,
      lineBreak: false,
    });
    doc
      .moveTo(footerUnitLineX, footerY + 17)
      .lineTo(footerUnitLineX + footerLineWidth, footerY + 17)
      .stroke("#222222");
    doc.fontSize(13).text(`收款人：${RECEIPT_OPERATOR_NAME}`, footerReceiverTextX, footerY, {
      width: 148,
      lineBreak: false,
    });
    doc
      .moveTo(footerReceiverLineX, footerY + 17)
      .lineTo(footerReceiverLineX + footerLineWidth, footerY + 17)
      .stroke("#222222");
    doc.fontSize(13).text(formatChineseDate(payload.issueDate), footerDateX, footerY, {
      width: 136,
      align: "right",
      lineBreak: false,
    });

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on("finish", () => resolve());
      stream.on("error", (error) => reject(error));
    });
  }

  private async resolveFontPath() {
    const storage = this.configService.getOrThrow<StorageConfig>("storage");
    const candidates = [
      "/app/assets/fonts/NotoSansCJKsc-Regular.otf",
      storage.pdfFontPath && !storage.pdfFontPath.toLowerCase().endsWith(".ttc") ? storage.pdfFontPath : null,
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    return null;
  }
}
