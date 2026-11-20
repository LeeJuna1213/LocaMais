# LocaMais API

Backend NestJS + TypeORM do projeto **LocaMais**.

A documentação completa (instalação, variáveis de ambiente, banco, scripts, endpoints, exemplos e pendências) está em:

- [`../README.md`](../README.md)

## Comandos rápidos

```bash
npm install
Copy-Item .env.example .env   # PowerShell
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- Build: `npm run build`
- Produção: `npm run start:prod`
- Testes: `npm test`
- Testes e2e: `npm run test:e2e`
- Lint: `npm run lint`
- Checagem de tipos: `npm run typecheck`

## Foto de perfil

- `POST /api/usuarios/me/foto` — JWT obrigatório; envia `multipart/form-data` com o campo `foto` (JPG/JPEG, PNG ou WebP, até 5 MB). O usuário é obtido do token.
- `DELETE /api/usuarios/me/foto` — JWT obrigatório; remove a foto da conta autenticada.
- `GET /api/autenticacao/me` — inclui `foto` como caminho relativo ou `null`.
- Arquivos são salvos em `uploads/usuarios/` com UUID e servidos em `/uploads/usuarios/<uuid>.<extensão>`. A migration adiciona `usuarios.foto VARCHAR(500) NULL`; aplique com `npm run migration:run`.
- A URL da API configurada em `frontend/src/environments/environment*.ts` deve ser acessível pelo dispositivo. No Capacitor, não use `localhost` para acessar o computador; configure o IP/hostname alcançável da API.
