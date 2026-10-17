import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Configuração comum a `main.ts` e aos testes e2e.
 *
 * Fica em um lugar só de propósito: se os testes usassem um `ValidationPipe`
 * diferente do de produção, estariam validando um caminho que ninguém usa.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');

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

  app.enableCors({ origin: true, credentials: true });

  return app;
}