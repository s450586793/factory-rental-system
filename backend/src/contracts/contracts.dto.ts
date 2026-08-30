import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { BillingFrequency } from "./contract.enums";

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  unitId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lessorName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  lessorLicenseCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  lessorContactName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  lessorPhone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lessorSafetyManager!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  tenantName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  contactName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  tenantPhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  licenseCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  tenantSafetyManager!: string;

  @IsDateString()
  signedDate!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsNumber()
  @Min(0.01)
  annualRent!: number;

  @IsNumber()
  @Min(0)
  depositAmount!: number;

  @IsNumber()
  @Min(0)
  electricUnitPrice!: number;

  @IsNumber()
  @Min(0)
  electricLineLossPercent!: number;

  @IsNumber()
  @Min(0)
  waterUnitPrice!: number;

  @IsNumber()
  @Min(0)
  earlyTerminationPenaltyAmount!: number;

  @IsEnum(BillingFrequency)
  @ValidateIf((_object, value) => value !== undefined)
  billingFrequency?: BillingFrequency;

  @IsString()
  @IsOptional()
  businessLicenseFileId?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  attachmentFileIds?: string[];
}

export class UpdateContractDto extends CreateContractDto {}
