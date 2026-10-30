import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Valida que o valor é uma string JSON contendo um array de strings (URLs ou caminhos de fotos).
 *
 * O atributo `fotos` da entidade `Vistoria` é modelado como uma coluna textual
 * que armazena uma lista serializada em JSON, por exemplo:
 * `["https://exemplo.com/foto1.jpg", "https://exemplo.com/foto2.jpg"]`
 *
 * Imagens não são armazenadas diretamente no banco de dados; apenas referências
 * textuais (URLs/caminhos).
 */
export function IsFotosJson(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isFotosJson',
      target: object.constructor,
      propertyName,
      options: {
        message: (args: ValidationArguments) =>
          `${args.property} deve ser um JSON valido contendo um array de strings (ex: ["url1", "url2"])`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown): boolean => {
          if (typeof value !== 'string') return false;
          try {
            const parsed = JSON.parse(value);
            return (
              Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
            );
          } catch {
            return false;
          }
        },
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} deve ser um JSON valido contendo um array de strings (ex: ["url1", "url2"])`,
      },
    });
  };
}
