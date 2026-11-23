import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Cliente } from '../src/cliente/entities/cliente.entity.js';
import {
  createTestingApp,
  ENDERECO,
  makeCnpj,
  makeCpf,
  post,
} from './helpers.js';

describe('client registration document contract (e2e)', () => {
  let app: INestApplication;
  let clients: DataSource;

  beforeAll(async () => {
    app = await createTestingApp();
    clients = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a formatted CNPJ, normalizes it in SQLite, and rejects its duplicate', async () => {
    const cnpj = makeCnpj('123456780001');
    const formatted = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
    const registration = await post<{ user: { id: number } }>(app, '/autenticacao/register', {
      name: 'Empresa de Teste',
      email: 'cnpj-registration@example.test',
      password: 'senha-secreta',
      cliente: {
        tipo_pessoa: 'PJ',
        cnpj: formatted,
        razao_social: 'Empresa de Teste Ltda',
        endereco: ENDERECO,
      },
    });

    expect(registration.status).toBe(201);
    const savedClient = await clients.getRepository(Cliente).findOneByOrFail({
      user_id: registration.body.user.id,
    });
    expect(savedClient.cnpj).toBe(cnpj);

    const duplicate = await post(app, '/autenticacao/register', {
      name: 'Outra Empresa',
      email: 'cnpj-duplicate@example.test',
      password: 'senha-secreta',
      cliente: {
        tipo_pessoa: 'PJ',
        cnpj,
        razao_social: 'Outra Empresa Ltda',
        endereco: ENDERECO,
      },
    });
    expect(duplicate.status).toBe(409);
    expect(JSON.stringify(duplicate.body)).toContain('CNPJ');
  });

  it('accepts an unformatted CPF, persists digits only, and reports a CPF duplicate', async () => {
    const cpf = makeCpf('987654321');
    const registration = await post<{ user: { id: number } }>(app, '/autenticacao/register', {
      name: 'Pessoa de Teste',
      email: 'cpf-registration@example.test',
      password: 'senha-secreta',
      cliente: {
        tipo_pessoa: 'PF',
        cpf,
        data_nascimento: '1990-05-10',
        endereco: ENDERECO,
      },
    });

    expect(registration.status).toBe(201);
    const savedClient = await clients.getRepository(Cliente).findOneByOrFail({
      user_id: registration.body.user.id,
    });
    expect(savedClient.cpf).toBe(cpf);

    const formatted = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    const duplicate = await post(app, '/autenticacao/register', {
      name: 'Outra Pessoa',
      email: 'cpf-duplicate@example.test',
      password: 'senha-secreta',
      cliente: {
        tipo_pessoa: 'PF',
        cpf: formatted,
        data_nascimento: '1991-05-10',
        endereco: ENDERECO,
      },
    });
    expect(duplicate.status).toBe(409);
    expect(JSON.stringify(duplicate.body)).toContain('CPF');
  });

  it.each([
    ['CPF com letras', 'PF', { cpf: 'CPF 52998224725', data_nascimento: '1990-05-10' }],
    ['CPF com pontuação malformada', 'PF', { cpf: '529..982.247-25', data_nascimento: '1990-05-10' }],
    ['CNPJ com letras', 'PJ', { cnpj: 'CNPJ 11222333000181', razao_social: 'Empresa Teste Ltda' }],
    ['CNPJ com dígito verificador inválido', 'PJ', { cnpj: '11222333000180', razao_social: 'Empresa Teste Ltda' }],
  ] as const)('rejects %s at the HTTP validation boundary', async (_label, tipo_pessoa, fields) => {
    const response = await post(app, '/autenticacao/register', {
      name: 'Teste de Documento',
      email: `invalid-${Date.now()}-${Math.random()}@example.test`,
      password: 'senha-secreta',
      cliente: { tipo_pessoa, ...fields, endereco: ENDERECO },
    });
    expect(response.status).toBe(400);
  });
});
