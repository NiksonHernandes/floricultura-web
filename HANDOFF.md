# Executar a Floricultura localmente

## 1. Pré-requisitos

- Docker Desktop instalado e em execução (Linux: Docker Engine + Compose).
- Internet na primeira execução para baixar imagens e dependências.
- Os dois repositórios na mesma pasta, com estes nomes:

```text
projeto/
├── floricultura-api/
└── floricultura-web/
```

## 2. Iniciar

No terminal, dentro de `floricultura-web`:

```bash
docker compose up --build -d --wait
```

A primeira execução pode levar alguns minutos. O banco e suas tabelas são criados automaticamente. Não é necessário instalar Node, Java ou PostgreSQL no computador.

## 3. Acessar

Abra **http://localhost:4200**.

- E-mail: **admin@floricultura.local**
- Senha: **admin**

Esta configuração e essas credenciais são exclusivamente para validação local.

Opcional: carregar produtos, contatos e eventos fictícios para explorar as telas:

```bash
docker compose --profile demo run --rm demo
```

## 4. Parar e iniciar novamente

```bash
docker compose stop
docker compose start
```

Os dados permanecem salvos no volume Docker.

## Se não abrir

```bash
docker compose ps
docker compose logs --tail=80 api web db
```

Aguarde a API terminar de iniciar e atualize a página. As portas **4200**, **8080** e **5434** precisam estar livres. Se usava a versão com `npm start` ou Java direto, encerre esses processos antes de iniciar o Docker.
