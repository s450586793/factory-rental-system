import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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

  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  @IsOptional()
  attachmentFileIds?: string[];
}

export class UpdateDepositRecordDto extends CreateDepositRecordDto {}
