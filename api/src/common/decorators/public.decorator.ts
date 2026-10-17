import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Marca a rota como publica, dispensando o `JwtAuthGuard`.
 *
 * O guard e registrado globalmente como *default deny*: sem este decorator a
 * rota exige token. Isso evita esquecer de proteger um endpoint novo.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);