
/*
 * ENTITY (ENTIDADE) NO TYPEORM
 *
 * Uma Entity é uma classe TypeScript utilizada para
 * representar e mapear uma tabela do banco de dados.
 *
 * No nosso projeto de locadora de carros, a entidade
 * User representa os usuários cadastrados no sistema.
 *
 * O TypeORM é uma biblioteca ORM (Object-Relational Mapping),
 * ou seja, uma ferramenta que permite relacionar objetos
 * da aplicação com tabelas de um banco de dados relacional.
 *
 * Com os decorators do TypeORM, podemos definir:
 * - O nome da tabela;
 * - As colunas e seus tipos;
 * - As chaves primárias;
 * - As restrições dos campos;
 * - Os relacionamentos entre tabelas;
 * - Os valores padrão;
 * - As datas de criação e atualização.
 *
 * IMPORTANTE:
 * A Entity define o mapeamento dos dados.
 * A criação das tabelas depende da configuração do TypeORM,
 * como migrations ou synchronize.
 */

// ============================================================
// IMPORTAÇÃO DOS DECORATORS DO TYPEORM
// ============================================================
//
// Esses decorators permitem informar ao TypeORM como
// as propriedades da classe serão representadas no banco.

import {
  Column,                 // Define uma coluna da tabela.
  CreateDateColumn,       // Registra automaticamente a data de criação.
  Entity,                 // Identifica a classe como uma entidade.
  Index,                  // Define índices para uma coluna.
  OneToOne,               // Define um relacionamento um para um.
  PrimaryGeneratedColumn, // Define uma chave primária gerada automaticamente.
  UpdateDateColumn,       // Registra automaticamente a data de atualização.
} from 'typeorm';

// Importa o enum UserType.
//
// Um enum define um conjunto de valores possíveis.
// No nosso sistema, ele representa os tipos de usuário,
// como ADMIN, FUNCIONARIO e CLIENTE.
import { UserType } from '../enums/user.enum.js';

// Importa a entidade Client.
//
// Ela representa as informações específicas dos clientes
// e será utilizada no relacionamento com a entidade User.
import { Client } from './client.entity.js';

// ============================================================
// DECORATOR @Entity()
// ============================================================
//
// Identifica a classe User como uma entidade do TypeORM.
//
// O argumento 'users' define o nome da tabela no MySQL.
//
// Portanto:
// Classe TypeScript: User
// Tabela do MySQL: users
//
// O TypeORM utiliza esse mapeamento para saber em qual
// tabela deverá executar as operações do Repository.
//
// O decorator não cria a tabela sozinho.
@Entity('users')
export class User {

  // ==========================================================
  // PRIMARY KEY - CHAVE PRIMÁRIA
  // ==========================================================
  //
  // @PrimaryGeneratedColumn() define a propriedade id
  // como chave primária da tabela.
  //
  // A chave primária identifica cada registro de forma única.
  //
  // Por padrão, no MySQL, esse decorator utiliza uma coluna
  // numérica com geração automática de valores.
  //
  // Exemplo:
  // Usuário Maria -> id = 1
  // Usuário João  -> id = 2
  // Usuário Ana   -> id = 3
  //
  // Assim, não precisamos informar manualmente o ID
  // durante um cadastro comum.
  //
  // O tipo number representa um valor numérico no TypeScript.

  @PrimaryGeneratedColumn()
  id: number;

  // ==========================================================
  // COLUMN - NOME DO USUÁRIO
  // ==========================================================
  //
  // @Column() informa ao TypeORM que a propriedade name
  // corresponde a uma coluna da tabela users.
  //
  // type: 'varchar'
  // Define que a coluna armazena texto de tamanho variável.
  //
  // length: 150
  // Define um limite máximo de 150 caracteres.
  //
  // nullable: false
  // Impede que a coluna receba o valor NULL.
  //
  // IMPORTANTE:
  // nullable: false não impede automaticamente uma string
  // vazia, como "". Para validar esse tipo de situação,
  // normalmente utilizamos DTOs com class-validator.
  //
  // Equivalente aproximado no MySQL:
  // name VARCHAR(150) NOT NULL

  @Column({
    type: 'varchar',
    length: 150,
    nullable: false,
  })
  name: string;

