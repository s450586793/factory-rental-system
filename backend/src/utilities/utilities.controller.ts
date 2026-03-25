import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import {
  CreateMeterConfigDto,
  CreateUtilityRecordDto,
  MarkUtilityRecordPaidDto,
  UpdateMeterConfigDto,
  UpdateUtilityRecordDto,
  UtilityPrefillQueryDto,
  UtilityRecordListQueryDto,
} from "./utilities.dto";
import { UtilitiesService } from "./utilities.service";
import { UtilityType } from "./utility-meter-config.entity";

@Controller("utilities")
@UseGuards(JwtAuthGuard)
export class UtilitiesController {
  constructor(private readonly utilitiesService: UtilitiesService) {}

  @Get("meter-configs")
  listMeterConfigs(@Query("unitId") unitId?: string, @Query("type") type?: UtilityType) {
    return this.utilitiesService.listMeterConfigs(unitId, type);
  }

  @Post("meter-configs")
  createMeterConfig(@Body() dto: CreateMeterConfigDto) {
    return this.utilitiesService.createMeterConfig(dto);
  }

  @Patch("meter-configs/:id")
  updateMeterConfig(@Param("id") id: string, @Body() dto: UpdateMeterConfigDto) {
    return this.utilitiesService.updateMeterConfig(id, dto);
  }

  @Delete("meter-configs/:id")
  removeMeterConfig(@Param("id") id: string) {
    return this.utilitiesService.removeMeterConfig(id);
  }

  @Get("prefill")
  getPrefill(@Query() query: UtilityPrefillQueryDto) {
    return this.utilitiesService.getPrefill(query.unitId, query.type);
  }

  @Get("records")
  listRecords(@Query() query: UtilityRecordListQueryDto) {
    return this.utilitiesService.listRecords(query);
  }

  @Get("records/:id")
  detailRecord(@Param("id") id: string) {
    return this.utilitiesService.findRecordOrFail(id);
  }

  @Post("records")
  createRecord(@Body() dto: CreateUtilityRecordDto) {
    return this.utilitiesService.createRecord(dto);
  }

  @Patch("records/:id")
  updateRecord(@Param("id") id: string, @Body() dto: UpdateUtilityRecordDto) {
    return this.utilitiesService.updateRecord(id, dto);
  }

  @Post("records/:id/pay")
  markPaid(@Param("id") id: string, @Body() dto: MarkUtilityRecordPaidDto) {
    return this.utilitiesService.markAsPaid(id, dto);
  }

  @Delete("records/:id")
  removeRecord(@Param("id") id: string) {
    return this.utilitiesService.removeRecord(id);
  }
}
