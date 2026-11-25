import { INestApplication, ValidationPipe } from '@nestjs/common';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Configuração comum a `main.ts` e aos testes e2e.
 *
 * Fica em um lugar só de propósito: se os testes usassem um `ValidationPipe`
 * diferente do de produção, estariam validando um caminho que ninguém usa.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  // Rota estática fora do prefixo global para URLs /uploads/... no frontend.
  app.use('/uploads', express.static(resolve(apiRoot, 'uploads')));

  /**
   * `whitelist` remove propriedades sem decorator de validação;
   * `forbidNonWhitelisted` transforma isso em 400 em vez de ignorar em
   * silêncio. `transform` converte o body na instância do DTO, de onde os
   * decorators de coerência leem `tipo_pessoa`/`type` via `args.object`.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set(configuredOrigins.length ? configuredOrigins : [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'http://localhost:8100',
    'http://127.0.0.1:8100',
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
    'ionic://localhost',
  ]);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  return app;
}