  // ==========================================================
  // INDEX UNIQUE - E-MAIL DO USUÁRIO
  // ==========================================================
  //
  // @Index({ unique: true })
  // Define um índice com restrição de unicidade.
  //
  // Isso significa que o banco não permite cadastrar
  // dois registros com o mesmo e-mail, considerando
  // suas regras de comparação de texto.
  //
  // Exemplo:
  // maria@email.com -> cadastrado
  // maria@email.com -> não pode ser repetido
  //
  // O índice também pode melhorar o desempenho de
  // consultas que pesquisam usuários pelo e-mail.
  //
  // @Column() define as características da coluna:
  //
  // type: 'varchar' -> texto variável
  // length: 180 -> até 180 caracteres
  // nullable: false -> não aceita NULL
  //
  // Equivalente aproximado no MySQL:
  // email VARCHAR(180) NOT NULL UNIQUE

  @Index({ unique: true })
  @Column({
    type: 'varchar',
    length: 180,
    nullable: false,
  })
  email: string;

  // ==========================================================
  // PASSWORD - SENHA DO USUÁRIO
  // ==========================================================
  //
  // Define a coluna responsável por armazenar
  // o hash da senha do usuário.
  //
  // IMPORTANTE:
  // A senha não deve ser armazenada em texto puro.
  //
  // No seu projeto, o UserService utiliza bcrypt
  // para transformar a senha em um hash antes de salvá-la.
  //
  // O bcrypt é um algoritmo utilizado para armazenar
  // senhas de maneira mais segura.
  //
  // type: 'varchar'
  // Armazena o hash como texto.
  //
  // length: 60
  // Comprimento compatível com hashes bcrypt tradicionais.
  //
  // nullable: false
  // A coluna não pode receber NULL.
  //
  // select: false
  // Impede que o TypeORM carregue automaticamente
  // a senha nas consultas comuns.
  //
  // Por exemplo:
  //
  // usersRepository.find()
  //
  // Normalmente não retorna a propriedade password.
  //
  // Durante o login, o Service pode solicitar
  // explicitamente essa coluna utilizando QueryBuilder:
  //
  // .addSelect('user.password')
  //
  // OBSERVAÇÃO:
  // select: false não criptografa a senha.
  // A geração do hash é responsabilidade de outra
  // parte da aplicação, como o UserService.

  @Column({
    type: 'varchar',
    length: 60,
    nullable: false,
    select: false,
  })
  password: string;

  // ==========================================================
  // ACTIVE - STATUS DO USUÁRIO
  // ==========================================================
  //
  // Indica se a conta do usuário está ativa.
  //
  // type: 'boolean'
  // Representa um valor verdadeiro ou falso.
  //
  // No MySQL, esse tipo normalmente é representado
  // por TINYINT(1).
  //
  // true  -> usuário ativo
  // false -> usuário inativo
  //
  // default: true
  // Define true como valor padrão no banco.
  //
  // Se nenhum valor for informado em uma inserção,
  // o banco poderá utilizar esse valor padrão.
  //
  // O significado de uma conta inativa e suas restrições
  // são definidos pelas regras de negócio da aplicação.

  @Column({
    type: 'boolean',
    default: true,
  })
  active: boolean;

  // ==========================================================
  // ENUM - TIPO DO USUÁRIO
  // ==========================================================
  //
  // Define qual é o papel do usuário no sistema.
  //
  // O tipo UserType foi importado de user.enum.ts.
  //
  // No seu projeto, os tipos são:
  // - ADMIN
  // - FUNCIONARIO
  // - CLIENTE
  //
  // type: 'simple-enum'
  // Informa ao TypeORM que a coluna utiliza os valores
  // definidos no enum.
  //
  // enum: UserType
  // Indica qual enum será utilizado.
  //
  // length: 20
  // Informa o tamanho configurado para o campo.
  //
  // default: UserType.CLIENTE
  // Define CLIENTE como o valor padrão.
  //
  // IMPORTANTE:
  // Esse campo registra o papel do usuário.
  // Ele não controla sozinho as permissões.
  //
  // As regras que determinam quem pode cadastrar,
  // consultar, atualizar ou excluir usuários são
  // aplicadas pelos guards e pelo UserService.

  @Column({
    type: 'simple-enum',
    enum: UserType,
    length: 20,
    default: UserType.CLIENTE,
  })
  type: UserType;

