import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export enum RentReceivableStatus {
  NOT_DUE = "not-due",
  PARTIALLY_PREPAID = "partially-prepaid",
  PREPAID = "prepaid",
  OVERDUE = "overdue",
  SETTLED = "settled",
}

export type RentContractFinancialSummary = {
  dueReceivableAmount: number;
  duePaidAmount: number;
  outstandingAmount: number;
  prepaidAmount: number;
  unallocatedAmount: number;
};

export class ListRentReceivablesQueryDto {
  @IsUUID()
  @IsOptional()
  unitId?: string;

  @IsUUID()
  @IsOptional()
  contractId?: string;

  @IsString()
  @IsOptional()
  tenantName?: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @IsOptional()
  year?: number;

  @IsEnum(RentReceivableStatus)
  @IsOptional()
  status?: RentReceivableStatus;
}

export class UpdateRentReceivableDto {
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  receivableAmount?: number;
}
