import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { ReceiptSourceType } from "./receipt.entity";

export class CreateReceiptDto {
  @IsEnum(ReceiptSourceType)
  sourceType!: ReceiptSourceType;

  @IsString()
  sourceId!: string;

  @IsDateString()
  @IsOptional()
  issueDate?: string;
}
