import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { createTestingApp, post, useInMemoryDatabase } from './helpers.js';

const PNG = readFileSync(resolve(process.cwd(), '../frontend/src/assets/logo.png'));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const WEBP = Buffer.from('RIFF0000WEBP');

describe('Foto do usuário (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let userId: number;

  beforeAll(async () => {
    useInMemoryDatabase();
    app = await createTestingApp();
    const registration = await post<{ access_token: string; user: { id: number } }>(app, '/autenticacao/register', {
      name: 'Foto E2E', email: `foto-${Date.now()}@example.test`, password: 'SenhaTeste1!',
      cliente: {
        tipo_pessoa: 'PF', cpf: '52998224725', data_nascimento: '1990-05-10',
        endereco: { logradouro: 'Rua Teste', numero: '10', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ', cep: '20000000' },
      },
    });
    token = registration.body.access_token;
    userId = registration.body.user.id;
  });

  afterAll(async () => { if (app) await app.close(); });

  it('exige JWT e salva JPEG, PNG e WebP no usuário do token', async () => {
    await request(app.getHttpServer()).post('/api/usuarios/me/foto')
      .attach('foto', JPEG, { filename: 'foto.jpg', contentType: 'image/jpeg' }).expect(401);

    for (const [file, name, mime] of [
      [JPEG, 'foto.jpg', 'image/jpeg'], [PNG, 'foto.png', 'image/png'], [WEBP, 'foto.webp', 'image/webp'],
    ] as const) {
      const response = await request(app.getHttpServer()).post('/api/usuarios/me/foto')
        .set('Authorization', `Bearer ${token}`)
        .attach('foto', file, { filename: name, contentType: mime }).expect(200);
      expect(response.body).toEqual({ message: 'Foto de perfil atualizada com sucesso', foto: expect.stringMatching(/^\/uploads\/usuarios\//) });

      const current = await request(app.getHttpServer()).get('/api/autenticacao/me')
        .set('Authorization', `Bearer ${token}`).expect(200);
      expect(current.body.foto).toBe(response.body.foto);
      expect(current.body.id).toBe(userId);
      const image = await request(app.getHttpServer()).get(response.body.foto).expect(200);
      expect(image.headers['content-type']).toContain(mime);
    }
  });

  it('rejeita formato inválido e conteúdo incompatível sem substituir a foto existente', async () => {
    const before = await request(app.getHttpServer()).get('/api/autenticacao/me')
      .set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).post('/api/usuarios/me/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', Buffer.from('not an image'), { filename: 'foto.png', contentType: 'image/png' }).expect(400);
    await request(app.getHttpServer()).post('/api/usuarios/me/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'foto.png', contentType: 'image/png' }).expect(400);
    const after = await request(app.getHttpServer()).get('/api/autenticacao/me')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(after.body.foto).toBe(before.body.foto);
  });

  it('rejeita arquivos maiores que 5 MB', async () => {
    await request(app.getHttpServer()).post('/api/usuarios/me/foto')
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', Buffer.alloc(5 * 1024 * 1024 + 1, 0), { filename: 'grande.jpg', contentType: 'image/jpeg' })
      .expect((response) => expect(response.status).toBeGreaterThanOrEqual(400));
  });

  it('remove a imagem e devolve avatar nulo', async () => {
    const response = await request(app.getHttpServer()).delete('/api/usuarios/me/foto')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body).toEqual({ message: 'Foto de perfil removida com sucesso', foto: null });
    const current = await request(app.getHttpServer()).get('/api/autenticacao/me')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(current.body.foto).toBeNull();
  });
});
