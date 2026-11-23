import { IsDateString, IsOptional } from 'class-validator';

export class VistoriaCustosQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}
