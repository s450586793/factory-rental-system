import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { StoredFileCategory } from "./stored-file.entity";

export class UploadFilesDto {
  @IsEnum(StoredFileCategory)
  category!: StoredFileCategory;
}

export class AttachExistingFilesDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  fileIds?: string[];
}

export class GenerateStoredFileDto {
  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsString()
  mimeType!: string;

  @IsEnum(StoredFileCategory)
  category!: StoredFileCategory;

  @IsString()
  sourcePath!: string;
}
