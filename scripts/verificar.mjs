import assert from "node:assert/strict";
// Smoke funcional contra a API local. Somente cadastros criados aqui são excluídos.
const base = process.env.API_URL || "http://localhost:8080/api/v1";
assert.ok(
  ["localhost", "127.0.0.1", "api"].includes(new URL(base).hostname),
  "Use somente a instalação local.",
);
let token;
let checks = 0;
const cleanup = [];
async function call(
  path,
  method = "GET",
  body,
  expected = 200,
  bearer = token,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  assert.equal(
    r.status,
    expected,
    `${method} ${path}: ${r.status} (esperado ${expected})`,
  );
  checks++;
  if (expected === 204) return null;
  const result = await r.json();
  return result.data;
}
const suffix = Date.now();
try {
  const login = await call("/auth/login", "POST", {
    email: "admin@floricultura.local",
    senha: "admin",
  });
  token = login.token;
  const me = await call("/auth/me");
  assert.equal(me.role, "ADMIN");
  await call(
    "/auth/login",
    "POST",
    { email: "admin@floricultura.local", senha: "incorreta" },
    401,
  );
  const cliente = await call(
    "/clientes",
    "POST",
    { nome: `QA Cliente ${suffix}`, email: "qa@example.com" },
    201,
  );
  cleanup.push(["/clientes/" + cliente.id, "DELETE"]);
  await call("/clientes/" + cliente.id, "PUT", {
    nome: `QA Cliente ${suffix}`,
    telefone: "11999999999",
    email: "qa@example.com",
  });
  const fornecedor = await call(
    "/fornecedores",
    "POST",
    { nome: `QA Fornecedor ${suffix}` },
    201,
  );
  cleanup.push(["/fornecedores/" + fornecedor.id, "DELETE"]);
  const cor = await call(
    "/cores",
    "POST",
    { nome: `QA Cor ${suffix}`, hex: "#aaccbb" },
    201,
  );
  cleanup.push(["/cores/" + cor.id, "DELETE"]);
  const evento = await call(
    "/eventos",
    "POST",
    { nome: `QA Evento ${suffix}`, tipo: "FEIRA", dataInicio: "2026-12-01" },
    201,
  );
  cleanup.push(["/eventos/" + evento.id, "DELETE"]);
  const payload = {
    nome: `QA Produto ${suffix}`,
    unidadeMedida: "un",
    estoqueMinimo: 3,
    preco: 49.9,
    eventoIds: [evento.id],
    corIds: [cor.id],
    necessidadeLuz: ["MEIA_SOMBRA"],
    caracteristica: "ADULTA",
    alturaCm: 40,
  };
  const produto = await call("/produtos", "POST", payload, 201);
  const path = "/produtos/" + produto.id;
  cleanup.push([path, "DELETE"]);
  assert.equal(produto.estoqueAtual, 0);
  await call(path, "PUT", { ...payload, preco: 54.9 });
  const entrada = await call(
    path + "/movimentacoes",
    "POST",
    { tipo: "ENTRADA", quantidade: 10, fornecedorId: fornecedor.id },
    201,
  );
  assert.equal(entrada.quantidadeResultante, 10);
  await call(
    path + "/movimentacoes",
    "POST",
    { tipo: "SAIDA", quantidade: 11 },
    400,
  );
  const saida = await call(
    path + "/movimentacoes",
    "POST",
    { tipo: "SAIDA", quantidade: 8, clienteId: cliente.id },
    201,
  );
  assert.equal(saida.quantidadeResultante, 2);
  const detail = await call(path);
  assert.equal(detail.estoqueBaixo, true);
  assert.equal(detail.cores[0].id, cor.id);
  const relations = await call(path + "/relacionamentos");
  assert.equal(relations.clientes[0].id, cliente.id);
  assert.equal(relations.fornecedores[0].id, fornecedor.id);
  const low = await call(
    `/produtos?pagina=0&tamanho=12&estoque=BAIXO&nome=QA%20Produto%20${suffix}`,
  );
  assert.equal(low.totalElementos, 1);
  const image = new FormData();
  image.append(
    "arquivo",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "qa.png",
  );
  await call(path + "/imagem", "POST", image);
  const photo = await fetch(base + path + "/imagem?tamanho=thumb", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(photo.status, 200);
  assert.ok(photo.headers.get("content-type").startsWith("image/"));
  checks++;
  await call(path + "/imagem", "DELETE", undefined, 204);
  const user = await call(
    "/usuarios",
    "POST",
    {
      nome: `QA Operação ${suffix}`,
      email: `qa-${suffix}@example.com`,
      senha: "Teste-local-123",
    },
    201,
  );
  cleanup.push(["/usuarios/" + user.id + "/status", "PATCH", { ativo: false }]);
  const operator = await call("/auth/login", "POST", {
    email: user.email,
    senha: "Teste-local-123",
  });
  await call(
    "/produtos?pagina=0&tamanho=1",
    "GET",
    undefined,
    200,
    operator.token,
  );
  await call("/produtos", "POST", payload, 403, operator.token);
  await call(
    "/usuarios?pagina=0&tamanho=1",
    "GET",
    undefined,
    403,
    operator.token,
  );
  await call(
    "/auth/senha",
    "PATCH",
    { senhaAtual: "Teste-local-123", novaSenha: "Teste-local-456" },
    204,
    operator.token,
  );
  await call("/auth/login", "POST", {
    email: user.email,
    senha: "Teste-local-456",
  });
  await call(
    "/usuarios/" + user.id + "/senha",
    "PATCH",
    { novaSenha: "Teste-local-789" },
    204,
  );
  await call(
    "/usuarios/" + user.id + "/status",
    "PATCH",
    { ativo: false },
    200,
  );
  await call(
    "/auth/login",
    "POST",
    { email: user.email, senha: "Teste-local-789" },
    401,
  );
  console.log(
    `OK: ${checks} verificações reais — autenticação, permissões, cadastros, vínculos, filtros, estoque e imagem.`,
  );
} finally {
  for (const [path, method, body] of cleanup.reverse()) {
    try {
      await call(path, method, body, method === "PATCH" ? 200 : 204);
    } catch (error) {
      console.error(`Limpeza pendente: ${path}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
