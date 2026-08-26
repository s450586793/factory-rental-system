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
import type { RentPayment } from "./rent-payment.entity";

export class CreateRentPaymentDto {
  @IsString()
  contractId!: string;

  @IsDateString()
  paymentDate!: string;

  @IsNumber()
  @Min(0.01)
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

export class PreviewRentPaymentAllocationDto {
  @IsString()
  contractId!: string;

  @IsDateString()
  paymentDate!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsOptional()
  excludePaymentId?: string;
}

export type RentPaymentAllocationPreview = {
  allocations: Array<{
    scheduleId: string;
    sequence: number;
    periodStart: string;
    periodEnd: string;
    allocatedAmount: number;
  }>;
  unallocatedAmount: number;
};

export type RentPaymentMutationResult = RentPaymentAllocationPreview & {
  payment: RentPayment;
};
