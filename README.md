# LocaMais

Aplicação acadêmica de gestão de locação de veículos. O LocaMais reúne uma interface mobile-first em Ionic/Angular, uma API NestJS e persistência em MySQL, com Redis/Memurai usado como cache. A aplicação também integra Capacitor para preparar a execução nativa em dispositivos móveis.

> **Estado de preparação:** API e frontend compilam neste checkout, mas o APK ainda não está pronto. Não há projeto `frontend/android/` no repositório; o endereço de API de produção exige configuração para o IP/hostname do notebook; e a compilação Android não pôde ser verificada neste ambiente (Java, Android SDK e `adb` não estão no PATH).

## Funcionalidades implementadas

### Cliente

- Cadastro de conta e autenticação por e-mail e senha; recuperação e redefinição de senha por e-mail quando o SMTP está configurado.
- Consulta de veículos, filtros, detalhes e favoritos.
- Fluxo de reserva com datas, disponibilidade, loja de retirada vinculada ao veículo e cálculo de valores na API.
- Pagamento demonstrativo, consulta do histórico e comprovante/snapshot do pagamento.
- Consulta e cancelamento de reservas próprias conforme o estado da reserva/pagamento.
- Perfil, endereço, dados cadastrais e foto de perfil.
- Notificações persistidas na API; notificações locais nativas são best-effort quando a aplicação Capacitor e as permissões do dispositivo permitem.

### Funcionário

- Consulta e operação de reservas, incluindo confirmação/cancelamento conforme regras da API.
- Gestão operacional de locações: registro de retirada, devolução, informações de quilometragem/condição e vistorias.
- Consulta de pagamentos e registros operacionais autorizados.

### Administrador

- Painel, usuários/funcionários, clientes, veículos, lojas e categorias.
- Associação explícita de veículos às lojas de retirada; carros sem loja associada não podem receber novas reservas.
- Reservas, pagamentos demonstrativos, locações, retiradas e devoluções.
- Revisões, vistorias, taxa de serviço e relatórios disponíveis na aplicação.
- Upload e remoção de fotos de veículos e fotos de perfil.

Os papéis são validados no backend. A interface também restringe a navegação por perfil, mas os guards do frontend não substituem a autorização da API.

## Regras de negócio principais

- A reserva é criada mediante validação de datas, disponibilidade, veículo e loja elegível. A API calcula os valores; preço informado pelo cliente não deve ser considerado fonte da verdade.
- A loja de retirada deve estar associada ao veículo. O vínculo entre veículos e lojas não é preenchido automaticamente pela migration: a associação é feita no painel administrativo.
- Pagamento é **simulado**; não existe gateway financeiro real nem cobrança de cartão/PIX. O serviço simulado determina o resultado e a API controla as transições.
- Estados persistidos de pagamento incluem `pendente`, `aprovado`, `recusado`, `cancelado` e `estornado` (rótulos de interface podem ser traduzidos).
- A confirmação operacional da reserva é feita por usuário autorizado e depende do fluxo de pagamento aplicável.
- Cancelamentos seguem as regras de estado implementadas na API; para pagamentos aprovados existe registro de estorno simulado, sem movimentação financeira real.
- A locação representa a execução da reserva. Retirada, devolução e vistorias são registradas pelos perfis operacionais autorizados; os registros afetam a disponibilidade.
- Veículos indisponíveis, em manutenção, já reservados no período ou sem loja elegível não devem ser oferecidos para novas reservas.

## Arquitetura

| Camada | Tecnologia / localização |
|---|---|
| Frontend | Ionic 9, Angular 22, TypeScript 6, RxJS |
| API | NestJS 12, TypeScript 6, Express |
| Persistência | TypeORM 1.1, MySQL (`mysql2`); SQLite `better-sqlite3` para desenvolvimento/testes compatíveis |
| Cache | Redis via `ioredis`; Memurai é a opção Redis-compatible no Windows |
| Autenticação | JWT Bearer, Passport JWT, bcrypt; token de acesso com expiração configurável |
| Validação | `class-validator`, `class-transformer`, `ValidationPipe` global |
| Documentação API | Swagger em `/docs` |
| Aplicativo | Capacitor 8 e plugin Local Notifications; diretório nativo Android ainda não versionado |

### Organização principal

```text
api/
  src/                 módulos NestJS, entidades, DTOs, serviços e controllers
  src/database/        DataSource, migrations e seeds
  test/                E2E e testes dedicados a MySQL/Redis
  uploads/             arquivos persistidos localmente (não versionar/backupar)
frontend/
  src/app/             páginas, rotas, guards, serviços e componentes Ionic/Angular
  src/environments/    URLs de API para builds de desenvolvimento/produção
  capacitor.config.ts  identificador e plugins Capacitor
docs/                  arquitetura atual, changelog e ADRs
```

## Requisitos identificados

- Windows 10/11 (ambiente de desenvolvimento observado).
- Node.js **24.21.0** e npm **11.19.0** foram usados nesta auditoria; a versão mínima formal não está fixada em `engines`.
- MySQL compatível com o driver `mysql2` (porta padrão 3306) para o cenário servidor proposto.
- Memurai/Redis (porta padrão 6379) para cache. A API espera Redis ao iniciar; embora vários serviços tratem erros de cache como best-effort e consultem o banco, não foi comprovado que um Redis ausente durante bootstrap deixe a aplicação em estado confiável.
- Para Android: JDK compatível com a versão de Android Gradle Plugin/Capacitor que será gerada, Android Studio/SDK e ferramentas de plataforma. **Java, `adb` e `sdkmanager` não foram encontrados no PATH desta máquina durante a auditoria.** A versão Android mínima/alvo ainda deve ser definida quando o projeto nativo for gerado.

## Instalação e execução local (desenvolvimento)

### 1. Clonar e instalar

```powershell
git clone <URL-DO-REPOSITORIO>
cd locaMais
cd api
npm ci
cd ..\frontend
npm ci
```

Use `npm ci` em cada pacote; há lockfiles próprios em `api/` e `frontend/`. O `package.json` da raiz contém apenas dependências e não oferece scripts de orquestração.

