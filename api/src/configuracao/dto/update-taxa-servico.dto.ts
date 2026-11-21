import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class UpdateTaxaServicoDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valor: number;
}
