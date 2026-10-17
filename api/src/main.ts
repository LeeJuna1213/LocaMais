import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('locaMais API')
    .setDescription(
      'API de autenticacao e usuarios da locadora. ' +
        'Use o botao "Authorize" com o access token retornado em POST /api/auth/login.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = app.get(ConfigService).get<string>('PORT') ?? 3000;
  await app.listen(Number(port));

  console.log(`API em http://localhost:${port}/api — docs em /docs`);
}

await bootstrap();