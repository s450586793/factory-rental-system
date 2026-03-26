import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CreateReceiptDto } from "./receipts.dto";
import { ReceiptsService } from "./receipts.service";

@ApiTags("receipts")
@Controller("receipts")
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  list() {
    return this.receiptsService.list();
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.receiptsService.findOneOrFail(id);
  }

  @Post()
  create(@Body() dto: CreateReceiptDto) {
    return this.receiptsService.create(dto);
  }

  @Delete(":id")
  voidReceipt(@Param("id") id: string) {
    return this.receiptsService.voidReceipt(id);
  }
}
