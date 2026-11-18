import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ApiErrorService {
  message(error: unknown, fallback = 'Não foi possível concluir a operação.'): string {
    if (!(error instanceof HttpErrorResponse)) {
      return error instanceof Error && error.message ? error.message : fallback;
    }

    if (error.status === 0) {
      return 'Não foi possível conectar à API. Verifique sua conexão e tente novamente.';
    }
    if (error.status === 401) {
      return 'E-mail ou senha inválidos, ou sessão expirada.';
    }
    if (error.status === 403) {
      return 'Você não tem permissão para realizar esta ação.';
    }
    if (error.status === 404) {
      return 'O recurso solicitado não foi encontrado.';
    }
    if (error.status === 409) {
      const message = this.bodyMessage(error.error);
      if (message && /e?-?mail/.test(message.toLowerCase())) return 'Este e-mail já está cadastrado.';
      if (message && /cpf/.test(message.toLowerCase())) return 'Este CPF já está cadastrado.';
      if (message && /cnpj/.test(message.toLowerCase())) return 'Este CNPJ já está cadastrado.';
      return message ?? 'A operação conflita com o estado atual do cadastro.';
    }
    if (error.status >= 500) {
      return 'O serviço está indisponível no momento. Tente novamente.';
    }
    if (error.status === 400) {
      const messages = this.bodyMessages(error.error);
      return messages?.map((message) => this.translateValidationMessage(message)).join(' ') ?? 'Verifique os dados informados.';
    }
    return this.bodyMessage(error.error) ?? fallback;
  }

  private bodyMessage(body: unknown): string | null {
    return this.bodyMessages(body)?.join(' ') ?? null;
  }

  private bodyMessages(body: unknown): string[] | null {
    if (!body || typeof body !== 'object' || !('message' in body)) return null;
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return [message];
    if (Array.isArray(message)) return message.filter((item): item is string => typeof item === 'string' && !!item.trim());
    return null;
  }

  private translateValidationMessage(message: string): string {
    const normalized = message.toLowerCase();
    if (/cpf.*(valido|válido)/.test(normalized)) return 'CPF inválido. Confira os dígitos e tente novamente.';
    if (/cnpj.*(valido|válido)/.test(normalized)) return 'CNPJ inválido. Confira os dígitos e tente novamente.';
    if (/email/.test(normalized) && /(valid|must be an email|endereço de email)/.test(normalized)) return 'Informe um e-mail válido.';
    if (/password/.test(normalized) && /(at least|ao menos|shorter|least|too short)/.test(normalized)) return 'A senha deve ter pelo menos 8 caracteres.';
    if (/password/.test(normalized) && /(longer|mais de|maximum|maximo)/.test(normalized)) return 'A senha deve ter no máximo 72 caracteres.';
    if (/data_nascimento/.test(normalized)) return 'Informe uma data de nascimento válida.';
    if (/razao_social/.test(normalized)) return 'Informe a razão social da empresa.';
    if (/cep/.test(normalized)) return 'Informe um CEP válido com 8 dígitos.';
    if (/uf/.test(normalized)) return 'Informe a sigla do estado com 2 letras.';
    return message;
  }
}
