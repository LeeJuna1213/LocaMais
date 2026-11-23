import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { ShopService } from './shop.service';

describe('ShopService status API contract', () => {
  let service: ShopService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ShopService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('envia booleans verdadeiros e falsos sem converter para texto', async () => {
    const active = service.save({ codigo: 'A', nome: 'Ativa', ativa: true });
    const activeRequest = http.expectOne(`${environment.apiUrl}/lojas`);
    expect(activeRequest.request.body.ativa).toBe(true);
    activeRequest.flush({ id: 1, codigo: 'A', nome: 'Ativa', ativa: true });
    await active;

    const inactive = service.save({ codigo: 'B', nome: 'Inativa', ativa: false });
    const inactiveRequest = http.expectOne(`${environment.apiUrl}/lojas`);
    expect(inactiveRequest.request.body.ativa).toBe(false);
    inactiveRequest.flush({ id: 2, codigo: 'B', nome: 'Inativa', ativa: false });
    await inactive;
  });

  it('remove campos de resposta da API antes de enviar PATCH, mantendo ativa=false', async () => {
    const update = service.save({
      id: 17,
      codigo: 'RJ01', nome: 'Loja Centro', telefone: '21999999999', email: 'loja@example.com',
      logradouro: 'Rua A', numero: '10', complemento: null, bairro: 'Centro', cidade: 'Rio de Janeiro',
      uf: 'RJ', cep: '20000000', ativa: false,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    } as any, 17);
    const request = http.expectOne(`${environment.apiUrl}/lojas/17`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      codigo: 'RJ01', nome: 'Loja Centro', telefone: '21999999999', email: 'loja@example.com',
      logradouro: 'Rua A', numero: '10', complemento: null, bairro: 'Centro', cidade: 'Rio de Janeiro',
      uf: 'RJ', cep: '20000000', ativa: false,
    });
    request.flush({ id: 17, ...request.request.body, created_at: '', updated_at: '' });
    await update;
  });

  it('busca opções de retirada no endpoint que retorna somente lojas ativas', async () => {
    const result = service.loadActive();
    const request = http.expectOne(`${environment.apiUrl}/lojas/ativas`);
    request.flush([{ id: 1, codigo: 'A', nome: 'Ativa', ativa: true }]);
    await result;
    expect(service.shops().every((shop) => shop.ativa)).toBe(true);
  });
});
