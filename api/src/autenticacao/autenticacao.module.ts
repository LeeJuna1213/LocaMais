import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ClienteModule } from '../cliente/cliente.module.js';
import { UsuarioModule } from '../usuario/usuario.module.js';
import { AutenticacaoController } from './autenticacao.controller.js';
import { AutenticacaoService } from './autenticacao.service.js';
import {
  JWT_SETTINGS,
  buildJwtModuleOptions,
  buildJwtSettings,
} from './jwt.settings.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    UsuarioModule,
    ClienteModule,
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
  controllers: [AutenticacaoController],
  providers: [
    { provide: JWT_SETTINGS, useFactory: buildJwtSettings, inject: [ConfigService] },
    AutenticacaoService,
    JwtStrategy,
  ],
})
export class AutenticacaoModule {}