### 2. Configurar API

Na pasta `api`, copie `.env.example` para `.env` e configure valores locais. O exemplo seleciona SQLite; para operar com MySQL, defina `DATABASE_TYPE=mysql`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` e `DATABASE_NAME`. Defina um `JWT_SECRET` aleatório e forte e uma senha de administrador exclusiva; não versione `.env`.

Crie o schema antes de executar migrations. Exemplo, usando uma conta MySQL com permissão apropriada:

```sql
CREATE DATABASE locamais CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Configure no `.env` `DATABASE_TYPE=mysql`, `DATABASE_NAME=locamais`, credenciais e `DATABASE_SYNCHRONIZE=false`. Então, na pasta `api`:

```powershell
npm run migration:show
npm run migration:run
```

As migrations criam/alteram o esquema. Não use `DATABASE_SYNCHRONIZE=true` para o banco de uso normal; essa opção pode alterar estrutura automaticamente. A execução de migrations foi conferida nesta auditoria: as migrations disponíveis apareceram aplicadas no banco configurado localmente. Para uma instalação limpa, valide `migration:show` antes/depois de `migration:run`.

### 3. Iniciar Redis/Memurai

Instale/inicie Memurai como serviço no Windows, ou inicie um servidor Redis local compatível. Mantenha-o ligado a loopback quando API e Redis estiverem no mesmo notebook. Configure `REDIS_HOST=127.0.0.1`, `REDIS_PORT=6379` e, se habilitada, `REDIS_PASSWORD`. Redis é interno ao servidor e não deve ser exposto aos celulares.

### 4. Iniciar a API

```powershell
cd api
npm run start:dev
```

Por padrão a API usa bind `127.0.0.1` para manter o desenvolvimento local. A API: `http://localhost:3000/api`; Swagger: `http://localhost:3000/docs`; arquivos estáticos: `http://localhost:3000/uploads/...`. Para build e execução compilada:

```powershell
npm run build
npm run start:prod
```

`start:prod` executa `dist/main.js`; a API não deve depender do servidor de desenvolvimento Angular.

### 5. Iniciar frontend

```powershell
cd frontend
npm start
```

O comando executa `ng serve`; acesse o endereço impresso pelo Angular CLI (normalmente `http://localhost:4200`). O `environment.ts` aponta para `http://localhost:3000/api`, configuração de desenvolvimento.

## Acesso pela rede local e uso do notebook como servidor

O cenário usa o notebook para MySQL, Memurai, API e arquivos `api/uploads`; os celulares conversam **somente com a API**. MySQL (3306) e Redis/Memurai (6379) não devem ser liberados na Wi-Fi. A API usa a porta 3000 por padrão e o bind pode ser controlado com `HOST`.

### Descobrir o IPv4 Wi-Fi no Windows

1. Execute `ipconfig` no PowerShell e localize o adaptador **Wireless LAN / Wi-Fi** ativo; use o campo **Endereço IPv4**, não endereços de Ethernet desconectada, Bluetooth, VPN ou adaptadores virtuais.
2. Para confirmar a interface, execute:

   ```powershell
   Get-NetIPConfiguration | Where-Object { $_.InterfaceAlias -match 'Wi-Fi' } | Select-Object InterfaceAlias, IPv4Address, IPv4DefaultGateway
   ```

3. Se houver várias interfaces Wi-Fi, escolha a que tem endereço IPv4 e gateway padrão da rede onde também está o celular. Não fixe um endereço inventado: use o IPv4 atual que o Windows reporta.
4. Uma reserva DHCP no roteador pode manter o endereço do notebook estável. Faça essa reserva manualmente no roteador; o projeto não altera a rede.

### Iniciar o backend com acesso LAN

Na pasta `api`, defina `HOST=0.0.0.0` no `.env` local (ou apenas na sessão PowerShell) e mantenha `PORT=3000`. `0.0.0.0` é o endereço de bind, não o endereço a ser usado pelo celular. Por exemplo:

```powershell
$env:HOST = '0.0.0.0'
npm run start:dev
```

Para a execução compilada:

```powershell
$env:HOST = '0.0.0.0'
npm run build
npm run start:prod
```

O ambiente padrão continua restrito a `127.0.0.1`; defina `HOST=0.0.0.0` conscientemente para habilitar a escuta em interfaces de rede. O prefixo permanece `/api`, e o serviço de arquivos continua fora dele em `/uploads`. A pasta é resolvida relativamente ao módulo da API, não ao diretório de trabalho do terminal. Preserve `api/uploads/carros/` e `api/uploads/usuarios/` junto com o banco para manter válidos os caminhos de fotos.

Confira se a porta está ocupada e qual endereço está escutando:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000
```

`0.0.0.0:3000` ou `[::]:3000` indica escuta ampla; `127.0.0.1:3000` indica somente loopback. Se a porta já estiver em uso, identifique o processo com `Get-Process -Id <OwningProcess>` e escolha uma ação consciente; não encerre processos desconhecidos. MySQL e Memurai devem continuar ligados a loopback/localmente no notebook.

### URL centralizada do frontend

Os serviços HTTP usam `environment.apiUrl`; não montam endereços de host individualmente. A configuração de desenvolvimento permanece em `frontend/src/environments/environment.ts` apontando ao backend local. O serviço `ImageUrlService` remove o sufixo `/api` da mesma base para transformar caminhos relativos `/uploads/...` em URL completa de imagem.

Para compilar os arquivos web apontando à API do notebook, configure a variável e execute na pasta `frontend`:

```powershell
$env:LOCAMAIS_API_URL = 'http://<IPV4-WIFI-DO-NOTEBOOK>:3000/api'
npm run build:server
```

O script exige URL HTTP(S), normaliza o sufixo `/api` (não duplica se já presente) e injeta a base no `www/index.html` gerado, sem editar páginas ou serviços. Para outro notebook/IP, informe outro valor no build. Não versione o endereço local. Este comando prepara os assets web; não cria nem sincroniza APK.

Exemplo de transformação de imagem: base `http://<IPV4-WIFI-DO-NOTEBOOK>:3000/api` e caminho salvo `/uploads/carros/arquivo.webp` resultam em `http://<IPV4-WIFI-DO-NOTEBOOK>:3000/uploads/carros/arquivo.webp`. Fotos de perfil seguem a mesma regra em `/uploads/usuarios/...`. URLs absolutas já existentes são mantidas; upload, troca e exclusão continuam indo à API configurada.

