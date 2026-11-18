import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { ApiErrorService } from './api-error.service';

describe('ApiErrorService', () => {
  const errors = new ApiErrorService();

  it.each([
    [400, { message: ['email must be valid', 'password too short'] }, 'Informe um e-mail válido. A senha deve ter pelo menos 8 caracteres.'],
    [401, { message: 'email ou senha invalidos' }, 'E-mail ou senha inválidos, ou sessão expirada.'],
    [403, { message: 'forbidden' }, 'Você não tem permissão para realizar esta ação.'],
    [500, { message: 'internal error' }, 'O serviço está indisponível no momento. Tente novamente.'],
  ])('converte HTTP %i em mensagem segura', (status, body, expected) => {
    expect(errors.message(new HttpErrorResponse({ status, error: body }))).toBe(expected);
  });

  it('informa indisponibilidade de rede sem expor detalhes internos', () => {
    expect(errors.message(new HttpErrorResponse({ status: 0 }))).toBe(
      'Não foi possível conectar à API. Verifique sua conexão e tente novamente.',
    );
  });

  it.each([
    ['CPF já cadastrado', 'Este CPF já está cadastrado.'],
    ['CNPJ já cadastrado', 'Este CNPJ já está cadastrado.'],
    ['E-mail já cadastrado', 'Este e-mail já está cadastrado.'],
  ])('explica conflitos de cadastro: %s', (message, expected) => {
    expect(errors.message(new HttpErrorResponse({ status: 409, error: { message } }))).toBe(expected);
  });

  it('identifica CPF inválido nos erros de validação do backend', () => {
    expect(errors.message(new HttpErrorResponse({ status: 400, error: { message: ['cpf deve ser um CPF valido'] } })))
      .toBe('CPF inválido. Confira os dígitos e tente novamente.');
  });
});
