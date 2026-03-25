import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { UtilityChargeStatus } from "./utility-charge-record.entity";
import { UtilityType } from "./utility-meter-config.entity";

export class CreateMeterConfigDto {
  @IsString()
  unitId!: string;

  @IsEnum(UtilityType)
  type!: UtilityType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsNumber()
  initialReading!: number;

  @IsNumber()
  @Min(0)
  multiplier!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @Min(0)
  lineLossPercent!: number;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateMeterConfigDto extends CreateMeterConfigDto {}

export class UtilityChargeItemInputDto {
  @IsString()
  meterConfigId!: string;

  @IsNumber()
  previousReading!: number;

  @IsNumber()
  currentReading!: number;
}

export class CreateUtilityRecordDto {
  @IsString()
  unitId!: string;

  @IsString()
  contractId!: string;

  @IsEnum(UtilityType)
  type!: UtilityType;

  @IsDateString()
  previousReadAt!: string;

  @IsDateString()
  currentReadAt!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UtilityChargeItemInputDto)
  items!: UtilityChargeItemInputDto[];

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class UpdateUtilityRecordDto extends CreateUtilityRecordDto {}

export class MarkUtilityRecordPaidDto {
  @IsDateString()
  @IsOptional()
  paidAt?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;
}

export class UtilityPrefillQueryDto {
  @IsString()
  unitId!: string;

  @IsEnum(UtilityType)
  type!: UtilityType;
}

export class UtilityRecordListQueryDto {
  @IsString()
  @IsOptional()
  unitId?: string;

  @IsEnum(UtilityType)
  @IsOptional()
  type?: UtilityType;

  @IsEnum(UtilityChargeStatus)
  @IsOptional()
  status?: UtilityChargeStatus;
}