### CORS

O backend permite por padrão as origens locais do Angular/Ionic (`localhost` e `127.0.0.1` nas portas 4200/8100) e as origens locais usadas pelo WebView Capacitor (`http://localhost`, `https://localhost`, `capacitor://localhost`, `ionic://localhost`). Requisições sem cabeçalho `Origin` também são aceitas (inclui alguns clientes nativos). Origens web adicionais devem ser informadas em `CORS_ORIGINS`, separadas por vírgulas, com correspondência exata, por exemplo a origem do navegador servida na LAN se ela for usada. Quando a variável é preenchida, ela substitui a lista padrão; inclua também a origem Capacitor necessária. CORS não é firewall nem autenticação, e não permite credenciais/cookies; a API usa Bearer token.

### Firewall do Windows

Somente a porta HTTP da API, **3000/TCP**, precisa aceitar conexões de entrada dos celulares. Não libere 3306 (MySQL) nem 6379 (Redis). No Windows Defender Firewall, crie regra de entrada para TCP/3000 apenas no perfil **Privado**, preferencialmente restringindo escopo remoto à sub-rede local. Não desative o firewall. Exemplo opcional em PowerShell elevado — revise a interface/perfil e a política local antes de executar; este projeto não cria a regra automaticamente:

```powershell
New-NetFirewallRule -DisplayName 'LocaMais API - rede privada' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private
```

O comando libera a porta da API no perfil Privado; para limitar origens ainda mais, configure `RemoteAddress` com a sub-rede da sua rede. Remova a regra após a demonstração se ela não for mais necessária.

### Verificação da comunicação

No próprio notebook, usando o IPv4 Wi-Fi descoberto acima (não `localhost`):

```powershell
Test-NetConnection <IPV4-WIFI-DO-NOTEBOOK> -Port 3000
Invoke-WebRequest 'http://<IPV4-WIFI-DO-NOTEBOOK>:3000/api' -UseBasicParsing
```

`GET /api` é um endpoint público simples que retorna `Hello World!`, sem dados internos. Confirme imagem com um caminho `/uploads/...` que exista e tenha sido retornado pela API; pode-se consultar o arquivo estático diretamente pelo mesmo IP e porta. Para testar o navegador, autentique-se e consulte veículos e lojas ativas (`/api/carros`, `/api/lojas/ativas`); essas rotas exigem Bearer token. Não crie reserva sobre o banco principal durante teste de conectividade.

Depois, com celular na mesma Wi-Fi (rede móvel desligada), abra `http://<IPV4-WIFI-DO-NOTEBOOK>:3000/api` no navegador do celular. Resposta `Hello World!` comprova conectividade HTTP do aparelho; teste o build web instalado/preview para login, carros, lojas e fotos. Se funcionar no notebook mas não no celular, confira firewall, rede Guest/isolamento de clientes, VPN e se ambos estão na mesma sub-rede. A validação feita nesta etapa não substitui o teste real do celular se ele não estiver disponível.

O notebook precisa permanecer ligado e sem suspensão; mudança de IP ou queda de serviços interrompe o acesso.

## HTTPS local com CA própria (mkcert)

HTTPS protege credenciais e tokens durante a comunicação, mas não torna automaticamente a CA confiável no celular. CORS e confiança TLS são verificações distintas. O projeto usa uma CA local de desenvolvimento do `mkcert`; não é certificado público nem serviço externo. Faça isso apenas numa rede controlada. O `mkcert -install` altera a confiança do Windows e a instalação da CA no celular altera esse dispositivo: os comandos abaixo são instruções para execução consciente, não são executados pelo projeto.

### Instalar mkcert e criar a CA no Windows

No diagnóstico de 24/11/2026, `mkcert` e OpenSSL não estavam instalados; `winget` estava disponível e Chocolatey não. Confirme no seu computador e instale usando **uma** destas opções:

```powershell
winget install --id FiloSottile.mkcert -e
# ou, se Chocolatey já estiver instalado:
choco install mkcert
```

Feche e reabra o PowerShell, confirme a instalação e localize o CAROOT:

```powershell
Get-Command mkcert
mkcert -version
mkcert -CAROOT
```

`CAROOT` é a pasta local do mkcert que contém a chave privada e o certificado raiz da CA. Depois de revisar o efeito, crie/instale a CA local no armazenamento de confiança do Windows:

```powershell
mkcert -install
mkcert -CAROOT
```

O diretório impresso por `mkcert -CAROOT` contém a chave privada da CA (`rootCA-key.pem`). **Mantenha essa chave somente no notebook, proteja a conta Windows e nunca a copie para celulares, para o frontend ou para o repositório.** Não envie a pasta CAROOT para outras pessoas. Somente o certificado público `rootCA.pem` pode ser exportado para configurar confiança nos clientes. Se `mkcert -install` não tiver sido autorizado/executado, não declare a CA confiável no Windows.

### Emitir certificado para o IPv4 Wi-Fi atual

Obtenha o IPv4 como descrito acima (`ipconfig`) e confirme que corresponde à interface Wi-Fi ativa. Crie uma pasta local fora do checkout e das pastas públicas da API:

```powershell
$certDir = Join-Path $env:LOCALAPPDATA 'LocaMais\certs'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$wifi = (Get-NetIPConfiguration | Where-Object { $_.InterfaceAlias -match '^Wi-Fi$' -and $_.IPv4Address -and $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4Address.IPAddress
if (-not $wifi) { throw 'Não foi encontrado IPv4 Wi-Fi ativo com gateway; confira ipconfig.' }
$apiHost = 'locamais-server.home.arpa'
mkcert -cert-file (Join-Path $certDir 'locamais-server.pem') `
       -key-file (Join-Path $certDir 'locamais-server-key.pem') `
       $wifi $apiHost localhost 127.0.0.1 ::1
```

