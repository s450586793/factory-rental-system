import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import {
  ListRentReceivablesQueryDto,
  UpdateRentReceivableDto,
} from "./rent-receivables.dto";
import { RentReceivablesService } from "./rent-receivables.service";

@ApiTags("rent-receivables")
@Controller("rent-receivables")
@UseGuards(JwtAuthGuard)
export class RentReceivablesController {
  constructor(
    private readonly rentReceivablesService: RentReceivablesService,
  ) {}

  @Get()
  list(@Query() query: ListRentReceivablesQueryDto) {
    return this.rentReceivablesService.list(query);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.rentReceivablesService.findOneOrFail(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateRentReceivableDto,
  ) {
    return this.rentReceivablesService.update(id, dto);
  }
}
