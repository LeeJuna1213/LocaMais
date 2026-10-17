export enum UserType {
  FUNCIONARIO = 'funcionario',
  CLIENTE = 'cliente',
  ADMIN = 'admin',
}

/**
 * Define se o cliente e uma Pessoa Fisica (PF) ou Pessoa Juridica (PJ).
 * Clientes PF tem `cpf` + `data_nascimento`; clientes PJ tem `cnpj` + `razao_social`.
 */
export enum TipoPessoa {
  PF = 'PF',
  PJ = 'PJ',
}