O certificado contém o IPv4 real como SAN de IP e o nome DNS local `locamais-server.home.arpa`. O app Android usa o nome DNS, não IP literal: a Network Security Configuration do Android corresponde a hosts/domínios e não permite uma regra genérica que acompanhe qualquer IPv4 futuro. Configure manualmente no roteador um registro DNS local `locamais-server.home.arpa` apontando para o IPv4 Wi-Fi atual e, de preferência, reserve esse IP via DHCP. Se o IP mudar, atualize o registro local; como o nome permanece, a URL/certificado não precisam mudar. Sem DNS local no roteador, utilize um resolvedor DNS local da LAN ou adote IP reservado e altere a regra Android e emita novo certificado; a resolução por `.local`/mDNS não é presumida por esta configuração.

#### Se a rede não permitir registro DNS no roteador

1. **Preferida:** peça ao administrador da rede acadêmica um registro DNS local para `locamais-server.home.arpa` e, se possível, uma reserva DHCP. Em Wi-Fi institucional pode haver isolamento entre clientes, DNS controlado e bloqueio de portas; confirme também que o notebook e o celular podem se comunicar.
2. **Resolvedor DNS na LAN:** um DNS local (por exemplo, Technitium DNS Server) pode responder o nome, mas todos os clientes precisam consultá-lo. O caminho mais simples é configurar o roteador/DHCP para anunciar esse DNS. Isso exige acesso administrativo, serviço ligado continuamente e regras de firewall adequadas para DNS TCP/UDP 53; não instale nem abra portas sem autorização. Não inicie um servidor DHCP paralelo numa rede acadêmica.
3. **Configuração manual do DNS do dispositivo:** só é viável se a política da rede permitir que o aparelho consulte um DNS local alcançável. Android Private DNS geralmente exige DNS-over-TLS e não é um campo de servidor DNS IP simples; a configuração por Wi-Fi e sua disponibilidade variam por versão/dispositivo. Verifique no próprio aparelho antes de adotar.
4. **IP literal:** DHCP reservado e certificado com SAN IP podem ser usados para o navegador. Para o app Android, o `domain-config` atual está associado a um hostname DNS exato; não substitua por IP nem assuma que o parser Android tratará IP literal como domínio sem validar em Android real. Se escolhido, altere o domínio na configuração, emita certificado com esse IP e teste antes de distribuir.
5. **mDNS/`.local` ou arquivo hosts:** mDNS não é garantido em todos os Androids/redes acadêmicas; arquivo hosts normalmente requer privilégio especial no Android. Não são a solução principal deste app.

No estado observado em 24/11/2026, o DNS da rede consultado respondeu NXDOMAIN para `locamais-server.home.arpa`; isso comprova que o registro ainda não está resolvendo, mas não informa se o roteador oferece cadastro manual. O modelo/administrador do roteador não foi acessado.

Armazene a chave privada de servidor (`locamais-server-key.pem`) junto aos certificados, com acesso restrito à conta do operador. Ela não deve ficar em `frontend/`, `api/uploads/`, `frontend/www/` ou no Git.

### Configurar e iniciar API HTTPS

No `.env` local da API (não versionado), ou na sessão PowerShell, defina:

```powershell
$env:HTTPS_ENABLED = 'true'
$env:HTTPS_KEY_PATH = (Join-Path $env:LOCALAPPDATA 'LocaMais\certs\locamais-server-key.pem')
$env:HTTPS_CERT_PATH = (Join-Path $env:LOCALAPPDATA 'LocaMais\certs\locamais-server.pem')
$env:HOST = '0.0.0.0'
$env:PORT = '3000'
```

Os caminhos relativos de `HTTPS_KEY_PATH` e `HTTPS_CERT_PATH` são resolvidos a partir de `api/`; caminhos absolutos também são aceitos. Com `HTTPS_ENABLED=true`, a inicialização falha claramente se algum caminho estiver ausente, ilegível, malformado ou se chave e certificado não corresponderem. Não existe fallback silencioso para HTTP. Com HTTPS desativado (padrão), o modo HTTP local anterior continua disponível.

```powershell
cd api
npm run build
npm run start:prod
```

Para desenvolvimento com watch, mantendo as mesmas variáveis de HTTPS, use `npm run start:dev`. `/api` continua sendo a API e `/uploads/...` continua público na mesma porta. Libere no Firewall somente **3000/TCP**, perfil Privado e, se possível, escopo remoto restrito à LAN. Não abra 3306 nem 6379. Nenhuma regra de firewall é criada pelo projeto.

### Build web apontando para HTTPS

Na pasta `frontend`, use o IPv4 atual, não `0.0.0.0`:

```powershell
$env:LOCAMAIS_API_URL = "https://${wifi}:3000/api"
npm run build:server
```

O script aceita `https:`, acrescenta `/api` somente se necessário e injeta a URL única no build de produção. `ImageUrlService` deriva a mesma origem removendo `/api`: `/uploads/carros/...` e `/uploads/usuarios/...` carregam por HTTPS. O build de desenvolvimento (`npm start`) mantém o endereço HTTP local. Links estáticos de fontes no `index.html` usam HTTPS. URLs absolutas de imagem recebidas da API são preservadas por compatibilidade; se algum dado persistido contiver uma URL absoluta `http:`, ela poderá causar Mixed Content num cliente HTTPS e deve ser corrigida na origem desses dados, sem substituir silenciosamente o host.

### Testar TLS no notebook

Com a API em execução, confirme o listener e abra no navegador do notebook:

```powershell
$wifi = (Get-NetIPConfiguration | Where-Object { $_.InterfaceAlias -match '^Wi-Fi$' -and $_.IPv4Address -and $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4Address.IPAddress
nslookup locamais-server.home.arpa
ping -n 1 locamais-server.home.arpa
Get-NetTCPConnection -State Listen -LocalPort 3000
Test-NetConnection locamais-server.home.arpa -Port 3000
Invoke-WebRequest 'https://locamais-server.home.arpa:3000/api' -UseBasicParsing
```

