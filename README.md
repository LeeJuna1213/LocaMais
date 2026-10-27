# LocaMais

API backend de uma locadora de veículos, construída com **NestJS** e **TypeORM**. O projeto tem finalidade acadêmica: demonstrar, de forma organizada, autenticação JWT, autorização por papéis, validação de dados, relacionamentos 1:1 e separação de responsabilidades por módulos.

> Este repositório contém o backend em `api/`. O frontend existe em `front/`, mas não faz parte do escopo desta documentação.

---

## 1. Funcionalidades implementadas

- Autenticação com e-mail e senha, senha armazenada como hash bcrypt.
- Emissão e validação de access token JWT.
- Autorização por papéis: `admin`, `funcionario` e `cliente`.
- Auto-cadastro público de cliente (`POST /api/auth/register`).
- CRUD de usuários com regras de permissão.
- Cadastro completo de cliente (usuário + cliente PF/PJ + endereço) em transação.
- Validação de CPF/CNPJ (dígitos verificadores) e coerência PF/PJ.
- Consulta, atualização e desativação lógica de clientes.
- Consulta e atualização de endereço vinculado ao cliente.
- CRUD de veículos com validação de placa e status.
- Documentação interativa com Swagger.
- Banco configurável por ambiente: SQLite (padrão em desenvolvimento) ou MySQL.

### O que ainda não existe

- Módulo de reservas/locações.
- Migrações formais do TypeORM (o projeto usa `synchronize` configurável).
- Refresh token, revogação de token ou lista de bloqueio.
- Upload de documentos/fotos de veículos.
- Testes de integração cobrindo todos os endpoints (a suíte atual é mínima).

---

## 2. Tecnologias e versões relevantes

Versões declaradas em `api/package.json`:

| Tecnologia | Versão |
|---|---|
| NestJS (`@nestjs/common`, `@nestjs/core`) | `^12.0.1` |
| TypeScript | `^6.0.2` |
| TypeORM | `^1.1.2` |
| `@nestjs/typeorm` | `^12.0.2` |
| `@nestjs/jwt` / `@nestjs/passport` | `^12.0.3` / `^12.0.0` |
| `@nestjs/swagger` | `^12.0.2` |
| `class-validator` / `class-transformer` | `^0.15.1` / `^0.5.1` |
| `bcrypt` | `^6.0.0` |
| `better-sqlite3` | `^12.11.1` |
| `mysql2` | `^3.24.6` |
| Vitest | `^4.1.2` |
| oxlint | `^1.58.0` |

O projeto usa **ESM** (`"type": "module"` no `package.json`) e `moduleResolution: "nodenext"`. Por isso os imports relativos em TypeScript usam a extensão `.js` (ex.: `import { User } from './user.entity.js'`), mesmo que o arquivo-fonte seja `.ts`. Isso é intencional e exigido pelo Node ESM.

---

## 3. Pré-requisitos

- **Node.js** compatível com NestJS 12 e TypeScript 6 (recomenda-se Node 22 ou superior).
- **npm** (o repositório possui `package-lock.json`).
- **MySQL 8** apenas se `DATABASE_TYPE=mysql`. Para desenvolvimento, o SQLite embutido (`better-sqlite3`) não exige servidor.

---

## 4. Estrutura de pastas

```text
locaMais/
├── api/
│   ├── src/
│   │   ├── address/            # Endereço do cliente
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   ├── address.controller.ts
│   │   │   ├── address.module.ts
│   │   │   └── address.service.ts
│   │   ├── auth/               # Login, registro, JWT e estratégia Passport
│   │   │   ├── dto/
│   │   │   ├── strategies/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.service.ts
│   │   │   └── jwt.settings.ts
│   │   ├── car/                # CRUD de veículos
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   ├── enums/
│   │   │   ├── car.controller.ts
│   │   │   ├── car.module.ts
│   │   │   └── car.service.ts
│   │   ├── client/             # Dados PF/PJ do cliente
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   ├── client.controller.ts
│   │   │   ├── client.module.ts
│   │   │   └── client.service.ts
│   │   ├── common/             # Decorators, guards, validadores e utilitários
│   │   ├── config/             # Opções do TypeORM lidas do ambiente
│   │   ├── database/           # Módulo de banco e seed do primeiro admin
│   │   ├── user/               # Usuário, enums, validadores e regras gerais
│   │   ├── app.module.ts
│   │   ├── app.setup.ts
│   │   └── main.ts
│   ├── test/                   # Configuração e testes e2e (Vitest)
│   ├── .env.example
│   ├── nest-cli.json
│   ├── package.json
│   ├── tsconfig.json
│   └── tsconfig.build.json
├── front/
├── .gitignore
└── README.md
```

