import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordRecoveryMailer } from '../src/autenticacao/password-recovery.mailer.js';
import { PasswordResetToken } from '../src/autenticacao/entities/password-reset-token.entity.js';
import { useInMemoryDatabase } from './helpers.js';

const EMAIL = 'recovery.e2e@example.test';
const INITIAL_PASSWORD = 'OriginalPass1!';
const ADDRESS = {
  logradouro: 'Rua das Flores', numero: '123', bairro: 'Centro',
  cidade: 'Sao Paulo', uf: 'SP', cep: '01001000',
};

describe('Password recovery HTTP flow (e2e)', () => {
  let app: INestApplication;
  let rawToken = '';
  const sendRecovery = async (_email: string, token: string) => { rawToken = token; };
  const mailer = { isConfigured: () => true, sendRecovery };

  beforeAll(async () => {
    useInMemoryDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasswordRecoveryMailer)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    await request(app.getHttpServer()).post('/api/autenticacao/register').send({
      name: 'Recovery User', email: EMAIL, password: INITIAL_PASSWORD,
      cliente: { tipo_pessoa: 'PF', cpf: '52998224725', data_nascimento: '1990-05-10', endereco: ADDRESS },
    }).expect(201);
  });

  afterAll(async () => { if (app) await app.close(); });

  it('returns identical generic responses for existing and unknown email and persists only the token hash', async () => {
    const known = await request(app.getHttpServer()).post('/api/autenticacao/recuperar-senha').send({ email: EMAIL }).expect(200);
    const unknown = await request(app.getHttpServer()).post('/api/autenticacao/recuperar-senha').send({ email: 'unknown@example.test' }).expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.message).toContain('Se existir uma conta vinculada');

    const repository = app.get(DataSource).getRepository(PasswordResetToken);
    const stored = await repository.findOneByOrFail({ tokenHash: createHash('sha256').update(rawToken).digest('hex') });
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.userId).toBeGreaterThan(0);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects invalid and expired tokens, updates bcrypt password once, and prevents reuse', async () => {
    await request(app.getHttpServer()).post('/api/autenticacao/recuperar-senha').send({ email: EMAIL }).expect(200);
    const token = rawToken;
    await request(app.getHttpServer()).post('/api/autenticacao/redefinir-senha')
      .send({ token: 'x'.repeat(43), novaSenha: 'NovaSenha1!' }).expect(400);

    await request(app.getHttpServer()).post('/api/autenticacao/redefinir-senha')
      .send({ token, novaSenha: 'NovaSenha1!' }).expect(200);
    await request(app.getHttpServer()).post('/api/autenticacao/redefinir-senha')
      .send({ token, novaSenha: 'OutraSenha2!' }).expect(400);

    await request(app.getHttpServer()).post('/api/autenticacao/login')
      .send({ email: EMAIL, password: INITIAL_PASSWORD }).expect(401);
    await request(app.getHttpServer()).post('/api/autenticacao/login')
      .send({ email: EMAIL, password: 'NovaSenha1!' }).expect(200);
  });

  it('rejects expired token and validates reset payload', async () => {
    await request(app.getHttpServer()).post('/api/autenticacao/recuperar-senha').send({ email: EMAIL }).expect(200);
    const repository = app.get(DataSource).getRepository(PasswordResetToken);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await repository.update({ tokenHash }, { expiresAt: new Date(Date.now() - 1) });

    await request(app.getHttpServer()).post('/api/autenticacao/redefinir-senha')
      .send({ token: rawToken, novaSenha: 'NovaSenha1!' }).expect(400);
    await request(app.getHttpServer()).post('/api/autenticacao/redefinir-senha')
      .send({ token: rawToken, novaSenha: 'short' }).expect(400);
  });
});
