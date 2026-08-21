import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export enum RentReconciliationStatus {
  OUTSTANDING = "outstanding",
  SETTLED = "settled",
  CREDIT = "credit",
}

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
