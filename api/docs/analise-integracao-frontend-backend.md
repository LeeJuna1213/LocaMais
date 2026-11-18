# Análise de integração do frontend e backend — LocaMais

**Escopo:** auditoria somente leitura e planejamento. Nenhum endpoint, schema, dependência ou arquivo de código foi alterado nesta análise.

## 1. Resumo executivo

O frontend é uma aplicação Ionic/Angular standalone com navegação lazy-loaded, componentes próprios, estado local em Angular Signals e dados em memória vindos de funções `seed*`. Ele ainda não configura `HttpClient`, URL da API, interceptor, persistência de sessão ou autorização real. Os guards verificam somente um papel guardado no estado volátil do `AuthService`.

O backend disponibiliza API REST sob `/api`, autenticação JWT Bearer, DTOs validados e regras de acesso por papel e pelo proprietário do recurso. Há incompatibilidade de nomenclatura, tipos e estados nos modelos do frontend. A migração deve introduzir DTOs de transporte próprios e mapeadores, preservando os modelos de apresentação usados pelas telas, em vez de tentar enviar diretamente os modelos atuais à API.

Para fotos, a API existente atende o fluxo: `POST /api/carros/:id/foto`, multipart no campo `foto`, `DELETE /api/carros/:id/foto` e caminho público relativo `/uploads/carros/<uuid>.<ext>`. O cartão reutilizável `app-vehicle-card` é usado nas listas pública e administrativa. A administração atual não possui edição de veículo: o clique na lista leva à tela de revisões/status, portanto será necessária uma rota/tela explícita de edição.

**Primeira etapa recomendada:** estabelecer contratos/adaptadores de autenticação e leitura de veículos, confirmar a URL de execução (browser e Capacitor) e validar login + `GET /api/carros` antes de converter as mutações. Isso testa conectividade, CORS e tradução de enums/propriedades sem acoplar de início os fluxos transacionais.

## 2. Diagnóstico do frontend

### 2.1 Estrutura verificada

- `frontend/src/app/app.routes.ts`: rotas standalone com `loadComponent`, áreas `client`, `admin` e `booking`; `authGuard` e `roleGuard` protegem grupos.
- `frontend/src/app/core/models/index.ts`: modelos de tela `Vehicle`, `Client`, `Reservation`, `Account`, `UserProfile` e filtros; são modelos de apresentação e não refletem os DTOs da API.
- `frontend/src/app/core/data.ts`: `seedVehicles`, `seedClients`, `seedReservations` e `defaultProfile` criam dados fictícios.
- `frontend/src/app/core/services/`: `AuthService`, `VehicleService`, `ReservationService`, `ClientService`, `BookingService`, `PaymentService` e `ToastService`. Os serviços de domínio/auth manipulam Signals locais e não fazem chamadas de rede.
- `frontend/src/app/core/guards/role.guard.ts`: compara o papel contra o estado local do `AuthService` e redireciona; não valida token ou servidor.
- `frontend/src/app/shared/components/`: shell, menu/navegação, cartão de veículo, cartão de reserva, carro SVG, badges e tabs; todos standalone.
- `frontend/src/app/pages/`: login/cadastro, páginas de cliente, telas administrativas e fluxo de booking/pagamento.
- `frontend/src/environments/environment.ts` e `.prod.ts`: somente `production`; não há `apiUrl`.
- `frontend/src/main.ts`: `bootstrapApplication`, `provideRouter`, preloading e `provideIonicAngular`; não registra `provideHttpClient`.

### 2.2 Estado, autenticação e dados simulados

`AuthService.login()` aceita um parâmetro de papel escolhido na tela. Para administrador, qualquer email/senha não vazios definem `admin`; para cliente consulta uma lista `accounts` inicialmente vazia e aceita credenciais desconhecidas, derivando o nome do email. O cadastro chama o `ClientService` local, guarda inclusive a senha em memória no array `accounts`, marca sessão local e renomeia reservas locais. Logout limpa Signals, mas não existe token/session storage.

`VehicleService`, `ReservationService` e `ClientService` inicializam Signals usando seeds e implementam CRUD/status/favoritos/revisões em memória. `BookingService` guarda seleção, datas e local em Signals. `PaymentService` deriva pagamentos das reservas sem persistência/servidor. Os valores computados com `computed()` são adequados como estado derivado, mas as operações assíncronas precisarão refletir estados `loading/error` e atualizar Signals após respostas HTTP.

