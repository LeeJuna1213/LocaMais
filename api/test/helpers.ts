import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

/**
 * Força SQLite em memória via `process.env`.
 *
 * O `@nestjs/config` dá precedência ao `process.env` sobre o arquivo `.env`,
 * então não é preciso sobrescrever o provider do TypeORM: o
 * `buildTypeOrmOptions` — o mesmo código de produção — é o que é exercitado.
 *
 * Precisa ser chamado **antes** de `createTestingApp`.
 */
export function useInMemoryDatabase(): void {
  process.env.DATABASE_TYPE = 'sqlite';
  process.env.DATABASE_FILE = ':memory:';
  process.env.DATABASE_SYNCHRONIZE = 'true';
  process.env.DATABASE_LOGGING = 'false';

  process.env.JWT_SECRET = 'segredo-de-teste-nao-use-em-producao';
  process.env.JWT_EXPIRES_IN = '15m';

  // 4 rounds deixa o bcrypt rapid o suficiente para a suite.
  process.env.BCRYPT_ROUNDS = '4';

  // Sem seed: cada teste decide os usuarios que precisa.
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_NAME;
}

/** Sobe o `AppModule` com a mesma configuração de `main.ts`. */
export async function createTestingApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return app;
}

type Json = Record<string, unknown>;

export interface TestResponse<T = Json> {
  status: number;
  body: T;
  token?: string;
}

/** `POST` com JSON e, opcionalmente, um bearer token. */
export async function post<T = Json>(
  app: INestApplication,
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  const response = await request(app.getHttpServer())
    .post(`/api${path}`)
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token ?? ''}`)
    .send(body as object);

  return { status: response.status, body: response.body as T };
}

/** Autentica e devolve o access token. */
export async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const { status, body } = await post<{ access_token: string }>(
    app,
    '/auth/login',
    { email, password },
  );

  if (status !== 201 && status !== 200) {
    throw new Error(`login falhou (${status}): ${JSON.stringify(body)}`);
  }

  return body.access_token;
}

/** CPF válido gerado a partir de uma base de 9 dígitos. */
export function makeCpf(base9: string): string {
  const dv = (base: string, weights: number[]) =>
    (() => {
      const sum = base
        .split('')
        .reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    })();

  const w1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const first = dv(base9, w1);
  return base9 + first + dv(base9 + first, w2);
}

/** CNPJ válido gerado a partir de uma base de 12 dígitos. */
export function makeCnpj(base12: string): string {
  const dv = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const first = dv(base12, w1);
  return base12 + first + dv(base12 + first, w2);
}

/** Endereço válido para reutilizar entre os cenários. */
export const ENDERECO = {
  logradouro: 'Rua das Flores',
  numero: '123',
  bairro: 'Centro',
  cidade: 'Sao Paulo',
  uf: 'SP',
  cep: '01001000',
};

/** `GET` com bearer token opcional. */
export async function get<T = Json>(
  app: INestApplication,
  path: string,
  token?: string,
): Promise<{ status: number; body: T }> {
  const req = request(app.getHttpServer()).get(`/api${path}`);
  if (token) req.set('Authorization', `Bearer ${token}`);

  const response = await req;
  return { status: response.status, body: response.body as T };
}

/** `PATCH` com JSON e bearer token opcional. */
export async function patch<T = Json>(
  app: INestApplication,
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  const req = request(app.getHttpServer())
    .patch(`/api${path}`)
    .set('Content-Type', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);

  const response = await req.send(body as object);
  return { status: response.status, body: response.body as T };
}

/** `DELETE` com bearer token opcional. */
export async function del<T = Json>(
  app: INestApplication,
  path: string,
  token?: string,
): Promise<{ status: number; body: T }> {
  const req = request(app.getHttpServer()).delete(`/api${path}`);
  if (token) req.set('Authorization', `Bearer ${token}`);

  const response = await req;
  return { status: response.status, body: response.body as T };
}