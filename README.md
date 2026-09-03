# floricultura-web

SPA **Angular (mobile-first)** para a **gestão interna de uma floricultura** — a interface que os
operadores usam no dia a dia (majoritariamente no celular) para cuidar de produtos, estoque, imagens
do catálogo e usuários.

> Back-end (API REST em Java/Spring Boot) no repositório irmão `floricultura-api`. Este front consome
> a API sob `/api/v1`, com um envelope de resposta padronizado.

## A ideia do projeto

Ferramenta **interna** (não é vitrine/e-commerce), pensada para ser rápida e usável no telefone:

- **Login e perfis:** autenticação por JWT; o menu e as telas se adaptam ao papel — **ADMIN**
  (gestão completa, inclusive usuários) e **USER** (operação).
- **Produtos & catálogo:** cadastro/edição/exclusão de produtos, com **imagem** que pode ser um
  link externo **ou** um arquivo enviado do próprio dispositivo (armazenado no banco pela API).
- **Estoque:** movimentações (entrada/saída/ajuste) e histórico das últimas movimentações, com
  alerta de estoque baixo.
- **Mobile-first (FC-02):** ~90% do uso é celular — toda tela é 100% responsiva (drawer no mobile,
  sidenav no desktop; listas paginadas server-side).

## Tecnologias

| Área | Tecnologia |
|---|---|
| Framework | **Angular 20** — componentes **standalone** (sem NgModules), rotas com lazy `loadComponent` |
| UI | **Angular Material 20** + **Angular CDK** |
| Estilo | **SCSS** com tokens de design próprios (`shared/styles/_atelie-tokens.scss`) |
| HTTP / estado assíncrono | **HttpClient** (`provideHttpClient`) + **RxJS** |
| i18n | locale **pt-BR** registrado (datas em `America/Sao_Paulo`) |
| Testes | **Jasmine** + **Karma** (execução headless via ChromeHeadless) |
| Runtime / gestor | **Node ≥ 20 LTS** (validado em 22) · **npm** (`package-lock.json` versionado) |

## Arquitetura — feature-based

O código vive em `src/app/`, organizado por responsabilidade e por feature (padrão Angular
escalável, não agrupado por tipo técnico):

```
src/app/
├─ core/            # singletons app-wide
│  ├─ services/     #   ApiService (envelope), AuthService, ProdutosService
│  ├─ guards/       #   authGuard (exige login), adminGuard (exige ADMIN)
│  ├─ interceptors/ #   authInterceptor (injeta o Bearer; logout no 401)
│  └─ models/       #   api-response, auth, produto (tipos do contrato)
├─ features/        # uma pasta por domínio
│  ├─ auth/         #   login, trocar-senha
│  ├─ usuarios/     #   lista paginada + formulário (ADMIN)
│  ├─ produtos/     #   lista/card, produto-form, movimentar-estoque,
│  │                #   confirmar-exclusao, imagem-produto (carrega o binário do banco)
│  └─ health/       #   prova de integração front↔API
├─ layout/          # shell da aplicação (toolbar + navegação responsiva)
├─ app.ts           # componente raiz
├─ app.config.ts    # providers standalone (router, HttpClient, interceptor, locale pt-BR)
└─ app.routes.ts    # tabela de rotas (login/health fora do shell; demais sob authGuard)

src/environments/
├─ environment.ts        # dev  — apiBaseUrl: http://localhost:8080/api/v1
└─ environment.prod.ts   # prod — apiBaseUrl definido no deploy
```

### Como o front conversa com a API

- **Envelope:** o `ApiService` desembrulha `{ success, data, error, ... }` — as features lidam com
  o `data` já tipado (interface `ApiResponse<T>`).
- **Autenticação:** o `authInterceptor` anexa o token JWT no header `Authorization`. Um `401`
  desloga o usuário; por isso imagens protegidas **nunca** vão em `<img src>` direto ao endpoint.
- **Imagem do produto (padrão importante):** quando o produto tem imagem no banco, o componente
  `imagem-produto` carrega o binário por **HttpClient** (`responseType:'blob'`, com Bearer) e usa
  `URL.createObjectURL` (revogando ao descartar). A prioridade de exibição é **banco → URL externa →
  placeholder botânico**; falha/404 cai no fallback sem quebrar o card nem deslogar.
- **Rotas protegidas:** `login` e `health` ficam fora do shell; o restante fica sob `authGuard`
  (home pós-login = `/produtos`), e `usuarios` exige `adminGuard` (o item some do menu para USER).

### Design

As telas usam tokens de design próprios (`_atelie-tokens.scss`) para não "parecerem template de IA" —
identidade visual é critério de aceite, com evidência em screenshots desktop **e** mobile.

## Comandos

```bash
npm ci            # instala a partir do package-lock.json (reprodutível)
npm start         # ng serve em http://localhost:4200 (espera a API em :8080)
npm run build     # build de produção -> dist/floricultura-web
npm test          # ng test (Karma + Jasmine)

# testes headless (CI)
npx ng test --watch=false --browsers=ChromeHeadless
```

## Convenções

- **Mobile-first:** toda tela responsiva é critério de aceite (o uso é ~90% celular).
- **URL base da API:** lida de `environment.apiBaseUrl` (dev = `http://localhost:8080/api/v1`).
- **Segredos:** nunca em código/commit. `environment.*.ts` só contém URLs públicas, jamais
  credenciais.
- **Datas:** exibidas em pt-BR, fuso `America/Sao_Paulo` (ex.: movimentações em `dd/MM/yyyy HH:mm`).