Não foi encontrada chamada `HttpClient`, `fetch`, `localStorage`, `sessionStorage` ou configuração de interceptor. A aplicação usa `FormsModule`/`ngModel` em formulários, Toast Ionic próprio para feedback e elementos HTML nativos junto com Ionic (`ion-app`, `ion-router-outlet`, `ion-content`, toasts, etc.). Não há biblioteca de formulários reativos ou estado global adicional nas dependências declaradas.

### 2.3 Navegação e permissões atuais

As rotas `admin/*` e `client/*` são condicionadas pelos guards, enquanto `booking/*` exige apenas estar logado. A escolha de cliente/funcionário no login é apresentação, não uma autorização confiável. O frontend deverá derivar papel de `user.type` retornado/validado pelo backend e usar o guard apenas para UX. O backend continuará sendo a autoridade efetiva em cada operação. Há diferença entre o papel de tela `admin` e os tipos reais `admin`, `funcionario`, `cliente`; a UI administrativa hoje é intitulada funcionário, mas o modelo frontend só admite `admin`.

## 3. Diagnóstico do backend

### 3.1 Transporte, validação e erros

- `api/src/app.setup.ts`: `setGlobalPrefix('api')`; `/uploads` é servido estaticamente fora do prefixo; CORS atual é `origin: true, credentials: true`; `ValidationPipe` usa `whitelist`, `forbidNonWhitelisted` e `transform`.
- `api/src/main.ts`: API escuta `PORT` (default 3000); Swagger em `/docs`; documentação menciona Bearer JWT.
- `JwtAuthGuard` é global com exceção para `@Public()`. `RolesGuard` exige papéis declarados com `@Roles`; serviços também aplicam ownership em rotas dependentes do ator.
- Login retorna `{ access_token, expires_in, token_type, user }`; autenticação é `Authorization: Bearer <token>`. `JwtStrategy` reconsulta usuário ativo e papel a cada request. Respostas Nest para erros de validação/autorização seguem HTTP 400/401/403/404/409 conforme exceções; `ValidationPipe` pode retornar `message` como lista.
- As respostas são entidades serializadas por `toJSON()` ou objetos planos; datas são JSON ISO, valores `decimal` podem ser serializados como string ou convertidos em número conforme serializer/service. O frontend deve normalizar explicitamente.

### 3.2 Endpoints confirmados nos controllers

Todos os caminhos abaixo são prefixados por `/api`, salvo `/uploads/...` e `/docs`.