Confirme que `nslookup` resolve para o IPv4 da interface Wi-Fi ativa, não para loopback/VPN. `ping` pode ser bloqueado pela rede e não valida TLS; a resposta `Hello World!` em HTTPS e a validade do certificado no navegador são verificações distintas. Não use opções que ignorem erros de certificado. Para testar também a SAN de IP, use o IPv4 somente se ele estiver incluído no certificado. Para imagem, use um arquivo real retornado pela API:

```powershell
Invoke-WebRequest 'https://locamais-server.home.arpa:3000/uploads/carros/<arquivo-existente>.webp' -UseBasicParsing
```

Verifique Subject Alternative Name se houver erro de hostname: o certificado precisa conter exatamente o IP usado na URL. `ERR_CERT_AUTHORITY_INVALID`/erro de autoridade indica CA não confiável no cliente; erro de nome indica SAN incompatível; conexão recusada indica bind, porta, firewall ou servidor. Não ignore o aviso e não desative a validação TLS.

### Plataforma Android e confiança em celulares

Para abrir a URL no navegador do celular, transfira **somente** o certificado público da CA (`rootCA.pem`, localizado no diretório mostrado por `mkcert -CAROOT`) por um canal local controlado e instale-o nas configurações de certificados de CA do Android. Nunca transfira `rootCA-key.pem` nem `locamais-server-key.pem`. A instalação da CA no usuário Android pode permitir confiança no navegador, mas **não garante** que um app/WebView moderno confie nela.

O app Android usa Network Security Configuration com cleartext desabilitado e CA local específica limitada ao destino do build. O certificado público da CA está em `frontend/android/app/src/main/res/raw/locamais_root_ca.cer`; o recurso PEM é ignorado pelo Git. Os builds USB e Wi-Fi são gerados para `localhost` e para o IPv4 atual do hotspot, respectivamente. A chave privada da CA e a chave do servidor permanecem fora do frontend e do app. Não use `trust-all`, `HostnameVerifier` permissivo ou desativação da validação. A origem WebView Capacitor e o CORS continuam separados da confiança TLS do host da API.

Para apresentação sem DNS do roteador, use o build Wi-Fi com o endereço IP atual do notebook no hotspot. A regra Android e o certificado precisam corresponder exatamente ao IP usado na URL; se o IP mudar, reemita o certificado e compile novamente. O build USB usa `https://localhost:3000/api` com `adb reverse tcp:3000 tcp:3000` e certificado SAN `localhost`.

## Plataforma Android (Capacitor)

A plataforma está em `frontend/android/`, criada com `@capacitor/android` **8.5.3**, alinhado ao Core e CLI 8.5.3. O identificador configurado é `com.locamais.app` e o rótulo visível é **LocaMais**. O `webDir` permanece `www`; `cap sync` copia os assets gerados pelo Angular e sincroniza os plugins. Ícones/splash padrão gerados pelo Capacitor foram preservados. O Manifest declara Internet e nega cleartext; não há permissão ampla de leitura de mídia porque upload usa o seletor HTML de arquivos/WebView. O plugin Local Notifications contribui permissões de notificações e entrega agendada após boot; `SCHEDULE_EXACT_ALARM` é removida porque o app agenda notificações inexatas (`isExactNotification: false`).

### Requisitos Windows detectados

Nesta máquina há Android Studio em `C:\Program Files\Android\Android Studio`, com JBR **21.0.8**, Android SDK Platform 35 e 36, Build Tools 34.0.0/35.0.0/36.1.0, ADB 36.0.2 e wrapper Gradle **8.14.3** no projeto. A configuração Android gerada usa AGP 8.13.0, compile/target SDK 36 e min SDK 24. Não há dispositivo listado por `adb devices -l`. As variáveis atuais `ANDROID_HOME` e `ANDROID_SDK_ROOT` apontam incorretamente para a pasta Desktop; o caminho real detectado é `%LOCALAPPDATA%\Android\Sdk`. Android SDK Command-line Tools (`sdkmanager`) não foram encontrados. Java/JDK não está no PATH nem `JAVA_HOME`, embora o JBR do Android Studio esteja instalado. Não foi feita instalação automática de ferramentas.

Para esta sessão PowerShell, aponte variáveis sem alterar configuração global:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
java -version
adb version
adb devices -l
```

Para corrigir de forma persistente, abra Android Studio > **Settings > Languages & Frameworks > Android SDK** e confira o SDK Location; instale Android SDK Command-line Tools (latest) pelo **SDK Manager > SDK Tools**. Configure `JAVA_HOME` para o JBR mostrado em **Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK**. No Windows, as variáveis de usuário podem ser definidas nas configurações de Ambiente do Sistema; atualize `ANDROID_HOME`/`ANDROID_SDK_ROOT` para o SDK Location correto e inclua `%ANDROID_HOME%\platform-tools` no `PATH`. Feche/reabra terminais. A instalação do Android Studio/JDK/SDK ou edição global de variáveis não foi feita pelo agente.

Em um computador sem essas ferramentas, instale Android Studio pelo instalador oficial para Windows; no assistente inicial selecione Android SDK e Android Virtual Device se for usar emulador. Em **SDK Manager > SDK Platforms**, instale API 36; em **SDK Tools**, instale Android SDK Build-Tools 36.x, Platform-Tools e Command-line Tools (latest). Use o JBR 21 incluído no Android Studio como Gradle JDK; não é necessário instalar Gradle globalmente, pois o projeto usa `gradlew.bat`. Se optar por JDK separado, instale JDK 21 e configure `JAVA_HOME` para sua pasta. A disponibilidade de um emulador não substitui os testes da Wi-Fi/CA em celular real.

### Builds de apresentação: USB e hotspot

O script `android-mode.mjs` valida a CA empacotada, validade/assinatura/SAN do certificado, e confirma que o IP hotspot fornecido está ativo em uma interface do notebook. Ele gera a Network Security Configuration exata do modo e executa build Angular, Capacitor sync e Gradle. Ambos os modos usam HTTPS; não há perfil HTTP.

```powershell
cd frontend
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

