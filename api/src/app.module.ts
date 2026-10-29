import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { buildTypeOrmOptions } from './config/database.config.js';
import { DatabaseModule } from './database/database.module.js';
import { UserModule } from './user/user.module.js';
import { ClientModule } from './client/client.module.js';
import { AddressModule } from './address/address.module.js';
import { CarModule } from './car/car.module.js';
import { ReservationModule } from './reservation/reservation.module.js';

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

    UserModule,
    AuthModule,
    DatabaseModule,
    ClientModule,
    AddressModule,
    CarModule,
    ReservationModule,
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