| Domínio | Endpoints e métodos confirmados | Acesso/regra observada |
|---|---|---|io
| Autenticação | `POST /autenticacao/register`, `POST /autenticacao/login`, `GET /autenticacao/me` | register/login públicos; `me` autenticado. Register cria cliente, papel imposto pelo servidor. |
| Usuários | `POST /usuarios`, `GET /usuarios`, `GET /usuarios/:id`, `PATCH /usuarios/:id`, `DELETE /usuarios/:id` | criação/lista/desativação admin; detalhe/update aplicam regra de usuário próprio/admin; DELETE é desativação lógica. |
| Clientes | `POST /clientes`, `GET /clientes`, `GET /clientes/:id`, `PATCH /clientes/:id`, `DELETE /clientes/:id` | criar/listar/editar staff; cliente consulta somente o próprio; DELETE admin e desativa. Auto-cadastro público é em autenticação. |
| Endereços | `POST /enderecos`, `GET /enderecos`, `GET /enderecos/:id`, `PATCH /enderecos/:id`, `DELETE /enderecos/:id` | controller exige admin/funcionário; DELETE documentado como conflito por regra de cadastro obrigatório. Endereço do cliente também é retornado por `me`/usuário. |
| Carros | `POST /carros`, `GET /carros`, `GET /carros/:id`, `PATCH /carros/:id`, `DELETE /carros/:id`, `POST /carros/:id/foto`, `DELETE /carros/:id/foto` | listar/detalhar autenticado; escrita de carro e foto admin/funcionário. `GET /carros` lista todos sem filtros/paginação declarados no controller. |
| Reservas | `POST /reservas`, `GET /reservas`, `GET /reservas/disponibilidade`, `GET /reservas/:id`, `PATCH /reservas/:id/cancelar`, `PATCH /reservas/:id` | usuário vê/cria/cancela segundo ownership; staff vê todas e altera. POST aceita datas ISO + `client_id`/`car_id`; valor/status são do servidor. |
| Locações | `POST /locacoes`, `GET /locacoes`, `GET /locacoes/:id`, `PATCH /locacoes/:id/retirada`, `PATCH /locacoes/:id/devolucao`, `PATCH /locacoes/:id`, `GET /locacoes/:id/adicionais` | operações scoped à reserva do cliente; retirada/devolução/update staff. POST recebe somente `reservation_id`; datas/status/valor são controlados pelo backend. |
| Pagamentos | `POST /pagamentos`, `GET /pagamentos`, `GET /pagamentos/locacao/:locacaoId/saldo`, `GET /pagamentos/locacao/:locacaoId`, `GET /pagamentos/:id`, `PATCH /pagamentos/:id/confirmar`, `GET /pagamentos/:id/comprovante`, `PATCH /pagamentos/:id`, `DELETE /pagamentos/:id` | criação/alterações/confirmar/exclusão staff; leituras autenticadas. Pagamento é simulado; confirmar recebe DTO e status não é definido pelo cliente. |
| Revisões | `POST /revisoes`, `GET /revisoes`, `GET /revisoes/:id`, `GET /revisoes/carro/:carroId`, `GET /revisoes/carro/:carroId/status`, `PATCH /revisoes/:id`, `DELETE /revisoes/:id` | escritas staff; GET autenticado. Atualização restringe campos; revisão altera quilometragem real. |
| Vistorias | `POST /vistorias`, `GET /vistorias`, `GET /vistorias/locacao/:locacaoId`, `GET /vistorias/:id`, `PATCH /vistorias/:id` | acesso à lista/detalhe é filtrado por ator; escrita segue ownership e regra do estado da locação. `fotos` é JSON serializado de strings, não multipart de imagem. |

As rotas com `:id` de carros/clientes/usuários/endereço usam inteiros. Reservas, locações, pagamentos, revisões e vistorias usam UUID conforme pipes/DTOs. Os IDs de reserva do modelo atual frontend são números fictícios e não podem ser preservados como tipo de integração.

### 3.3 Relacionamentos e fluxos de negócio relevantes

Reserva liga cliente e carro por `client_id` e `car_id`; `POST /reservas` recalcula o valor e inicia `pendente`. Reserva confirmada origina no máximo uma locação (`POST /locacoes`); retirada marca locação `em_andamento` e carro `alugado`; devolução conclui locação/reserva e libera carro. Pagamentos apontam para locação; revisões apontam para carro e atualizam odômetro; vistoria aponta para locação, armazenando `fotos` como texto JSON.

O cache Redis permanece interno à API. Os ADRs de cache estão em `docs/adr/ADR-002-estrategia-cache-redis.md` e `docs/adr/ADR-003-politica-consistencia-invalidation-cache-redis.md` na raiz do repositório (não em `api/docs/adr`). O cache híbrido de carro exclui `foto` dos valores Redis; o backend confirma foto no MySQL em HIT e devolve `foto` no JSON HTTP. Não cabe acesso Redis pelo cliente.

## 4. Mapeamento frontend/API e incompatibilidades

