import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { createTestingApp } from './helpers.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // `createTestingApp` aplica o mesmo `configureApp` do main.ts, incluindo
    // o prefixo global `/api`. Assim o teste exercita o caminho real.
    app = await createTestingApp();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('gera o documento OpenAPI sem referencias circulares', () => {
    const config = new DocumentBuilder()
      .setTitle('locaMais API')
      .setDescription('Documento gerado no teste e2e')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    expect(document.openapi).toBeDefined();
    expect(Object.keys(document.paths).length).toBeGreaterThan(0);
    expect(document.components?.schemas).toBeDefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
