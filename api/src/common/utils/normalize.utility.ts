import { isValidCnpj, isValidCpf } from '../validators/document.utility.js';

/** Normaliza email para minúsculas e sem espaços nas pontas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deixa apenas os dígitos de um documento, para que `123.456.789-09` e
 * `12345678909` colidam na constraint `unique` do banco.
 */
export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, '');
}

export { isValidCnpj, isValidCpf };