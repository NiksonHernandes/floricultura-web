# floricultura-web

Front da floricultura — SPA Angular (mobile-first) para a gestão interna da floricultura.

> Fundação (M0) entregue pela T-M0-4. Contrato: [`SPEC-M0`](../../squad/specs/SPEC-M0.md).
> Decisões estruturais: `AD-SQ-5` (estrutura de diretórios), `AD-SQ-10` (versões do front),
> `AD-SQ-11` (escopo de testes) — ver `DECISOES.md` do squad.

## Stack

- **Angular 20.x** (componentes **standalone**, sem NgModules).
- **Angular Material 20.x** (tema `azure-blue`, tipografia Roboto).
- **SCSS**, roteamento habilitado, **HttpClient** (`provideHttpClient`).
- **Node ≥ 20 LTS** (validado em Node 22). Gerenciador: **npm** (o `package-lock.json` é versionado).

## Comandos

```bash
npm ci            # instala a partir do package-lock.json (reprodutível)
npm run build     # build de produção -> dist/floricultura-web
npm start         # ng serve em http://localhost:4200
npm test          # ng test (Karma + Jasmine)

# testes headless (CI)
npx ng test --watch=false --browsers=ChromeHeadless
```

## Arquitetura — estrutura feature-based (SPEC-M0 §3.7 · AD-SQ-5)

O código de aplicação vive em `src/app/`, organizado por responsabilidade e por feature
(padrão Angular escalável — não agrupado por tipo técnico):

```
src/app/
├─ core/       # ApiService, interceptors, guards, models (ex.: api-response.model.ts)
│              #   singletons de app-wide. Integração back↔front chega na T-M0-5.
├─ shared/     # componentes/UI reutilizáveis (sem dependência de feature específica)
├─ features/   # uma pasta por domínio: produtos/, estoque/, eventos/, clientes/, ... (vazio em M0)
├─ layout/     # shell/toolbar da aplicação (casca visual)
├─ app.ts            # componente raiz (shell mobile-first com Material)
├─ app.config.ts     # providers standalone (router, HttpClient, animações)
└─ app.routes.ts     # tabela de rotas (as features registram suas rotas aqui)

src/environments/
├─ environment.ts        # dev  — apiBaseUrl: http://localhost:8080/api/v1
└─ environment.prod.ts   # prod — apiBaseUrl definido no deploy (fileReplacements no angular.json)
```

### Convenções

- **Mobile-first (FC-02):** o shell nasce responsivo (Material + `<meta viewport>`); telas de
  negócio entram a partir de M2.
- **Contrato REST base (SPEC-M0 §3.1/§3.5):** toda resposta de `/api/v1/**` usa o envelope
  `{ success, data, error, timestamp, path }`. A interface TypeScript espelho (`ApiResponse<T>`)
  e o `ApiService` base entram na **T-M0-5** (pasta `core/`).
- **URL base da API:** lida de `environment.apiBaseUrl` (dev = `http://localhost:8080/api/v1`).
- **Segredos (FC-15):** nunca em código/commit. `.env` é gitignored; `environment.*.ts` só contém
  URLs públicas, jamais credenciais.

## Escopo do M0 (o que NÃO está aqui ainda)

Sem telas de negócio, sem consumo de API e sem CRUD — M0 é só a fundação/scaffold. O consumo
ponta-a-ponta do `GET /api/v1/health-check` (prova de CORS + envelope) é a **T-M0-5**.
