import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadHttpsOptions } from './https-options.js';

async function bootstrap() {
  const httpsOptions = loadHttpsOptions(process.env);
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    ...(httpsOptions ? { httpsOptions } : {}),
  });

  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('locaMais API')
    .setDescription(
      'API de autenticacao e usuarios da locadora. ' +
        'Use o botao "Authorize" com o access token retornado em POST /api/autenticacao/login.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT') ?? 3000);
  const host = config.get<string>('HOST') ?? '127.0.0.1';
  await app.listen(port, host);

  const scheme = httpsOptions ? 'https' : 'http';
  console.log(`API escutando em ${scheme}://${host}:${port} — prefixo /api — documentação em /docs`);
}

await bootstrap();
