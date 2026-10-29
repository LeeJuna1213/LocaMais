import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ClientModule } from '../client/client.module.js';
import { UserModule } from '../user/user.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  JWT_SETTINGS,
  buildJwtModuleOptions,
  buildJwtSettings,
} from './jwt.settings.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    UserModule,
    ClientModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      // O factory de um modulo dinamico so enxerga providers do proprio
      // modulo e dos globais — por isso `ConfigService` em vez de
      // `JWT_SETTINGS`. A origem dos valores continua sendo `buildJwtSettings`.
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildJwtModuleOptions(buildJwtSettings(config)),
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: JWT_SETTINGS, useFactory: buildJwtSettings, inject: [ConfigService] },
    AuthService,
    JwtStrategy,
  ],
})
export class AuthModule {}