### Responsabilidade de cada módulo

- **user**: dono da entidade `User`, do enum de papéis, dos validadores de cadastro e das regras de criação/atualização/desativação de usuários. Registra os repositórios de `User`, `Client` e `Address` e os reexporta.
- **client**: dono da entidade `Client` e dos DTOs PF/PJ. Expõe rotas específicas de cliente e delega a criação transacional ao `UserService`.
- **address**: dono da entidade `Address`. Expõe consulta/criação/atualização do endereço de um cliente existente.
- **auth**: login, auto-cadastro público, emissão de JWT, `JwtStrategy` e configuração do segredo.
- **car**: CRUD de veículos e regra de remoção apenas de veículos disponíveis.
- **common**: decorators (`@Public`, `@Roles`, `@CurrentUser`), guards globais, validação de CPF/CNPJ e normalização de dados.
- **config/database**: monta as opções do TypeORM a partir de variáveis de ambiente.
- **database**: aplica o seed idempotente do primeiro administrador quando ainda não existe admin.

### Relacionamentos

```text
User 1 ──── 1 Client 1 ──── 1 Address
```

- A chave estrangeira de `Client` é `user_id` (única, com `ON DELETE CASCADE`).
- A chave estrangeira de `Address` é `client_id` (única, com `ON DELETE CASCADE`).
- Funcionários e administradores existem apenas em `users`; não possuem `Client` nem `Address`.
- A aplicação faz **desativação lógica** de usuários (`active = false`), preservando cliente, endereço e histórico.

---

## 5. Como clonar o repositório

```bash
git clone <URL_DO_REPOSITORIO>
cd locaMais
```

---

## 6. Instalar dependências

```bash
cd api
npm install
```

O `package-lock.json` está versionado; prefira `npm ci` em ambientes de CI.

---

## 7. Configurar variáveis de ambiente

Copie o arquivo de exemplo e ajuste os valores:

**PowerShell (Windows):**

```powershell
Copy-Item .env.example .env
```

**Bash (Linux/macOS):**

```bash
cp .env.example .env
```

Variáveis usadas pelo projeto:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_TYPE` | não | `sqlite` (padrão) ou `mysql`. |
| `DATABASE_FILE` | não | Caminho do banco SQLite. Padrão `./data/locadora.sqlite`. Use `:memory:` para testes. |
| `DATABASE_HOST` | MySQL | Host do MySQL. Padrão `localhost`. |
| `DATABASE_PORT` | MySQL | Porta do MySQL. Padrão `3306`. |
| `DATABASE_USERNAME` | MySQL | Usuário do MySQL. |
| `DATABASE_PASSWORD` | MySQL | Senha do MySQL. |
| `DATABASE_NAME` | MySQL | Nome do banco. |
| `DATABASE_SYNCHRONIZE` | não | `true` cria/atualiza tabelas no boot. Use `false` em produção com migrações. |
| `DATABASE_LOGGING` | não | `true` mostra as queries do TypeORM. |
| `JWT_SECRET` | **sim** | Segredo usado para assinar/validar os tokens. Use um valor forte e aleatório. |
| `JWT_EXPIRES_IN` | não | Validade do access token. Padrão `1h`. |
| `BCRYPT_ROUNDS` | não | Custo do bcrypt. Padrão `10`; `4` acelera testes. |
| `ADMIN_NAME` | não | Nome do admin inicial. |
| `ADMIN_EMAIL` | não | E-mail do admin inicial. Sem ele, o seed não roda. |
| `ADMIN_PASSWORD` | não | Senha do admin inicial. Sem ela, o seed não roda. |
| `OBSERVE_APP_KEY` | não | Chave do NestJS Observe. Vazio desativa o envio. |
| `OBSERVE_APP_SECRET` | não | Segredo do NestJS Observe. |
| `OBSERVE_SERVICE_ID` | não | Identificador do serviço no Observe. Padrão `api`. |
| `PORT` | não | Porta HTTP. Padrão `3000`. |

> Nunca versione o `.env` real. O `.gitignore` já ignora `.env` e `.env.*`, mantendo apenas `.env.example`.

---

## 8. Criar e configurar o banco de dados

### SQLite (desenvolvimento)

Nada a instalar. Com `DATABASE_TYPE=sqlite`, o arquivo é criado automaticamente em `api/data/locadora.sqlite` (ou no caminho de `DATABASE_FILE`). O diretório é criado pelo `buildTypeOrmOptions`.

### MySQL

1. Crie o banco:

```sql
CREATE DATABASE locadora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Configure no `.env`:

```dotenv
DATABASE_TYPE=mysql
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USERNAME=root
DATABASE_PASSWORD=sua-senha
DATABASE_NAME=locadora
DATABASE_SYNCHRONIZE=true
```

Em produção, use `DATABASE_SYNCHRONIZE=false` e aplique migrações versionadas (ainda não incluídas neste repositório).

---

## 9. Executar em desenvolvimento

```bash
cd api
npm run start:dev
```

A API sobe em `http://localhost:3000/api`.

---

## 10. Build e execução em produção

```bash
cd api
npm run build
npm run start:prod
```

- `npm run build` usa `nest build` e grava o resultado em `api/dist/`.
- `npm run start:prod` executa `node dist/main.js`.
- `npm run typecheck` roda `tsc -p tsconfig.build.json --noEmit` sem gerar arquivos.

---

## 11. Executar os testes e verificações

```bash
cd api

npm test              # testes unitários (Vitest)
npm run test:e2e      # testes e2e (Vitest + SQLite em memória)
npm run test:cov      # cobertura
npm run lint          # oxlint com verificação de tipos
npm run typecheck     # checagem de tipos do build
```

Os testes e2e usam `DATABASE_FILE=:memory:` e `BCRYPT_ROUNDS=4`, configurados em `test/setup.ts` / `test/helpers.ts`.

---

## 12. Swagger

Com a aplicação em execução:

```text
http://localhost:3000/docs
```

Use o botão **Authorize** e informe o access token retornado por `POST /api/auth/login` no formato `Bearer <token>`.

---

## 13. Principais endpoints

Prefixo global: `/api`.

### Públicos

| Método | Rota | Finalidade |
|---|---|---|
| `GET` | `/api` | Health check simples (`Hello World!`). |
| `POST` | `/api/auth/register` | Auto-cadastro de cliente (força `type=cliente`). |
| `POST` | `/api/auth/login` | Autentica e retorna access token JWT. |

### Autenticados

| Método | Rota | Papéis | Finalidade |
|---|---|---|---|
| `GET` | `/api/auth/me` | qualquer | Dados do usuário autenticado. |
| `POST` | `/api/users` | admin, funcionario | Cria usuário (funcionario só cria cliente). |
| `GET` | `/api/users` | admin | Lista usuários. |
| `GET` | `/api/users/clients` | admin, funcionario | Lista apenas clientes. |
| `GET` | `/api/users/:id` | qualquer (cliente só o próprio) | Detalha usuário. |
| `PATCH` | `/api/users/:id` | admin ou o próprio | Atualiza dados; `active` só admin. |
| `DELETE` | `/api/users/:id` | admin | **Desativa** o usuário (não apaga). |
| `POST` | `/api/clients` | admin, funcionario | Cria conta completa de cliente. |
| `GET` | `/api/clients` | admin, funcionario | Lista clientes. |
| `GET` | `/api/clients/:id` | qualquer (cliente só o próprio) | Detalha cliente. |
| `PATCH` | `/api/clients/:id` | admin, funcionario | Atualiza dados PF/PJ. |
| `DELETE` | `/api/clients/:id` | admin | **Desativa** o usuário do cliente. |
| `POST` | `/api/addresses` | admin, funcionario | Cria endereço para cliente existente. |
| `GET` | `/api/addresses` | admin, funcionario | Lista endereços. |
| `GET` | `/api/addresses/:id` | admin, funcionario | Detalha endereço. |
| `PATCH` | `/api/addresses/:id` | admin, funcionario | Atualiza endereço. |
| `DELETE` | `/api/addresses/:id` | admin, funcionario | Retorna `409`: endereço não pode ser apagado. |
| `POST` | `/api/cars` | admin, funcionario | Cadastra veículo. |
| `GET` | `/api/cars` | qualquer autenticado | Lista veículos. |
| `GET` | `/api/cars/:id` | qualquer autenticado | Detalha veículo. |
| `PATCH` | `/api/cars/:id` | admin, funcionario | Atualiza veículo. |
| `DELETE` | `/api/cars/:id` | admin, funcionario | Remove apenas veículo `disponivel`. |

---

## 14. Exemplos de requisições

### 14.1 Auto-cadastro de cliente PF

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Maria Silva",
    "email": "maria@exemplo.com",
    "password": "senha-secreta",
    "cliente": {
      "tipo_pessoa": "PF",
      "cpf": "52998224725",
      "data_nascimento": "1990-05-10",
      "endereco": {
        "logradouro": "Rua das Flores",
        "numero": "123",
        "bairro": "Centro",
        "cidade": "Sao Paulo",
        "uf": "SP",
        "cep": "01001000"
      }
    }
  }'
