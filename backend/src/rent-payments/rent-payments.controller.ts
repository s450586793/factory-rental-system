import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CreateRentPaymentDto, UpdateRentPaymentDto } from "./rent-payments.dto";
import { RentPaymentsService } from "./rent-payments.service";

@Controller("rent-payments")
@UseGuards(JwtAuthGuard)
export class RentPaymentsController {
  constructor(private readonly rentPaymentsService: RentPaymentsService) {}

  @Get()
  list() {
    return this.rentPaymentsService.list();
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.rentPaymentsService.findOneOrFail(id);
  }

  @Post()
  create(@Body() dto: CreateRentPaymentDto) {
    return this.rentPaymentsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateRentPaymentDto) {
    return this.rentPaymentsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.rentPaymentsService.remove(id);
  }
}
