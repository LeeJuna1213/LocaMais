import { ClientType } from '../models';

const CPF_FORMAT = /^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/;
const CNPJ_FORMAT = /^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/;

/** Retorna somente os dígitos para transporte no contrato da API. */
export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, '');
}

function allDigitsEqual(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

function checkDigit(base: string, weights: number[]): number {
  const sum = [...base].reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function validCpf(value: string): boolean {
  if (!CPF_FORMAT.test(value)) return false;
  const digits = normalizeDocument(value);
  if (allDigitsEqual(digits)) return false;
  const first = checkDigit(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(digits[9])) return false;
  return checkDigit(digits.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[10]);
}

function validCnpj(value: string): boolean {
  if (!CNPJ_FORMAT.test(value)) return false;
  const digits = normalizeDocument(value);
  if (allDigitsEqual(digits)) return false;
  const first = checkDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(digits[12])) return false;
  return checkDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[13]);
}

/** Valida máscara aceita e os dois dígitos verificadores conforme a API. */
export function validateDocument(type: ClientType, value: string): string | null {
  if (type === 'PF') {
    return validCpf(value) ? null : 'CPF inválido. Confira os 11 dígitos e os dígitos verificadores.';
  }
  return validCnpj(value) ? null : 'CNPJ inválido. Confira os 14 dígitos e os dígitos verificadores.';
}
