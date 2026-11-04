import { TipoUsuario } from '../../usuario/enums/usuario.enum.js';

/** Identidade carregada no `request.user` pelo `JwtStrategy`. */
export interface UsuarioAutenticado {
  id: number;
  email: string;
  name: string;
  type: TipoUsuario;
}

/** Payload assinado no access token. */
export interface JwtPayload {
  /** id do usuario */
  sub: number;
  /** papel do usuario no momento da emissao do token */
  type: TipoUsuario;
}