import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  unitId!: string;

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

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsNumber()
  @Min(0)
  annualRent!: number;

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
