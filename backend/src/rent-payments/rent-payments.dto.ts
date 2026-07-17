import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";

export class CreateRentPaymentDto {
  @IsString()
  contractId!: string;

  @IsDateString()
  paymentDate!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @IsNotEmpty()
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

export class UpdateRentPaymentDto extends CreateRentPaymentDto {}
