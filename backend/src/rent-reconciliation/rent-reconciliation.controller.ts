import { Controller, Get, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import {
  ListRentReconciliationQueryDto,
  TenantRentReconciliationQueryDto,
} from "./rent-reconciliation.dto";
import { RentReconciliationService } from "./rent-reconciliation.service";

function buildAttachmentDisposition(filename: string) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]+/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@ApiTags("rent-reconciliation")
@Controller("rent-reconciliation")
@UseGuards(JwtAuthGuard)
export class RentReconciliationController {
  constructor(private readonly rentReconciliationService: RentReconciliationService) {}

  @Get()
  list(@Query() query: ListRentReconciliationQueryDto) {
    return this.rentReconciliationService.list(query);
  }

  @Get("detail")
  detail(@Query() query: TenantRentReconciliationQueryDto) {
    return this.rentReconciliationService.detail(query);
  }

  @Get("pdf")
  async downloadPdf(
    @Query() query: TenantRentReconciliationQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const generated = await this.rentReconciliationService.generatePdf(query);
    response.setHeader("Content-Type", generated.mimeType);
    response.setHeader("Content-Disposition", buildAttachmentDisposition(generated.filename));
    response.setHeader("Content-Length", String(generated.buffer.length));
    return new StreamableFile(generated.buffer);
  }
}