# USB: Android localhost:3000 é encaminhado pelo ADB ao notebook.
npm run android:build:usb
npm run android:install:usb
npm run android:reverse
npm run android:reverse:remove

# Wi-Fi: descubra o IPv4 atual com Get-NetIPConfiguration e informe-o.
$env:LOCAMAIS_HOTSPOT_IP = '192.168.137.1' # substituir pelo IP atual confirmado
npm run android:build:wifi
npm run android:install:wifi
```

Os artefatos identificados por modo ficam em `frontend/android/app/build/outputs/apk/debug/locamais-debug-usb.apk` e `locamais-debug-wifi.apk`; `app-debug.apk` é o APK da última compilação. O build USB aponta para `https://localhost:3000/api` e exige `adb reverse tcp:3000 tcp:3000`. O build Wi-Fi aponta para `https://IP-ATUAL-DO-HOTSPOT:3000/api`; se esse IP mudar, compile novamente com o novo IP, certificado SAN correspondente e nova regra Android gerada pelo script.

Para iniciar o backend em outro terminal PowerShell:

```powershell
cd api
.\scripts\start-presentation.ps1
```

O script usa o certificado de apresentação fora do checkout, `HOST=0.0.0.0`, porta 3000, HTTPS e CORS limitado às origens Capacitor. Ele não encerra outro processo que ocupe a porta e não altera MySQL/Redis/firewall. A API exige conexão válida ao MySQL para completar o bootstrap.

Com o celular conectado e autorizado, `android:install:usb` aplica o reverse, instala e abre o app; `android:install:wifi` instala e abre o APK Wi-Fi. Para habilitar ADB: Android > Opções do desenvolvedor > Depuração USB; conecte o cabo, desbloqueie a tela e aceite a chave RSA. Confira `adb devices -l`, depois use `adb logcat | Select-String 'chromium|Capacitor|locamais'`. A instalação USB é feita pelo cabo mesmo para o APK Wi-Fi.

### Roteiro de teste em celular real

- **USB:** conecte cabo, autorize `adb devices -l`, aplique `adb reverse tcp:3000 tcp:3000` e teste API, login e fotos pelo build USB.
- **Hotspot:** confirme o IPv4 atual do notebook e do cliente, conecte o celular ao hotspot, confirme TCP/3000 e teste API, login e fotos pelo build Wi-Fi.
- Instale o build debug e abra o app; faça login e consulte veículos/lojas.
- Verifique fotos de carros e perfil em `/uploads/...`, notificações locais, e upload via seletor de arquivos.
- Faça reserva somente em ambiente de teste isolado.
- Inspecione logs de rede e confirme HTTPS para API e uploads; teste que certificado expirado, CA não confiável e hostname/SAN incompatível são rejeitados.
- No hotspot, ao mudar o IP do notebook, reemita certificado com SAN IP correspondente, passe o novo IP para `LOCAMAIS_HOTSPOT_IP` e recompile `android:build:wifi`.

## Capacitor e Android

O projeto Android está em `frontend/android/` com Capacitor 8.5.3, `appId: com.locamais.app`, nome `LocaMais`, Network Security Configuration gerada por modo e cleartext desabilitado. Há builds debug USB e Wi-Fi. A compilação não comprova disponibilidade da API nem funcionamento em aparelho; confira a seção de estado da etapa 7.

- A integração de notificações é local e best-effort: consulta notificações da API quando a aplicação está ativa/oculta e agenda notificações locais; não é push remoto em background garantido.
- Upload de fotos usa `FormData` e `<input type=file>` no fluxo web; câmera/galeria via plugin Capacitor dedicado não foi localizada. Validar seleção de arquivo em Android real.
- Token é mantido em `sessionStorage` por `TokenStorageService`; a compatibilidade e persistência no WebView Android devem ser testadas em encerramento/reabertura. Não há refresh token: access token expira conforme `JWT_EXPIRES_IN` (padrão `1h`) e a sessão é limpa em 401.

O APK debug só deve ser tratado como funcional após validar o backend HTTPS e executar os testes reais do modo escolhido em dispositivo Android.

## Estado observado — etapas 5 a 7 (24/11/2026)

Esta fotografia do ambiente distingue instruções de ações executadas:

- mkcert **1.4.4** está instalado. Após autorização explícita, `mkcert -install` criou a CA em `%LOCALAPPDATA%\mkcert`; a chave privada da CA continua no CAROOT.
- Certificado de apresentação separado em `%LOCALAPPDATA%\LocaMais\certs\locamais-presentation.pem` e chave em `%LOCALAPPDATA%\LocaMais\certs\locamais-presentation-key.pem`. SANs: `localhost` e IP hotspot observado `192.168.137.1`. Node confirmou assinatura contra a CA, SANs, validade e correspondência da chave/certificado. A CA pública está no recurso Android; somente o PEM público foi copiado.
- `android:build:usb` compilou `https://localhost:3000/api`; `android:build:wifi` compilou `https://192.168.137.1:3000/api`. Ambos os builds de produção, sync Capacitor e Gradle `assembleDebug` passaram. Os APKs foram verificados com `aapt` (package `com.locamais.app`, rótulo LocaMais, ícone, permissões, cleartext desabilitado, Network Security Config e CA raw) e `apksigner` (assinatura v2 válida). Os assets contêm a URL certa e não contêm URLs antigas HTTP/loopback.
- Artefatos: `frontend/android/app/build/outputs/apk/debug/locamais-debug-usb.apk` (4.712.732 bytes) e `locamais-debug-wifi.apk` (4.712.736 bytes). `app-debug.apk` fica correspondente à última compilação (Wi-Fi). São builds, não testes funcionais no telefone.
- O serviço de hotspot tem IPv4 atual `192.168.137.1`; a tabela de vizinhos mostra cliente `192.168.137.76`. Isso confirma endereços observados no notebook, não prova API acessível pelo celular.
- A execução de `api/scripts/start-presentation.ps1` compilou a API e iniciou Nest/Redis, mas TypeORM falhou com autenticação MySQL recusada; a API encerrou sem listener HTTPS. Não foi exibido valor de credencial, nem alterado banco/senha. Login, `/api`, `/uploads`, cache de negócio e persistência não foram validados.
- Listener local observado: MySQL está em `[::]:3306`, Redis/Memurai em `127.0.0.1:6379`. Os perfis do Windows Firewall estão habilitados com política padrão de entrada bloqueada, mas regras locais são controladas por GPO e não foram alteradas; não declare a exposição remota de MySQL comprovadamente impossível sem validação administrativa da política efetiva. Redis permanece loopback.
- `adb devices -l` não encontrou dispositivo autorizado; `android:install:usb` foi tentado e recusou por ausência de dispositivo. Portanto, nenhum APK foi instalado/aberto e nenhum teste Android de login/imagens/notificações foi executado.
- Android Studio, JBR 21.0.8, SDK Platforms 35/36, Build Tools 34/35/36.1, ADB 36.0.2 e Gradle Wrapper 8.14.3 estão disponíveis; SDK Command-line Tools não foram encontrados. Variáveis do SDK/JDK foram corrigidas somente na sessão de build.
- `.gitignore` exclui extensões de certificados/chaves. As chaves privadas da CA e servidor permanecem fora do checkout.