| Módulo | Implementação atual no frontend | Endpoints existentes | Adaptações necessárias |
|---|---|---|---|
| Auth/usuários | `AuthService`, `Account`, `UserProfile`; login por papel escolhido, conta em memória, senha armazenada em array local; perfil sintético | `POST /autenticacao/login`, `POST /autenticacao/register`, `GET /autenticacao/me`, `GET/PATCH /usuarios/:id`, `POST/GET/PATCH/DELETE /usuarios` | Enviar `email` e `password`, ignorar escolha de papel como autoridade, guardar `access_token` com decisão de persistência, inicializar sessão chamando `me`, mapear `user.type` para `client/admin` (funcionário e admin), remover armazenamento local de senha. DTO de registro exige `{name,email,password,cliente:{tipo_pessoa,cpf/cnpj,...,endereco:{...}}}`; UI atual coleta telefone e não coleta nascimento/razão social/endereço completo. Senha API mínimo 8. Recuperação de senha é apenas toast e não há endpoint confirmado. |
| Carros | `Vehicle {id,name,version,pricePerDay,status,color,category,transmission,revisions,favorite}` em Signals/seed; filtros locais; criação mock | `GET /carros`, `GET /carros/:id`, `POST /carros`, `PATCH /carros/:id`, `DELETE /carros/:id`, `/carros/:id/foto` | Criar DTO de API + mapper: `name` não é coluna (combinar marca/modelo/ano para apresentação), `version`, `color`, `transmission`, `favorite`, `revisions` não existem em `Carro`; API tem `placa`, `modelo`, `marca`, `categoria`, `ano`, `status`, `valorDiaria`, `quilometragem`, `foto`, datas. Enviar campos reais obrigatórios, manter status/enum em valores wire (`disponivel`, `alugado`, `em manutenção`), exibir `foto`. `GET /carros` não oferece query de filtro: filtrar no cliente inicialmente. |
| Reservas/booking | `Reservation.id` numérico, `start/end`, `clientName`, `vehicleId`, `mine`, `total`, pagamento embutido; mutations locais; `BookingService` escolhe datas/local/método | `GET/POST /reservas`, `GET /reservas/:id`, `GET /reservas/disponibilidade`, `PATCH /reservas/:id/cancelar`, `PATCH /reservas/:id` | UUID string; nomes wire `dataRetirada`, `dataDevolucao`, `client_id`, `car_id`, `valorTotal`; resposta contém objetos `client` e `car`, não `clientName`/`vehicleId` como contrato primário. ISO com data e hora (não apenas YYYY-MM-DD). API cria PENDENTE, calcula total; UI declara confirmada e pagamento pago imediatamente. Cancelar usa subrota, não PATCH status `cancelada`. Pagamento não é parte da reserva. Disponibilidade aceita parâmetros exatos do `ConsultarDisponibilidadeDto`, verificar antes de planejar envio. |
| Clientes | `Client {id,name,type,status,document,email,phone}` seed; create/update/status locais | `POST/GET /clientes`, `GET/PATCH/DELETE /clientes/:id`; auto-registro auth/register | API separa pessoa `cliente` de `user`; nome/email/type estão em `user.name/email/type`; pessoa contém `tipo_pessoa`, `cpf` ou `cnpj`, nascimento ou razão social e `address`. UI combina tudo em uma interface. `type: PF/PJ` corresponde a `tipo_pessoa`, mas status é `user.active` boolean, não string Ativo/Inativo. O DTO de update de cliente não atualiza nome/email/telefone; esses campos pertencem ao usuário. `PATCH /clientes` recebe apenas dados cadastrais. |
| Endereços | Campos simplificados no `UserProfile` (`street`, `city`), sem model dedicado | `GET/POST/PATCH /enderecos/:id` e listagem; endereço aninhado em registro e `me` | Wire usa `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `cep`, `pais`, `client_id`; front não coleta vários campos. Criação de cliente/registro aceita endereço aninhado; endpoint isolado é staff e `DELETE` não é operação funcional. |
| Locações | Não há model/service de locação explícito; telas de retirada/devolução alteram `ReservationService` local | `POST/GET /locacoes`, `GET /locacoes/:id`, `PATCH .../retirada`, `PATCH .../devolucao`, `PATCH /locacoes/:id`, adicionais | Adicionar domínio/model UUID independente de reserva. Implementar fluxo de reserva confirmada → locação; UI simula datas e status na reserva. Totais/adicionais e status são controlados pelo servidor. |
| Pagamentos | `PaymentService` calcula status a partir de `Reservation.payment`; enum humanizado; `receive()` só altera Signal | `POST/GET /pagamentos`, leitura por UUID/locação e saldo, confirmar, comprovante, PATCH/DELETE | Pagamento é entidade por UUID e ligada à locação; `metodo` usa `pix`, `cartao_credito`, `cartao_debito`, `dinheiro`; status inclui `pendente/aprovado/recusado/cancelado`. UI inclui `Cartão de crédito/débito` e `Pago/Pendente`, e marca pagamento no ato de criar reserva. Confirmar exige operação separada; não há evidência de gateway real. |
| Revisões | `Vehicle.revisions` inline, data/km string/descrição; registro local exige descrição e aceita km textual | `POST/GET /revisoes`, consultas por carro/status, PATCH/DELETE | Entidade própria com UUID, `data`, `descricao`, `km` inteiro, `valor`, `carro_id`; criação recebe `carroId` e servidor atualiza odômetro. Campos data/km são wire ISO e número, custo obrigatório; status periódico é outro endpoint. Não existe `transmission`/status de carro no histórico. |
| Vistorias | Nenhum model ou service dedicado encontrado; telas de retirada/devolução do frontend não correspondem ao registro de vistoria | `POST/GET /vistorias`, consulta por UUID/locação, PATCH | Criar model/service e mapear `tipo` (`retirada/devolucao`), `observacoes`, `fotos` como string JSON array e `locacaoId` UUID; servidor define `data`. Não confundir as fotos de vistoria (referências JSON) com foto principal do carro (upload multipart). |
| Relatórios | `ReportsPage` agrega dados dos Signals seeds | Não foi encontrado endpoint de relatórios nos controllers auditados | Agregar dados dos endpoints existentes no cliente, ou definir posteriormente requisito para endpoint; não presumir relatório server-side. |

### 4.1 Convenções para mapeadores

Manter separados os tipos wire (`CarroApi`, `ReservaApi`, etc.) dos modelos de tela existentes. Mapeadores devem: traduzir nomes snake_case/camelCase; transformar IDs UUID sem conversão numérica; normalizar `decimal` para `number` quando usado em cálculo/apresentação; preservar datas ISO/timezone; mapear enums minúsculos para rótulos amigáveis e vice-versa; resolver campos derivados de apresentação (p.ex. nome/título do carro) sem enviá-los como campos não aceitos. Como o ValidationPipe rejeita propriedades extras, enviar exatamente os DTOs do backend.

## 5. Arquitetura de comunicação recomendada

1. **Configuração:** adicionar `apiUrl` a `environment.ts`/`environment.prod.ts`, consumida por um `ApiUrl`/token de configuração ou diretamente por uma camada `ApiClient`. Em browser local, URL compatível com host/porta da API; em Capacitor, não assumir `localhost` do dispositivo. Configurar endereço de produção no ambiente de build, sem segredo.
2. **HttpClient:** registrar `provideHttpClient(withInterceptors([...]))` no bootstrap standalone existente (`main.ts`). Não há necessidade de trocar para NgModules.
3. **Autenticação:** `AuthService` chama login/register/me; representa `user` e papel real com Signals. Guard hidrata sessão e distingue anon/cliente/staff. Requisição protegida inclui Bearer via interceptor funcional. Armazenamento do token requer decisão explícita: em browser acadêmico, `sessionStorage` reduz persistência entre sessões, mas não elimina risco XSS; Capacitor requer estratégia compatível e revisão dos plugins já instalados. Não persistir senha. Backend atualmente não aparenta usar cookie HttpOnly.
4. **Serviços por domínio:** adaptar `VehicleService` primeiro e depois `ClientService`, `ReservationService`, `LocacaoService`, `PagamentoService`, `RevisaoService`, `VistoriaService`, `EnderecoService` e gerenciamento de usuários. Services mantêm Signals/read models e chamam clients HTTP tipados; remover seeds só após cada fluxo ter equivalência validada.
5. **Tratamento transversal:** interceptor/handler central traduz status 400 (mensagens de DTO), 401 (limpar sessão e redirecionar), 403 (sem acesso), 404 e 409; erros de rede permanecem identificáveis. A UI deve ter estados loading/empty/error e ToastService pode continuar para feedback de ações.
6. **Formulários:** as páginas usam `ngModel`; podem ser preservadas. Validar campos obrigatórios e formatar datas na borda. API `whitelist + forbidNonWhitelisted` torna incompatibilidade de payload explícita (400).
7. **Redis/cache:** nenhuma chamada Redis no frontend. Consumir as rotas HTTP; consistência híbrida de foto e invalidação continuam internas ao backend conforme ADR-002/003.

## 6. Integração e melhoria de fotos

### 6.1 Contrato existente

- Upload/substituição: `POST /api/carros/:id/foto`, content type `multipart/form-data`, chave multipart **`foto`**, uma imagem, máximo **5 MiB** (5 × 1024 × 1024 bytes). O servidor aceita `.jpg`, `.jpeg`, `.png`, `.webp`, MIME correspondente e valida assinatura do conteúdo.
- Remoção: `DELETE /api/carros/:id/foto`; resposta contém carro com `foto: null`.
- Permissão: ambas exigem JWT e papel admin ou funcionário. Frontend deve ocultar/desabilitar affordance para cliente, mas a API é a barreira de segurança.
- A resposta do carro contém `foto: string | null`, exemplo `/uploads/carros/<UUID>.<extensão>`. A imagem é pública em `/uploads/...`, fora do prefixo `/api`, no mesmo host/porta do backend.
- Upload deve usar `FormData` com `foto` contendo `File`; não definir manualmente `Content-Type` multipart, para o browser preencher boundary. O serviço de carros cria primeiro (`POST /api/carros`) e, com o ID retornado, faz upload; são duas operações HTTP, portanto se o upload falhar o carro continuará criado e a UI deve permitir retry.
- Preview local: `URL.createObjectURL(file)` com revogação ao trocar/cancelar/destruir. Validar tamanho, extensão e MIME no cliente para UX; servidor continua autoridade. Mostrar erro e manter a imagem anterior até sucesso ao substituir.

### 6.2 Uso das imagens nas telas

`VehicleCardComponent` (`shared/components/vehicle-card.component.ts`) é reutilizado em `client/vehicle-list.page.ts` e `admin/admin-vehicles.page.ts`; hoje mostra somente o SVG `CarComponent`. Priorizar esse cartão para exibir `<img>` com `object-fit: cover`, dimensões/aspect ratio fixos, lazy loading e placeholder (o SVG existente pode continuar como fallback). Evitar Base64 ou pré-carregar todos os arquivos. O `Vehicle` de tela precisará de `foto` e de URL absoluta resolvida a partir de `apiUrl` (ou helper central); caminho relativo `/uploads/...` sozinho apontaria para a origem do frontend.

Outras telas que exibem veículo e devem ser avaliadas/adaptadas para foto: `booking/vehicle-details.page.ts`, `booking/confirm-reservation.page.ts`, `booking/reservation-form.page.ts`, `booking/reservation-success.page.ts`, `client/reservation-details.page.ts`, `admin/vehicle-revisions.page.ts`, `admin/register-pickup.page.ts`, `admin/register-return.page.ts` e listas de reserva/retirada/devolução via `ReservationCardComponent`. Relatórios e dashboard exibem dados textuais/contadores, não precisam da imagem inicialmente. Nem todas as respostas aninhadas trazem necessariamente o mesmo formato; usar `car` aninhado quando disponível, ou carregar o veículo por ID sem fazer requisições individuais repetidas.

### 6.3 Administração e edição

`admin-vehicles.page.ts` lista veículos e o clique abre `/admin/veiculos/:id/revisoes`; não existe tela de edição do cadastro, e a rota existente `veiculos/novo` só coleta modelo/versão/categoria/câmbio/diária. No escopo futuro, criar formulário de edição e entrada explícita para editar cadastro/foto sem substituir a tela de revisões. Cadastro de carro exige também placa, marca, modelo, categoria, ano e diária; status pode ser omitido e entra como disponível. Os campos fictícios `version`, `transmission` e `color` não são aceitos pelo DTO. Avaliar confirmação da experiência quando foto for enviada depois da criação, já que a API não recebe multipart junto com `POST /carros`.

## 7. Plano de implementação incremental

Os nomes abaixo são previsão de arquivos; manter o padrão existente e evitar abstrações além dos mapeadores/clientes necessários.

| Etapa | Objetivo e arquivos previstos | Endpoints | Dependências | Testes, riscos e cuidados |
|---|---|---|---|---|
| 0. Contratos/decisões | Documentar mapeamentos wire→view; confirmar URLs de browser/Capacitor, política de token e campos cadastrais/perfil que a UI deve pedir. Sem arquivo de código requerido; decisão pode complementar este documento. | Nenhum | Nenhuma | Revisar Swagger/DTOs; maior risco é assumir que telefone, favoritos, câmbio, cor ou recuperação de senha são persistidos — não são contratos atuais. |
| 1. Fundação HTTP e sessão | Modificar `frontend/src/main.ts`, environments, `core/services/auth.service.ts`, `core/guards/role.guard.ts`; criar interceptor e api/error service e modelos de auth; adaptar login e registro. | `POST /autenticacao/login`, `/register`; `GET /autenticacao/me` | Etapa 0 | Testes de interceptor (Bearer, URLs públicas), login inválido, reload/hidratação, logout/401, registro PF/PJ. Não enviar papel no registro; tratar JWT e storage como credencial. |
| 2. Carros e imagens | Adaptar `core/models/index.ts`, `vehicle.service.ts`; criar DTO/mappers e API service; modificar `admin/new-vehicle.page.ts`, criar edit page/rota, `admin/admin-vehicles.page.ts`, `shared/components/vehicle-card.component.ts`, `shared/components/car.component.ts` (fallback), possivelmente detalhes/booking pages e `global.scss`. | `GET /carros`, `GET /carros/:id`, `POST /carros`, `PATCH /carros/:id`, `POST/DELETE /carros/:id/foto` | Etapa 1 para endpoints protegidos; pode separar leitura pública depois que auth definida | Testar mapping, estados/listagem, create seguido de upload, preview/revogação, validação 5 MiB/extensões/MIME, falha upload com carro já criado, substituição/remoção e URL estática. Garantir autorização staff no backend; imagens lazy e layout responsivo. |
| 3. Cadastro de clientes e perfil | Adaptar `client.service.ts`, models e páginas `register.page.ts`, `clients.page.ts`, `client-edit.page.ts`, `profile*.page.ts`; tratar endereço como parte do contrato e atualizar usuário vs cliente nos serviços corretos. | `/autenticacao/register`, `/autenticacao/me`, `/clientes`, `/clientes/:id`, `/usuarios/:id`, `/enderecos/:id` | Etapa 1 | Testar PF/PJ, endereço obrigatório, dados não editáveis pelo DTO, 403/404 e estado ativo. Não prometer operações ausentes (ex. reset senha). |
| 4. Reservas e disponibilidade | Adaptar `reservation.service.ts`, `booking.service.ts`, models, `vehicle-list.page.ts`, fluxo `booking/*`, minhas reservas e páginas admin de reservas. | `GET/POST /reservas`, `GET /reservas/:id`, `/disponibilidade`, `PATCH /reservas/:id/cancelar`, `PATCH /reservas/:id` | Etapas 1–2; etapa 3 para resolução de client_id próprio ou seleção staff | Testar UUID, períodos ISO timezone, total calculado pelo servidor, disponibilidade/conflict 409, autorização ownership e transições de status. Desacoplar pagamentos do objeto reserva. |
| 5. Locações, retirada/devolução e vistorias | Criar models/services HTTP para locação/vistoria; adaptar telas `pickup-list`, `return-list`, `register-pickup`, `register-return`, reservation details e fluxo de vistoria/inspeção caso requerido. | `/locacoes`, `/:id`, `/:id/retirada`, `/:id/devolucao`, `/:id/adicionais`; `/vistorias`, `/locacao/:id`, `/:id` | Etapa 4: precisa de reserva confirmada e UUID real | Testar transições, datas null/ISO, custo adicional, estados do carro/reserva e JSON `fotos` de vistoria. A UI atual chama retirada/devolução em reserva, mas o backend executa sobre locação. |
| 6. Pagamentos | Criar/adaptar `payment.service.ts`, model e páginas `payment.page.ts`/`admin-payments.page.ts`; separar pagamento de reserva e locação. | `/pagamentos`, `/locacao/:locacaoId`, `/saldo`, `/:id/confirmar`, `/:id/comprovante`, `PATCH/DELETE /:id` | Etapas 4–5 | Testar enums em wire, saldo, pendência, confirmação, conflito/duplicidade e comprovante simulado. Não transmitir nem armazenar dados de cartão: gateway real não foi identificado. |
| 7. Revisões, relatórios e hardening | Criar serviço/model de revisão, trocar array inline; revisar relatório, loading/error states e permissões/navigation. | `/revisoes`, `/carro/:carroId`, `/status`, PATCH/DELETE | Etapa 2; relatórios usam dados reais disponíveis | Testar atualização de odômetro, status de revisão, transições e agregados. Definir se relatórios client-side suportam volumes reais. |

Cada etapa preserva inicialmente as telas e componentes, trocando a fonte do service e mapeando DTOs. Recomenda-se não remover `data.ts` até que todas as rotas dependentes estejam migradas e os testes/execução manual estejam validados; depois removê-lo apenas se não houver uso.

## 8. Segurança, operação e compatibilidade

- **CORS:** backend reflete `origin` com credenciais habilitadas; para deploy, restringir a origens conhecidas. Frontend não deve embutir DB password, `JWT_SECRET` nem segredo de API.
- **Autorização:** token obrigatório em quase todos os endpoints. O front deve anexá-lo, mas nunca considerar guards Angular uma barreira de segurança. Papéis reais diferenciam `admin`, `funcionario` e `cliente`.
- **URL/API:** sem proxy ou URL base no frontend atualmente. `/api` é prefixo para controllers; imagens usam `/uploads`, mesma origem do backend. Em browser/Ionic WebView, CORS e URL de host devem ser conferidos; em device `localhost` normalmente aponta para o próprio device.
- **Fotos:** arquivo público, UUID não é autorização; não colocar dados sensíveis em imagem/URL. O limite servidor é 5 MiB e valida extensão, MIME e magic bytes.
- **Compatibilidade:** versões declaradas: Angular 22.1.7 (CLI/build 22.1.8), Ionic Angular ^9.0.0, RxJS ~7.8, TypeScript ~6.0, Capacitor 8. Não há dependência extra necessária para `HttpClient` ou interceptor funcional: usar Angular Common/standalone providers existentes.
- **Erros:** mostrar feedback não destrutivo, manter formulário quando falhar, distinguir erro de rede/validação/autorização/conflito e impedir cliques duplicados durante escrita.
- **DTO estrito:** `forbidNonWhitelisted` rejeita modelos de UI com propriedades extras. Enviar payload explícito por DTO e não serializar objetos da tela inteiros.

## 9. Decisões pendentes para aprovação

1. Em que origens serão executados frontend browser e app Capacitor em dev/produção, e qual base URL deverá ser usada em cada build?
2. Token JWT deve persistir em sessão/browser reload? Qual estratégia desejada para Web e Capacitor, dado o modelo atual Bearer sem cookie HttpOnly?
3. Cadastro público deverá coletar endereço completo e dados PF/PJ exigidos? O campo telefone atual não existe no DTO de cliente/usuário verificado.
4. Favoritos, câmbio, cor, versão, descrição comercial e recuperação de senha são apenas dados locais/apresentacionais ou há requisito de persistência ainda não implementado no backend?
5. A etapa administrativa de cadastro deve criar primeiro o carro e depois fazer upload, aceitando retry se o upload falhar, conforme os endpoints atuais?
6. As fotos de vistoria devem continuar sendo URLs/caminhos JSON, ou há necessidade distinta de upload dedicado? O controller atual não implementa upload multipart para vistorias.
7. Relatórios devem ser agregações simples no cliente ou existe volume/requisito que justifique endpoint próprio futuramente?
8. Confirmar que a documentação de cache está na raiz `docs/adr`; no checkout auditado, `api/docs` contém documentos de regras e não contém a pasta `adr` mencionada no contexto.

## 10. Arquivos de referência inspecionados

Frontend: `frontend/package.json`, `angular.json`, `ionic.config.json`, `tsconfig*.json`, `src/main.ts`, `src/environments/*`, `src/app/app.routes.ts`, `core/models/index.ts`, `core/data.ts`, `core/services/*`, `core/guards/role.guard.ts`, páginas auth/client/admin/booking, componentes compartilhados e `src/global.scss`.

Backend: controllers, DTOs, entities, enums, `api/src/app.setup.ts`, `api/src/main.ts`, guards JWT/roles, storage/controller/service de carro, além dos ADRs 002 e 003 em `docs/adr` na raiz.
