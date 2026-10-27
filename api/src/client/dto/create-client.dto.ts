import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

// Validadores de CPF/CNPJ são próprios do projeto (não existem no
// class-validator). Eles ficam em `common/validators`.
import { IsCnpj, IsCpf } from '../../common/validators/document.validator.js';

// TipoPessoa e o validador de coerência PF/PJ continuam no módulo `user`,
// que é onde o enum de tipos e os validadores de cadastro vivem.
import { TipoPessoa } from '../../user/enums/user.enum.js';
import { TipoPessoaCoerente } from '../../user/validators/tipo-pessoa-coerente.validator.js';

// O endereço é um DTO do módulo `address`. O cliente apenas o referencia.
import { CreateAddressDto } from '../../address/dto/create-address.dto.js';

/**
 * Dados específicos de um cliente, usados dentro de `CreateUserDto` e de
 * `RegisterDto`.
 *
 * A coerência entre `tipo_pessoa` e os documentos é validada pelo decorator
 * `@TipoPessoaCoerente()`; `@IsCpf`/`@IsCnpj` validam apenas o formato do que
 * foi enviado. `endereco` é obrigatório — todo cliente tem endereço.
 */
export class CreateClientDto {
  /**
   * O constraint vive em `tipo_pessoa` mas lê o DTO inteiro via `args.object`
   * — é por isso que não existe uma propriedade-fantasma para ancorar a
   * validação no nível do objeto (o plugin do Swagger transformaria essa
   * propriedade em referência circular).
   */
  @IsEnum(TipoPessoa, { message: 'tipo_pessoa deve ser PF ou PJ' })
  @TipoPessoaCoerente()
  tipo_pessoa: TipoPessoa;

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

  /**
   * `@IsDefined` é obrigatório: sem ele o class-validator pula a validação de
   * propriedades `undefined`, e um cliente sem endereço passaria.
   */
  @IsDefined({ message: 'endereco e obrigatorio para clientes' })
  @ValidateNested()
  @Type(() => CreateAddressDto)
  endereco: CreateAddressDto;
}