### Auditoria npm observada

`npm audit` (frontend) reportou **27** avisos: 3 críticos, 6 altos e 18 moderados. `npm audit --omit=dev` reportou 2 altos (`@angular/router` e `zod`). Os diretos críticos são `@angular/build@22.1.8` (pelo `piscina@5.2.0`, vulnerabilidade de execução de código no pipeline de build) e `vitest@4.0.18` (problemas no mocker/UI; não execute o Vitest UI numa interface não confiável). O audit indica correções disponíveis via Angular `22.3.0` e Vitest `4.1.12`. `@angular/cli@22.1.8`/`@modelcontextprotocol/sdk@1.30.0`/`zod@4.4.3` também aparecem como altos; `@angular/router@22.1.7` tem avisos direcionados a SSR, que este frontend não usa. `zod` permanece no conjunto de runtime e tem aviso de consumo de memória para coleções validadas grandes. `@capacitor/cli@8.5.3` tem aviso moderado por `xcode`/`uuid`, com correção sugerida `8.6.2`.

`npm audit` (API) reportou **11** avisos: 5 altos, 4 moderados e 2 baixos; `npm audit --omit=dev` reportou **3 altos**. O prioritário em runtime é `@nestjs/platform-express@12.1.3`, via `body-parser@2.3.0` e `multer@2.4.0`, com DoS como classe principal dos avisos; o audit indica atualização compatível disponível. Atualize Nest de forma alinhada e rode testes de upload/E2E antes de usar como servidor acessível na LAN. Os avisos de `@nestjs/mau@0.2.8` vêm de `undici@6.20.1` em dependência de desenvolvimento; o fix indicado pelo audit rebaixa `@nestjs/mau` para `0.0.6` (mudança de linha/compatibilidade), e não foi aplicado. Não execute `npm audit fix --force`; avalie updates coordenados de Angular, Capacitor e Nest num PR separado, com build/testes.

Para atualizar os dados da auditoria depois de mudanças, use `npm audit` e `npm audit --omit=dev` nas pastas `frontend/` e `api/`. A saída do audit muda com os advisories e versões disponíveis; os totais acima são somente a execução desta data.

## Banco, migrations, seeds e backups

- MySQL é a fonte persistente recomendada no notebook; SQLite está disponível no backend para desenvolvimento e suites locais específicas.
- Migrations TypeORM ficam em `api/src/database/migrations/` e são executadas explicitamente via scripts `migration:show`, `migration:run`, `migration:revert`.
- As entidades usam relações e restrições; a migration de `carros_lojas` cria vínculo muitos-para-muitos sem associar automaticamente veículos já existentes.
- `api/src/database/seed-demo-vehicles.ts` e `npm run seed:demo-vehicles` são utilitários de demonstração (idempotentes para placas já presentes). Seeds não substituem backup nem migrações.
- Faça backup consistente do banco MySQL e de `api/uploads/` (incluindo `carros/` e `usuarios/`). Os caminhos das fotos no banco dependem desses arquivos. Proteja cópias com acesso restrito e teste a restauração.

## Redis / Memurai

Redis é cache, não fonte primária dos dados. O cliente é configurado por `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD`; há TTLs distintos em serviços (por exemplo, 60–600 segundos, dependendo da entidade) e invalidação explícita após alterações. Os serviços de domínio tratam diversas falhas de leitura/gravação/invalidação como best-effort e seguem consultando MySQL; se Redis cair, operações específicas podem ficar mais lentas e alguns valores antigos podem sobreviver até o TTL caso uma invalidação falhe. O módulo inicia conexão Redis junto ao bootstrap; indisponibilidade desde o início precisa ser validada no ambiente operacional antes da apresentação.

Não execute `FLUSHALL` ou `FLUSHDB` em ambientes compartilhados. Os testes de integração Redis exigem instância/porta e schema de teste dedicados; instruções detalhadas estão em `api/test/REDIS-INTEGRATION.md`.

## Segurança e variáveis de ambiente

Valores e nomes exemplificados são documentação, não credenciais de produção. Configure `.env` local em `api/` e nunca publique esse arquivo.

