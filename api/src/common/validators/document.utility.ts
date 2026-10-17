/**
 * Validacao de CPF e CNPJ.
 *
 * Removemos a mascara, conferimos o tamanho e recalculamos os dois digitos
 * verificadores a partir da base. Sequencias como `000...0` ou `111...1`
 * passam no calculo mas sao invalidas por lei, entao sao rejeitadas antes.
 */

/** Pesos do 1o digito verificador do CPF (base de 9 digitos). */
const CPF_WEIGHTS_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];

/** Pesos do 2o digito verificador do CPF (base de 10 digitos). */
const CPF_WEIGHTS_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

/** Pesos do 1o digito verificador do CNPJ (base de 12 digitos). */
const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Pesos do 2o digito verificador do CNPJ (base de 13 digitos). */
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Remove qualquer caractere nao numerico: `529.982.247-25` -> `52998224725`. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** `true` quando todos os digitos sao iguais (`000...`, `111...`). */
function hasAllSameDigits(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

/**
 * Soma ponderada e digito verificador modulo 11.
 * Resultado zero quando o resto e 0 ou 1.
 */
function calcCheckDigit(base: string, weights: number[]): number {
  const sum = base
    .split('')
    .reduce(
      (acc, digit, i) => acc + Number(digit) * weights[i],
      0,
    );

  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (hasAllSameDigits(cpf)) return false;

  const firstDigit = calcCheckDigit(cpf.slice(0, 9), CPF_WEIGHTS_1);
  if (firstDigit !== Number(cpf[9])) return false;

  const secondDigit = calcCheckDigit(cpf.slice(0, 10), CPF_WEIGHTS_2);
  return secondDigit === Number(cpf[10]);
}

export function isValidCnpj(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (hasAllSameDigits(cnpj)) return false;

  const firstDigit = calcCheckDigit(cnpj.slice(0, 12), CNPJ_WEIGHTS_1);
  if (firstDigit !== Number(cnpj[12])) return false;

  const secondDigit = calcCheckDigit(cnpj.slice(0, 13), CNPJ_WEIGHTS_2);
  return secondDigit === Number(cnpj[13]);
}