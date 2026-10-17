import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';

/** Token de injecao das opcoes de JWT. */
export const JWT_SETTINGS = 'auth:jwt-settings';

export interface JwtSettings {
  secret: string;
  expiresIn: string;
}

/**
 * Le o segredo e o tempo de expiracao da `.env`.
 *
 * provider unico consumido tanto pelo `JwtModule` (que assina os tokens)
 * quanto pelo `JwtStrategy` (que valida) — assim os dois nunca divergem.
 */
export function buildJwtSettings(config: ConfigService): JwtSettings {
  return {
    secret: config.getOrThrow<string>('JWT_SECRET'),
    expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '1h',
  };
}

export function buildJwtModuleOptions(
  settings: JwtSettings,
): JwtModuleOptions {
  return {
    secret: settings.secret,
    signOptions: {
      // `jsonwebtoken` tipa `expiresIn` como `StringValue` do pacote `ms`; o
      // valor vem de string livre na env, entao o cast e inevitavel.
      expiresIn: settings.expiresIn as JwtSignOptionsExpiresIn,
    },
  };
}

type JwtSignOptionsExpiresIn = NonNullable<
  JwtModuleOptions['signOptions']
>['expiresIn'];