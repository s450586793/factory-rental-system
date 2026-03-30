import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { extname, join } from "path";
import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { In, Repository } from "typeorm";
import type { StorageConfig } from "../config/storage.config";
import { GenerateStoredFileDto } from "./files.dto";
import { StoredFile, StoredFileCategory } from "./stored-file.entity";

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

  findByIds(fileIds: string[]) {
    if (!fileIds.length) {
      return Promise.resolve([]);
    }
    return this.storedFilesRepository.findBy({ id: In(fileIds) });
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