  // ==========================================================
  // RELACIONAMENTO ONE-TO-ONE - USER E CLIENT
  // ==========================================================
  //
  // @OneToOne() define um relacionamento um para um
  // entre duas entidades.
  //
  // No nosso sistema, um usuário do tipo CLIENTE
  // pode possuir um registro correspondente na
  // entidade Client.
  //
  // A entidade User contém informações gerais:
  // - Nome
  // - E-mail
  // - Senha
  // - Tipo de usuário
  //
  // A entidade Client contém informações específicas
  // de clientes, como CPF ou CNPJ.
  //
  // @OneToOne(() => Client, (client) => client.user)
  //
  // Primeira parte:
  // () => Client
  //
  // Informa qual entidade participa do relacionamento.
  //
  // Segunda parte:
  // (client) => client.user
  //
  // Indica a propriedade da entidade Client
  // que representa o outro lado do relacionamento.
  //
  // client: Client | null
  //
  // Significa que a propriedade pode conter
  // um objeto Client ou o valor null.
  //
  // Isso é útil porque nem todo usuário do sistema
  // precisa ser um cliente.
  //
  // IMPORTANTE:
  // A chave estrangeira e o lado proprietário da
  // relação dependem também da configuração
  // existente na entidade Client.
  //
  // Esse relacionamento não significa que o TypeORM
  // carregará automaticamente Client em toda consulta.

  @OneToOne(
    () => Client,
    (client) => client.user,
  )
  client: Client | null;

  // ==========================================================
  // CREATE DATE - DATA DE CRIAÇÃO
  // ==========================================================
  //
  // @CreateDateColumn() define uma coluna especial
  // para armazenar a data e a hora de criação do registro.
  //
  // Quando o TypeORM insere um novo usuário, essa coluna
  // é preenchida automaticamente.
  //
  // Exemplo:
  // 2026-10-21 14:30:00
  //
  // O tipo Date representa uma data no TypeScript.
  //
  // Essa informação pode ser utilizada para:
  // - Consultar quando um usuário foi cadastrado;
  // - Organizar registros por data;
  // - Gerar relatórios.

  @CreateDateColumn()
  created_at: Date;

  // ==========================================================
  // UPDATE DATE - DATA DE ATUALIZAÇÃO
  // ==========================================================
  //
  // @UpdateDateColumn() define uma coluna especial
  // para registrar a data e a hora da última atualização.
  //
  // O TypeORM gerencia essa coluna nas operações
  // de atualização realizadas por ele.
  //
  // Exemplo:
  // Um usuário alterou seu nome ou e-mail.
  //
  // O campo updated_at passa a representar
  // a data dessa atualização.
  //
  // Diferença:
  //
  // created_at -> quando o registro foi criado
  // updated_at -> quando foi atualizado pela última vez

  @UpdateDateColumn()
  updated_at: Date;

  // ==========================================================
  // MÉTODO toJSON() - PROTEÇÃO DOS DADOS SENSÍVEIS
  // ==========================================================
  //
  // Diferentemente dos decorators anteriores,
  // toJSON() é um método da classe User.
  //
  // Ele personaliza como uma instância da entidade
  // será representada quando convertida para JSON.
  //
  // JSON é um formato muito utilizado para enviar
  // e receber dados em APIs REST.
  //
  // Exemplo de resposta:
  //
  // {
  //   "id": 1,
  //   "name": "Maria",
  //   "email": "maria@email.com"
  // }
  //
  // Repare que a senha não aparece na resposta.
  //
  // Omit<User, 'password' | 'toJSON'>
  //
  // Omit é um tipo utilitário do TypeScript.
  //
  // Ele representa o tipo User sem as propriedades
  // password e toJSON no tipo de retorno.
  //
  // Dentro do método, utilizamos desestruturação
  // para separar essas propriedades.
  //
  // O operador ...rest reúne as propriedades restantes.
  //
  // return rest devolve um objeto sem a senha.
  //
  // IMPORTANTE:
  // Omit atua apenas na tipagem do TypeScript.
  // Quem realmente remove a senha do objeto retornado
  // é a desestruturação realizada dentro do método.
  //
  // Esse método é uma proteção adicional.
  // Ele não substitui o uso de DTOs de resposta
  // nem os cuidados com dados sensíveis.

  toJSON(): Omit<User, 'password' | 'toJSON'> {

    // Separa password e toJSON das demais propriedades.
    //
    // Os nomes começam com "_" porque esses valores
    // são extraídos, mas não serão utilizados.
    const {
      password: _password,
      toJSON: _toJSON,
      ...rest
    } = this;

    // Retorna as demais propriedades do usuário,
    // sem incluir password e toJSON.
    return rest;
  }
}