| Variável | Uso |
|---|---|
| `DATABASE_TYPE`, `DATABASE_FILE` | SQLite local ou MySQL |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `DATABASE_NAME` | Conexão MySQL |
| `DATABASE_SYNCHRONIZE`, `DATABASE_LOGGING` | Controle do TypeORM; sincronização desligada no servidor |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS` | Assinatura/expiração JWT e hash bcrypt |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seed inicial condicional do administrador; troque e remova a senha de bootstrap após a criação |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Acesso Redis/Memurai local |
| `PORT` | Porta HTTP da API (padrão 3000) |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, `FRONTEND_BASE_URL` | Recuperação de senha por SMTP |
| `OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET`, `OBSERVE_SERVICE_ID` | Telemetria opcional |

A API aplica validação global de DTO, guard global JWT default-deny com exceções `@Public()`, guard de papéis e recarrega usuário ativo do banco a cada request. Uploads de fotos de carro e perfil limitam tamanho e validam extensão/MIME/assinatura do arquivo. Pontos de atenção antes do uso real: HTTPS/CA/DNS ainda não validados, configuração inicial de admin no `.env`, logs/telemetria e firewall. O JWT de acesso armazenado em `sessionStorage` é acessível ao contexto JavaScript do app; para endurecimento mobile, avaliar armazenamento seguro nativo.

## Testes e validação

Comandos disponíveis (executar na pasta indicada):

| Diretório | Comando | Objetivo |
|---|---|---|
| `api/` | `npm test` | Testes unitários e testes isolados configurados pelo Vitest |
| `api/` | `npm run test:e2e` | Fluxos HTTP/API com SQLite em memória por worker |
| `api/` | `npm run test:e2e:mysql` | Concorrência em schema MySQL de teste separado, nome terminado em `_test` |
| `api/` | `npm run test:e2e:redis` | Integração API + MySQL + Redis/Memurai isolados; exige a flag e banco dedicados documentados |
| `api/` | `npm run test:cov` | Cobertura Vitest |
| `api/` | `npm run typecheck`, `npm run lint`, `npm run build` | Tipos, lint e compilação |
| `frontend/` | `npm test -- --watch=false` | Testes unitários Angular/Vitest |
| `frontend/` | `npm run lint`, `npm run build` | Lint e build Angular |

### Última validação de testes e qualidade

- API: build e typecheck passaram; suíte unitária **279 testes aprovados em 30 arquivos**; E2E **97 testes aprovados em 9 arquivos, sem falhas ou skips**.
- Frontend: build passou com avisos de navegadores antigos no Browserslist e orçamento de estilo excedido em `new-vehicle.page.ts`; testes **194 aprovados em 37 arquivos**; lint passou.
- API lint terminou com **0 erros e 17 avisos** de estilo/tipagem não bloqueantes.
- Integrações MySQL concorrência e Redis não foram executadas: este ambiente não tem as variáveis de configuração e os serviços/schema dedicados necessários. Não foram apontadas ao banco principal.
- `npm run migration:show` listou 21 migrations como aplicadas no banco configurado na auditoria anterior; isso não prova a execução em um MySQL limpo.
- `npm run android:sync` constrói os assets com a URL HTTPS e sincroniza plugins Android. `assembleDebug` chegou ao link de recursos e falhou porque o CA real `locamais_root_ca.cer` está ausente, como previsto.
- Não foram executados testes E2E visuais em Android nem verificada comunicação de outro celular com o notebook.

## Limitações e riscos priorizados

| Prioridade | Evidência | Consequência | Recomendação |
|---|---|---|---|
| **Alto — HTTPS Android** | CA mkcert, certificado do servidor e recurso Android ainda ausentes; Gradle falha no link do recurso CA | Ainda não há APK Android confiável para acessar a API | Criar CA conscientemente, emitir SAN DNS, copiar apenas CA pública e compilar/testar em aparelho |
| **Alto — DNS local** | `nslookup locamais-server.home.arpa` retorna NXDOMAIN | App Android não resolve o host da API | Solicitar registro DNS local/reserva DHCP ao administrador do roteador/rede e comprovar a resolução no celular |
| **Alto — URL no Android** | Build `android:sync` injeta URL centralizada HTTPS; hostname ainda não resolve e não há certificado | Assets apontam corretamente, mas conexões reais falhariam até CA/DNS/API estarem prontos | Validar hostname, SAN, certificado e API HTTPS antes de instalar em celular |
| **Médio — acesso LAN** | Listener observado em `127.0.0.1:3000`; regra de firewall e acesso externo não verificados | Celulares não alcançam a API por esse listener | Iniciar com `HOST=0.0.0.0`, liberar somente 3000/TCP no perfil privado após autorização e testar outro dispositivo |
| **Médio — Redis no bootstrap** | `RedisModule` conecta durante bootstrap; operações de cache tratam erros em vários serviços | Indisponibilidade inicial pode afetar inicialização/latência | Validar cenário de falha real e definir serviço Redis como dependência iniciada antes da API |
| **Médio — notificações nativas** | Polling best-effort no frontend, sem push remoto | Notificações podem não chegar se app encerrado/sem sincronização | Descrever como atualização local oportunista; validar permissões/canais Android |
| **Baixo — compatibilidade browsers** | Browserslist inclui versões anteriores ao suporte do Angular instalado | Aviso de build e matriz confusa | Atualizar a lista após decidir versões de navegador/dispositivo suportadas |
| **Baixo — API lint** | Avisos Oxlint em import/variáveis e spreads de classes | Ruído de qualidade e manutenção | Resolver avisos em mudanças específicas e manter lint como gate |

## Próximas etapas para apresentação em APK

1. Instalar mkcert manualmente, revisar `mkcert -install` e criar a CA local; emitir certificado com SAN `locamais-server.home.arpa` e IPv4 Wi-Fi atual.
2. Solicitar/criar registro DNS local e reserva DHCP manualmente; provar `nslookup`/`ping` antes de usar o hostname no Android.
3. Copiar somente `rootCA.pem` para `frontend/android/app/src/main/res/raw/locamais_root_ca.cer` e configurar as variáveis HTTPS da API no notebook.
4. Iniciar API em HTTPS, validar handshake/cadeia/SAN, `/api`, JWT e um upload existente em `/uploads` no notebook e depois em outro dispositivo.
5. Rodar `npm run android:sync` com `LOCAMAIS_API_URL` HTTPS, compilar debug e testar rejeição de certificados inválidos em Android real.
6. Só depois dos testes funcionais e de TLS considerar gerar um APK de demonstração; manter MySQL/Redis fora da rede Wi-Fi e validar reinício dos serviços.

## Créditos

Projeto acadêmico de desenvolvimento de sistema de locação de veículos. Esta documentação não atribui autoria individual: os arquivos disponíveis no repositório consultado não forneceram uma relação confiável e atualizada de responsáveis.
