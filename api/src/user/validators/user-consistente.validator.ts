import { ValidationArguments, registerDecorator } from 'class-validator';
import { UserType } from '../enums/user.enum.js';

type UserShape = {
  type?: UserType;
  cliente?: unknown;
};

/**
 * Garante que apenas clientes tenham atributos de cliente (PF/PJ + endereco).
 *
 * Funcionarios e admins nao possuem atributos adicionais, entao enviar
 * `cliente` para esses tipos e um erro.
 */
export function checkUserConsistencia(value: UserShape): string[] {
  const errors: string[] = [];
  const hasCliente = value.cliente !== undefined && value.cliente !== null;

  if (!Object.values(UserType).includes(value.type as UserType)) {
    return ['type deve ser admin, funcionario ou cliente'];
  }

  if (value.type === UserType.CLIENTE && !hasCliente) {
    errors.push('cliente e obrigatorio para usuarios do tipo cliente');
  }

  if (value.type !== UserType.CLIENTE && hasCliente) {
    errors.push(
      `usuarios do tipo ${value.type} nao devem ter atributos de cliente`,
    );
  }

  return errors;
}

/** Decorator de coerencia entre `type` e a presenca do bloco `cliente`. */
export function UserConsistente() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'userConsistente',
      target: object.constructor,
      propertyName,
      constraints: [],
      // Sem `options.message`: no class-validator ela tem precedencia sobre o
      // `defaultMessage` do validator e esconderia a lista de erros.
      validator: {
        validate: (_value: unknown, args: ValidationArguments) =>
          checkUserConsistencia(args.object as UserShape).length === 0,
        defaultMessage: (args: ValidationArguments) =>
          checkUserConsistencia(args.object as UserShape).join('; ') ||
          'payload incompativel com o type do usuario',
      },
    });
  };
}