import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsFotosJson } from '../../common/validators/fotos.validator.js';

/**
 * Dados aceitos em `PATCH /api/vistorias/:id`.
 *
 * Apenas `observacoes` e `fotos` podem ser atualizados. `tipo`, `data` e o
 * vinculo com a locacao sao imutaveis apos a realizacao da vistoria, para
 * preservar o historico.
 */
export class UpdateVistoriaDto {
  @ApiPropertyOptional({
    example: 'Novo arranque no para-choque traseiro.',
    description: 'Novas observacoes sobre as condicoes do veiculo.',
  })
  @IsOptional()
  @IsString({ message: 'observacoes deve ser uma string' })
  observacoes?: string | null;

  @ApiPropertyOptional({
    example: '["https://exemplo.com/foto-nova.jpg"]',
    description:
      'Lista serializada em JSON de URLs/caminhos das fotos registradas.',
  })
  @IsOptional()
  @IsFotosJson({ message: 'fotos deve ser um JSON valido contendo um array de strings' })
  fotos?: string;
}
