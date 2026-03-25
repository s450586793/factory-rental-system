import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { UploadFilesDto } from "./files.dto";
import { FilesService } from "./files.service";

@Controller("files")
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post("upload")
  @UseInterceptors(
    FilesInterceptor("files", 10, {
      storage: memoryStorage(),
    }),
  )
  upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadFilesDto,
  ) {
    return this.filesService.saveUploadedFiles(files ?? [], dto.category);
  }

  @Get(":id/meta")
  meta(@Param("id") id: string) {
    return this.filesService.findOneOrFail(id);
  }

  @Get(":id/download")
  async download(@Param("id") id: string, @Res() response: Response) {
    const { file, absolutePath } = await this.filesService.getFileResponseMeta(id);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    return response.sendFile(absolutePath);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.filesService.removeStoredFile(id);
  }
}
