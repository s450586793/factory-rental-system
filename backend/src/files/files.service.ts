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
    this.storageRoot = configService.get<string>("STORAGE_ROOT", join(process.cwd(), "storage"));
  }

  async saveUploadedFiles(files: UploadLike[], category: StoredFileCategory) {
    const saved: StoredFile[] = [];

    for (const file of files) {
      const storageName = this.buildStorageName(file.originalname);
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
    const storageName = this.buildStorageName(dto.filename);
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

  private buildStorageName(originalName: string) {
    const suffix = extname(originalName);
    return `${randomUUID()}${suffix}`;
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
