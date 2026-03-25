import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location!: string;
}

export class UpdateUnitDto extends CreateUnitDto {}
