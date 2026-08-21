import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { RentReconciliationStatus } from "./rent-reconciliation.types";

export class ListRentReconciliationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsEnum(RentReconciliationStatus)
  status?: RentReconciliationStatus;
}

export class TenantRentReconciliationQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  tenantName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
