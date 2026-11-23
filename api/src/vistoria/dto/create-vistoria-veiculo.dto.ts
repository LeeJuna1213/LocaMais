import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVistoriaVeiculoDto {
  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  carroId: number;

  @ApiProperty({ example: '2026-11-23' })
  @IsDateString({ strict: true })
  data: string;

  @ApiProperty({ example: 'Inspecionados freios, pneus, iluminação e suspensão.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  descricao: string;

  @ApiProperty({ example: 185.5, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valor: number;

  @ApiProperty({ example: 50000, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  km: number;

  @ApiProperty({ example: 61000, minimum: 0, description: 'Próximo limite individual configurado para este veículo.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  proximaVistoriaKm: number;
}
