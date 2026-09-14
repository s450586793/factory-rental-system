import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ContractActor } from "./contract-financial-history";
import { buildGeneratedContractVirtualFileId } from "./contract-document";
import { CreateContractDto, UpdateContractDto } from "./contracts.dto";
import { ContractsService } from "./contracts.service";

@ApiTags("contracts")
@Controller("contracts")
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  private buildAttachmentDisposition(filename: string) {
    const asciiFallback = filename.replace(/[^\x20-\x7E]+/g, "_");
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }

  @Get()
  list(@Query("unitId") unitId?: string) {
    return this.contractsService.list(unitId);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.contractsService.findOneOrFail(id);
  }

  @Post()
  create(@Body() dto: CreateContractDto, @CurrentUser() actor: ContractActor) {
    return this.contractsService.create(dto, actor);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() actor: ContractActor,
  ) {
    return this.contractsService.update(id, dto, actor);
  }

  @Get(":id/history")
  history(@Param("id") id: string) {
    return this.contractsService.history(id);
  }

  @Get(":id/document-status")
  documentStatus(@Param("id") id: string) {
    return this.contractsService.documentStatus(id);
  }

  @Post(":id/retry-document")
  retryDocument(@Param("id") id: string) {
    return this.contractsService.retryDocument(id);
  }

  @Post(":id/generate-document")
  async generateDocument(@Param("id") id: string) {
    const generated = await this.contractsService.generateDocument(id);
    return {
      file: {
        id: buildGeneratedContractVirtualFileId(id),
        originalName: generated.filename,
        mimeType: generated.mimeType,
      },
      filename: generated.filename,
      mimeType: generated.mimeType,
    };
  }

  @Get(":id/generated-document")
  async downloadGeneratedDocument(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const generated = await this.contractsService.generateDocument(id);
    response.setHeader("Content-Type", generated.mimeType);
    response.setHeader(
      "Content-Disposition",
      this.buildAttachmentDisposition(generated.filename),
    );
    response.setHeader("Content-Length", String(generated.buffer.length));
    return new StreamableFile(generated.buffer);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.contractsService.remove(id);
  }
}
