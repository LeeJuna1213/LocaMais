/**
 * Estados possíveis de um veículo.
 *
 * O TypeORM grava o valor textual (`simple-enum`), e o TypeScript restringe
 * os valores aceitos em tempo de compilação. Qualquer outro texto é rejeitado
 * pela validação do DTO.
 */
export enum StatusVeiculo {
  DISPONIVEL = 'disponivel',
  ALUGADO = 'alugado',
  // Mantemos o valor original (com acento) para não alterar os dados já
  // gravados na coluna `status` da tabela `cars`.
  MANUTENCAO = 'em manutenção',
}
