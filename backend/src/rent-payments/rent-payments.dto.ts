import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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
}

export class UpdateRentPaymentDto extends CreateRentPaymentDto {}
