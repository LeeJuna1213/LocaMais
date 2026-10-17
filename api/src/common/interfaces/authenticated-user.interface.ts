import { UserType } from '../../user/enums/user.enum.js';

/** Identidade carregada no `request.user` pelo `JwtStrategy`. */
export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  type: UserType;
}

/** Payload assinado no access token. */
export interface JwtPayload {
  /** id do usuario */
  sub: number;
  /** papel do usuario no momento da emissao do token */
  type: UserType;
}