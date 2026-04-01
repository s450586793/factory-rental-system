import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CreateContractDto, UpdateContractDto } from "./contracts.dto";
import { ContractsService } from "./contracts.service";

@ApiTags("contracts")
@Controller("contracts")
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  list(@Query("unitId") unitId?: string) {
    return this.contractsService.list(unitId);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.contractsService.findOneOrFail(id);
  }

  @Post()
  create(@Body() dto: CreateContractDto) {
    return this.contractsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(id, dto);
  }

  @Post(":id/generate-document")
  generateDocument(@Param("id") id: string) {
    return this.contractsService.generateDocument(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.contractsService.remove(id);
  }
}
