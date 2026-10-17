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
import { IsCnpj, IsCpf } from '../../common/validators/document.validator.js';
import { TipoPessoa } from '../enums/user.enum.js';
import { TipoPessoaCoerente } from '../validators/tipo-pessoa-coerente.validator.js';
import { CreateAddressDto } from './create-address.dto.js';

/**
 * Dados especificos de um cliente.
 *
 * A coerencia entre `tipo_pessoa` e os documentos e validada pelo decorator
 * `@TipoPessoaCoerente()`; `@IsCpf`/`@IsCnpj` validam apenas o formato do que
 * foi enviado. `endereco` e obrigatorio — todo cliente tem endereco.
 */
export class CreateClientDto {
  /**
   * O constraint vive em `tipo_pessoa` mas le o DTO inteiro via `args.object`
   * — e por isso que nao existe uma propriedade-fantasma para ancorar a
   * validacao no nivel do objeto (o plugin do Swagger transformaria essa
   * propriedade em referencia circular).
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
  @IsDateString({}, { message: 'data_nascimento deve estar no formato YYYY-MM-DD' })
  data_nascimento?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  razao_social?: string;

  /**
   * `@IsDefined` e obrigatorio: sem ele o class-validator pula a validacao de
   * propriedades `undefined`, e um cliente sem endereco passaria.
   */
  @IsDefined({ message: 'endereco e obrigatorio para clientes' })
  @ValidateNested()
  @Type(() => CreateAddressDto)
  endereco: CreateAddressDto;
}