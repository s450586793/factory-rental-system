import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CreateDepositRecordDto, UpdateDepositRecordDto } from "./deposits.dto";
import { DepositsService } from "./deposits.service";

@Controller("deposits")
@UseGuards(JwtAuthGuard)
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get()
  list() {
    return this.depositsService.list();
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.depositsService.findOneOrFail(id);
  }

  @Post()
  create(@Body() dto: CreateDepositRecordDto) {
    return this.depositsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateDepositRecordDto) {
    return this.depositsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.depositsService.remove(id);
  }
}
