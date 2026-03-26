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
import type { StorageConfig } from "../config/storage.config";
import { StoredFileCategory } from "../files/stored-file.entity";
import { FilesService } from "../files/files.service";
import { RentPayment } from "../rent-payments/rent-payment.entity";
import { UtilityChargeRecord, UtilityChargeStatus } from "../utilities/utility-charge-record.entity";
import { CreateReceiptDto } from "./receipts.dto";
import { Receipt, ReceiptSourceType, ReceiptStatus } from "./receipt.entity";

type ReceiptSourcePayload = {
  amount: number;
  tenantName: string;
  unitCode: string;
  summary: string;
  paymentDate: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class ReceiptsService {
  private readonly tempRoot: string;

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

    await mkdir(this.tempRoot, { recursive: true });
    const tempPath = join(this.tempRoot, `${receiptNo}.pdf`);
    await this.generatePdf(tempPath, {
      receiptNo,
      issueDate,
      ...source,
    });

    const pdfFile = await this.filesService.registerGeneratedFile({
      filename: `${receiptNo}.pdf`,
      mimeType: "application/pdf",
      category: StoredFileCategory.RECEIPT,
      sourcePath: tempPath,
    });
    await rm(tempPath, { force: true });

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

  private async generatePdf(
    targetPath: string,
    payload: ReceiptSourcePayload & { receiptNo: string; issueDate: string },
  ) {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
    });
    const stream = createWriteStream(targetPath);
    const fontPath = await this.resolveFontPath();

    doc.pipe(stream);
    if (fontPath) {
      doc.font(fontPath);
    }

    doc.fontSize(22).text("厂房出租管理收据", { align: "center" });
    doc.moveDown(1.2);
    doc.fontSize(12).text(`收据编号：${payload.receiptNo}`);
    doc.text(`开具日期：${payload.issueDate}`);
    doc.text(`厂房编号：${payload.unitCode}`);
    doc.text(`租户：${payload.tenantName}`);
    doc.text(`缴费日期：${payload.paymentDate}`);
    doc.moveDown();
    doc.text(`摘要：${payload.summary}`);
    doc.moveDown();
    doc.fontSize(18).text(`金额：人民币 ${payload.amount.toFixed(2)} 元`, {
      align: "left",
    });
    doc.moveDown(2);
    doc.fontSize(12).text("说明：本收据由系统根据已缴费记录生成，用于管理留档与打印。");
    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on("finish", () => resolve());
      stream.on("error", (error) => reject(error));
    });
  }

  private async resolveFontPath() {
    const storage = this.configService.getOrThrow<StorageConfig>("storage");
    const candidates = [
      storage.pdfFontPath,
      "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
      "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
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
