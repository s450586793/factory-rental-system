import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import {
  CreateDepositRecordDto,
  ListDepositAccountsQueryDto,
  UpdateDepositRecordDto,
} from "./deposits.dto";
import { DepositsService } from "./deposits.service";

@ApiTags("deposits")
@Controller("deposits")
@UseGuards(JwtAuthGuard)
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get()
  list() {
    return this.depositsService.list();
  }

  @Get("accounts")
  listAccounts(@Query() query: ListDepositAccountsQueryDto) {
    return this.depositsService.listAccounts(query);
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
