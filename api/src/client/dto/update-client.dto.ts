import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

import { IsCnpj, IsCpf } from '../../common/validators/document.validator.js';
import { TipoPessoa } from '../../user/enums/user.enum.js';

/**
 * DTO para atualização parcial de cliente.
 *
 * Todos os campos são opcionais (`@IsOptional`), permitindo atualizações
 * parciais via PATCH. Apenas os campos enviados serão alterados.
 *
 * Observação: a troca de `tipo_pessoa` é tratada no `ClientService`, que
 * limpa os campos incompatíveis (por exemplo, ao virar PJ, `cpf` e
 * `data_nascimento` são zerados).
 */
export class UpdateClientDto {
  @IsOptional()
  @IsEnum(TipoPessoa, { message: 'tipo_pessoa deve ser PF ou PJ' })
  tipo_pessoa?: TipoPessoa;

  @IsOptional()
  @IsCpf()
  cpf?: string;

  @IsOptional()
  @IsCnpj()
  cnpj?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'data_nascimento deve estar no formato YYYY-MM-DD' },
  )
  data_nascimento?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  razao_social?: string;
}
