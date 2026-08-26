import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateIf,
} from "class-validator";

const DATE_ONLY_PATTERN = /^(?!0000)\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const INVALID_DUE_DATE_MESSAGE = "应收日期必须是有效的 YYYY-MM-DD 日期";

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
  @Matches(DATE_ONLY_PATTERN, { message: INVALID_DUE_DATE_MESSAGE })
  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: INVALID_DUE_DATE_MESSAGE },
  )
  @ValidateIf((_object, value) => value !== undefined)
  dueDate?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  receivableAmount?: number;
}
