import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { extname, join } from "path";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "fs/promises";
import { In, Repository } from "typeorm";
import type { StorageConfig } from "../config/storage.config";
import { GenerateStoredFileDto } from "./files.dto";
import { StoredFile, StoredFileCategory } from "./stored-file.entity";

const PAYMENT_VOUCHER_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PAYMENT_VOUCHERS_PER_RECORD = 10;
const GENERATED_CONTRACT_DIRECTORY = "generated-contracts";

type UploadLike = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class FilesService {
  private readonly storageRoot: string;

  constructor(
    @InjectRepository(StoredFile)
    private readonly storedFilesRepository: Repository<StoredFile>,
    configService: ConfigService,
  ) {
    this.storageRoot = configService.getOrThrow<StorageConfig>("storage").root;
  }

  async saveUploadedFiles(files: UploadLike[], category: StoredFileCategory) {
    this.validateFilesForCategory(files, category);
    const saved: StoredFile[] = [];

    for (const file of files) {
      const storageName = this.buildStorageName(category, file.originalname);
      const storagePath = await this.writeFileToCategory(category, storageName, file.buffer);
      const entity = this.storedFilesRepository.create({
        originalName: file.originalname,
        storageName,
        storagePath,
        mimeType: file.mimetype || "application/octet-stream",
        size: file.size,
        category,
      });
      saved.push(await this.storedFilesRepository.save(entity));
    }

    return saved;
  }

  async registerGeneratedFile(dto: GenerateStoredFileDto) {
    const stats = await stat(dto.sourcePath);
    const storageName = this.buildStorageName(dto.category, dto.filename);
    const targetPath = await this.copyIntoCategory(dto.category, storageName, dto.sourcePath);
    const entity = this.storedFilesRepository.create({
      originalName: dto.filename,
      storageName,
      storagePath: targetPath,
      mimeType: dto.mimeType,
      size: stats.size,
      category: dto.category,
    });
    return this.storedFilesRepository.save(entity);
  }

  async readGeneratedContractDocument(contractId: string, revision: string) {
    const targetPath = this.buildGeneratedContractPath(contractId, revision);
    try {
      return await readFile(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async saveGeneratedContractDocument(contractId: string, revision: string, buffer: Buffer) {
    const dir = join(this.storageRoot, GENERATED_CONTRACT_DIRECTORY);
    await mkdir(dir, { recursive: true });
    const targetPath = this.buildGeneratedContractPath(contractId, revision);
    const safeContractId = this.sanitizeCacheSegment(contractId);
    const tempPath = join(dir, `.contract-${safeContractId}-${randomUUID()}.tmp`);

    await writeFile(tempPath, buffer);
    try {
      await rename(tempPath, targetPath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }

    await this.cleanupGeneratedContractDocuments(contractId, targetPath);
  }

  async removeGeneratedContractDocuments(contractId: string) {
    await this.cleanupGeneratedContractDocuments(contractId);
  }

  findByIds(fileIds: string[]) {
    if (!fileIds.length) {
      return Promise.resolve([]);
    }
    return this.storedFilesRepository.findBy({ id: In(fileIds) });
  }

  async resolvePaymentVoucherFiles(fileIds: string[]) {
    if (fileIds.length > MAX_PAYMENT_VOUCHERS_PER_RECORD) {
      throw new BadRequestException(`每条记录最多关联 ${MAX_PAYMENT_VOUCHERS_PER_RECORD} 张收款凭证`);
    }

    if (new Set(fileIds).size !== fileIds.length) {
      throw new BadRequestException("收款凭证不能重复");
    }

    const files = await this.findByIds(fileIds);
    if (files.length !== fileIds.length) {
      throw new BadRequestException("部分收款凭证不存在");
    }

    if (files.some((file) => !this.isPaymentVoucherImage(file))) {
      throw new BadRequestException("收款凭证必须为 JPG、PNG 或 WebP 图片");
    }

    return files;
  }

  async findOneOrFail(id: string) {
    const file = await this.storedFilesRepository.findOne({ where: { id } });
    if (!file) {
      throw new NotFoundException("文件不存在");
    }
    return file;
  }

  async getFileResponseMeta(id: string) {
    const file = await this.findOneOrFail(id);
    return {
      file,
      absolutePath: file.storagePath,
    };
  }

  async removeStoredFile(id: string) {
    const file = await this.findOneOrFail(id);
    await this.storedFilesRepository.softDelete(id);
    try {
      await unlink(file.storagePath);
    } catch {
      return;
    }
  }

  private buildStorageName(category: StoredFileCategory, originalName: string) {
    const suffix = extname(originalName);
    const categoryPrefix = category.replace(/[^a-z0-9-]+/gi, "-");
    const readableStem = this.buildReadableStem(originalName, suffix);
    const timestamp = this.buildTimestamp();
    const shortId = randomUUID().slice(0, 8);
    return `${categoryPrefix}_${timestamp}_${readableStem}_${shortId}${suffix}`;
  }

  private buildGeneratedContractPath(contractId: string, revision: string) {
    const safeContractId = this.sanitizeCacheSegment(contractId);
    const safeRevision = this.sanitizeCacheSegment(revision);
    return join(
      this.storageRoot,
      GENERATED_CONTRACT_DIRECTORY,
      `contract-${safeContractId}-${safeRevision}.pdf`,
    );
  }

  private sanitizeCacheSegment(value: string) {
    return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "unknown";
  }

  private async cleanupGeneratedContractDocuments(contractId: string, keepPath?: string) {
    const dir = join(this.storageRoot, GENERATED_CONTRACT_DIRECTORY);
    const prefix = `contract-${this.sanitizeCacheSegment(contractId)}-`;
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }

    await Promise.all(
      entries
        .filter((entry) => entry.startsWith(prefix) && entry.endsWith(".pdf"))
        .map((entry) => join(dir, entry))
        .filter((filePath) => filePath !== keepPath)
        .map((filePath) => unlink(filePath).catch(() => undefined)),
    );
  }

  private validateFilesForCategory(files: UploadLike[], category: StoredFileCategory) {
    if (category !== StoredFileCategory.PAYMENT_VOUCHER) {
      return;
    }

    if (files.some((file) => !PAYMENT_VOUCHER_IMAGE_MIME_TYPES.has(file.mimetype.toLowerCase()))) {
      throw new BadRequestException("收款凭证仅支持 JPG、PNG 或 WebP 图片");
    }
  }

  private isPaymentVoucherImage(file: Pick<StoredFile, "category" | "mimeType">) {
    return (
      file.category === StoredFileCategory.PAYMENT_VOUCHER &&
      PAYMENT_VOUCHER_IMAGE_MIME_TYPES.has(file.mimeType.toLowerCase())
    );
  }

  private buildReadableStem(originalName: string, suffix: string) {
    const rawStem = suffix ? originalName.slice(0, -suffix.length) : originalName;
    const normalized = rawStem
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .slice(0, 48);

    return normalized || "file";
  }

  private buildTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const second = String(now.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}_${hour}${minute}${second}`;
  }

  private async writeFileToCategory(category: StoredFileCategory, storageName: string, buffer: Buffer) {
    const dir = join(this.storageRoot, category);
    await mkdir(dir, { recursive: true });
    const targetPath = join(dir, storageName);
    await writeFile(targetPath, buffer);
    return targetPath;
  }

  private async copyIntoCategory(category: StoredFileCategory, storageName: string, sourcePath: string) {
    const dir = join(this.storageRoot, category);
    await mkdir(dir, { recursive: true });
    const targetPath = join(dir, storageName);
    const buffer = await readFile(sourcePath);
    await writeFile(targetPath, buffer);
    return targetPath;
  }
}
