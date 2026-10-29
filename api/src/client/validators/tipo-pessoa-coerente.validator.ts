import { ValidationArguments, registerDecorator } from 'class-validator';

import { TipoPessoa } from '../../user/enums/user.enum.js';

type ClientShape = {
  tipo_pessoa?: TipoPessoa;
  cpf?: string | null;
  cnpj?: string | null;
  data_nascimento?: string | null;
  razao_social?: string | null;
};

const preenchido = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * Deriva os erros de coerência do par PF/PJ.
 *
 * O validador vive no módulo `client` porque só é usado nos DTOs cadastrais
 * de cliente. O enum `TipoPessoa` continua em `user/enums` por representar
 * um conceito compartilhado entre usuário e cliente.
 *
 * Exposto separadamente do decorator para poder ser testado sem instanciar o
 * class-validator.
 */
export function checkTipoPessoaCoerencia(value: ClientShape): string[] {
  const errors: string[] = [];

  if (!Object.values(TipoPessoa).includes(value.tipo_pessoa as TipoPessoa)) {
    return ['tipo_pessoa deve ser PF ou PJ'];
  }

  if (value.tipo_pessoa === TipoPessoa.PF) {
    if (!preenchido(value.cpf)) {
      errors.push('cpf e obrigatorio para clientes do tipo PF');
    }
    if (!preenchido(value.data_nascimento)) {
      errors.push('data_nascimento e obrigatoria para clientes do tipo PF');
    }
    if (preenchido(value.cnpj)) {
      errors.push('cnpj nao deve ser informado para clientes do tipo PF');
    }
    if (preenchido(value.razao_social)) {
      errors.push(
        'razao_social nao deve ser informada para clientes do tipo PF',
      );
    }
  }

  if (value.tipo_pessoa === TipoPessoa.PJ) {
    if (!preenchido(value.cnpj)) {
      errors.push('cnpj e obrigatorio para clientes do tipo PJ');
    }
    if (!preenchido(value.razao_social)) {
      errors.push('razao_social e obrigatoria para clientes do tipo PJ');
    }
    if (preenchido(value.cpf)) {
      errors.push('cpf nao deve ser informado para clientes do tipo PJ');
    }
    if (preenchido(value.data_nascimento)) {
      errors.push(
        'data_nascimento nao deve ser informada para clientes do tipo PJ',
      );
    }
  }

  return errors;
}

/**
 * Valida a coerência entre `tipo_pessoa` e os documentos enviados:
 * PF exige CPF + data de nascimento; PJ exige CNPJ + razão social, e os
 * atributos do outro tipo não podem ser enviados.
 *
 * A leitura é feita em `args.object` para validar o DTO inteiro, e não apenas
 * a propriedade ancoradora.
 */
export function TipoPessoaCoerente() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'tipoPessoaCoerente',
      target: object.constructor,
      propertyName,
      constraints: [],
      // Sem `options.message`: no class-validator ela tem precedência sobre o
      // `defaultMessage` do validator e esconderia a lista de erros.
      validator: {
        validate: (_value: unknown, args: ValidationArguments) =>
          checkTipoPessoaCoerencia(args.object as ClientShape).length === 0,
        defaultMessage: (args: ValidationArguments) =>
          checkTipoPessoaCoerencia(args.object as ClientShape).join('; ') ||
          'dados do cliente incompativeis com o tipo_pessoa',
      },
    });
  };
}
