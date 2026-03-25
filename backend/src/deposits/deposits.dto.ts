import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { DepositRecordType } from "./deposit-record.entity";

export class CreateDepositRecordDto {
  @IsString()
  contractId!: string;

  @IsEnum(DepositRecordType)
  type!: DepositRecordType;

  @IsDateString()
  paymentDate!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @MaxLength(50)
  method!: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class UpdateDepositRecordDto extends CreateDepositRecordDto {}