```

### 14.2 Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@exemplo.com","password":"senha-secreta"}'
```

A resposta contém `access_token`. Envie-o nas rotas protegidas:

```text
Authorization: Bearer <access_token>
```

### 14.3 Cadastrar veículo

```bash
curl -X POST http://localhost:3000/api/cars \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "placa": "ABC1D23",
    "modelo": "Onix",
    "marca": "Chevrolet",
    "categoria": "Hatch",
    "ano": 2024,
    "valorDiaria": 120.50
  }'
```

### 14.4 Criar endereço para um cliente existente

```bash
curl -X POST http://localhost:3000/api/addresses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "client_id": 1,
    "logradouro": "Rua das Flores",
    "numero": "123",
    "bairro": "Centro",
    "cidade": "Sao Paulo",
    "uf": "SP",
    "cep": "01001000"
  }'
```

### 14.5 Desativar usuário

```bash
curl -X DELETE http://localhost:3000/api/users/2 \
  -H "Authorization: Bearer <admin_token>"
```

Retorna `204 No Content`. O registro permanece no banco com `active=false`.

---

## 15. Segurança e decisões de arquitetura

- **Default deny**: `JwtAuthGuard` é global; apenas rotas com `@Public()` dispensam token.
- **Senhas**: bcrypt com custo configurável; `password` tem `select: false` e é removida pelo `toJSON()` da entidade.
- **Login sem enumeração de e-mails**: e-mail inexistente e senha errada retornam a mesma mensagem, e a comparação usa um hash fixo para reduzir diferença de tempo.
- **Validação global**: `whitelist`, `forbidNonWhitelisted` e `transform` rejeitam campos não declarados nos DTOs.
- **Desativação lógica**: `DELETE /users/:id` e `DELETE /clients/:id` não apagam dados; marcam `active=false`.
- **Endereço obrigatório**: o cadastro de cliente exige endereço; por isso o endereço não pode ser removido isoladamente (`409`).
- **Repositórios**: `UserModule` registra `User`, `Client` e `Address` e reexporta o `TypeOrmModule`; `ClientModule` e `AddressModule` importam `UserModule`, evitando duplicação de entidades e dependências circulares.
- **Segredos**: `JWT_SECRET`, credenciais de banco e chaves do Observe vêm do ambiente. Não há credenciais reais no código.
- **`synchronize`**: conveniente em desenvolvimento, mas deve ser `false` em produção com migrações.

---

## 16. Problemas conhecidos e pendências

1. **Sem migrações**: o esquema é criado por `synchronize`. Antes de produção, gere migrações e desligue `synchronize`.
2. **Reservas/locações ausentes**: não há controle de disponibilidade por período nem histórico de locações.
3. **Remoção de veículo é física**: permitida apenas para veículos `disponivel`. Quando existir histórico de locações, avaliar desativação lógica também para veículos.
4. **Cobertura de testes parcial**: há testes unitários de `UserController`/`UserService` e e2e do health check + fluxo principal (registro, login, papéis, cliente PF/PJ, endereço e veículo). Cenários de erro menos comuns e os demais módulos ainda não têm cobertura dedicada.
5. **JWT sem revogação**: um token válido continua válido até expirar; a desativação do usuário é verificada a cada requisição pelo `JwtStrategy`.
6. **Frontend**: o diretório `front/` existe, mas não está documentado nem integrado por esta API além do CORS habilitado.
7. **Observe opcional**: sem `OBSERVE_APP_KEY`/`OBSERVE_APP_SECRET`, nenhuma telemetria é enviada.
8. **CORS amplo**: `origin: true` reflete qualquer origem e permite credenciais. É conveniente para desenvolvimento e WebView/Capacitor, mas deve ser restringido por ambiente antes de produção.
9. **Sem rate limiting/helmet**: não há limite de tentativas de login nem cabeçalhos de segurança HTTP configurados; avaliar `@nestjs/throttler` e `helmet` em produção.

---

## 17. Revisar e versionar as alterações

O projeto foi preparado, mas **nenhum commit ou push foi feito automaticamente**. Para revisar:

```bash
cd locaMais
git status
git diff --stat
git diff
```

Para verificar o que seria versionado:

```bash
git status --short
```

Depois de revisar, os comandos de commit ficam a seu critério, por exemplo:

```bash
git add api/src api/test api/package.json api/package-lock.json api/.env.example api/.gitignore README.md .gitignore
git commit -m "chore: organiza módulos, padroniza TypeScript e documenta a API"
```

> Não foram executados `git reset --hard`, `git clean -fd`, `git checkout` destrutivo, commit ou push.
