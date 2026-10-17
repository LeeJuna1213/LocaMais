import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { isValidCnpj, isValidCpf } from './document.utility.js';

const CHECKS = {
  cpf: { fn: isValidCpf, label: 'CPF' },
  cnpj: { fn: isValidCnpj, label: 'CNPJ' },
} as const;

type DocumentKind = keyof typeof CHECKS;

/** Registra o decorator de validacao de CPF/CNPJ com mensagens padronizadas. */
function registerDocumentValidator(
  kind: DocumentKind,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    const { fn, label } = CHECKS[kind];

    registerDecorator({
      name: `is${kind.toUpperCase()}`,
      target: object.constructor,
      propertyName,
      options: {
        message: (args: ValidationArguments) =>
          `${args.property} deve ser um ${label} valido`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) => fn(value),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} deve ser um ${label} valido`,
      },
    });
  };
}

/** Valida os 11 digitos e os dois digitos verificadores de um CPF. */
export function IsCpf(validationOptions?: ValidationOptions) {
  return registerDocumentValidator('cpf', validationOptions);
}

/** Valida os 14 digitos e os dois digitos verificadores de um CNPJ. */
export function IsCnpj(validationOptions?: ValidationOptions) {
  return registerDocumentValidator('cnpj', validationOptions);
}