import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CreateUnitDto, UpdateUnitDto } from "./units.dto";
import { UnitsService } from "./units.service";

@ApiTags("units")
@Controller("units")
@UseGuards(JwtAuthGuard)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  list() {
    return this.unitsService.list();
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.unitsService.getDetail(id);
  }

  @Post()
  create(@Body() dto: CreateUnitDto) {
    return this.unitsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUnitDto) {
    return this.unitsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.unitsService.remove(id);
  }
}
