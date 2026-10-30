import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TipoVistoria } from '../enums/tipo-vistoria.enum.js';
import { IsFotosJson } from '../../common/validators/fotos.validator.js';

/**
 * Dados aceitos em `POST /api/vistorias`.
 *
 * `id`, `data`, `locacao` e `created_at`/`updated_at` NÃO fazem parte deste
 * DTO: o ID e as datas são gerenciados pelo backend, e a vinculação é feita
 * por meio do `locacaoId`.
 *
 * O `ValidationPipe` global usa `whitelist` + `forbidNonWhitelisted`, então
 * enviar campos não listados retorna 400 em vez de ignorá-los silenciosamente.
 */
export class CreateVistoriaDto {
  @ApiProperty({
    enum: TipoVistoria,
    example: TipoVistoria.RETIRADA,
    description:
      'Tipo da vistoria: retirada (antes da entrega ao cliente) ou devolucao (apos o uso).',
  })
  @IsEnum(TipoVistoria, { message: 'tipo de vistoria invalido' })
  tipo: TipoVistoria;

  @ApiPropertyOptional({
    example: 'Veiculo sem avarias visiveis. Nivel de combustível: cheio.',
    description: 'Observacoes sobre as condicoes gerais do veiculo.',
  })
  @IsOptional()
  @IsString({ message: 'observacoes deve ser uma string' })
  observacoes?: string | null;

  @ApiProperty({
    example: '["https://exemplo.com/foto1.jpg", "https://exemplo.com/foto2.jpg"]',
    description:
      'Lista serializada em JSON de URLs/caminhos das fotos registradas durante a vistoria.',
  })
  @IsFotosJson({ message: 'fotos deve ser um JSON valido contendo um array de strings' })
  fotos: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'UUID da locacao a qual esta vistoria esta vinculada.',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'locacaoId deve ser um UUID valido' })
  locacaoId: string;
}
