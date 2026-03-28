import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location!: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  area?: number | null;
}

export class UpdateUnitDto extends CreateUnitDto {}
