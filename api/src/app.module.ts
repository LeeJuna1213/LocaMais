import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutenticacaoModule } from './autenticacao/autenticacao.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { buildTypeOrmOptions } from './config/database.config.js';
import { DatabaseModule } from './database/database.module.js';
import { UsuarioModule } from './usuario/usuario.module.js';
import { ClienteModule } from './cliente/cliente.module.js';
import { EnderecoModule } from './endereco/endereco.module.js';
import { CarroModule } from './carro/carro.module.js';
import { ReservaModule } from './reserva/reserva.module.js';
import { LocacaoModule } from './locacao/locacao.module.js';
import { VistoriaModule } from './vistoria/vistoria.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', '.env.local'],
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),

    // Observe é opcional: sem OBSERVE_APP_KEY/OBSERVE_APP_SECRET válidos ele
    // não envia telemetria. As credenciais vêm do ambiente (nunca do código),
    // e `serviceId` permite distinguir instâncias no painel.
    ObserveModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        appKey: config.get<string>('OBSERVE_APP_KEY') ?? '',
        appSecret: config.get<string>('OBSERVE_APP_SECRET') ?? '',
        serviceId: config.get<string>('OBSERVE_SERVICE_ID') ?? 'api',
      }),
    }),

    UsuarioModule,
    AutenticacaoModule,
    DatabaseModule,
    ClienteModule,
    EnderecoModule,
    CarroModule,
    ReservaModule,
    LocacaoModule,
    VistoriaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Default deny: so rotas com `@Public()` sao acessíveis sem token.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
