// Dados fictícios para validar a instalação local. Reexecutar não duplica cadastros.
const base = process.env.API_URL || "http://localhost:8080/api/v1";
if (!["localhost", "127.0.0.1", "api"].includes(new URL(base).hostname)) {
  throw new Error("A demonstração só pode ser carregada no ambiente local.");
}
let token;
async function api(path, method = "GET", data) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`${method} ${path}: HTTP ${r.status}`);
  return r.status === 204 ? null : (await r.json()).data;
}
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    token = (
      await api("/auth/login", "POST", {
        email: "admin@floricultura.local",
        senha: "admin",
      })
    ).token;
    break;
  } catch (error) {
    if (attempt === 59) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
async function ensure(path, data) {
  const list = await api(
    `${path}?pagina=0&tamanho=100&nome=${encodeURIComponent(data.nome)}`,
  );
  const existing = list.conteudo.find((item) => item.nome === data.nome);
  return existing || api(path, "POST", data);
}
const fornecedor = await ensure("/fornecedores", {
  nome: "Viveiro Jardim da Serra",
  email: "viveiro@example.com",
  observacoes: "Cadastro fictício para demonstração local.",
});
for (const nome of [
  "Marina Oliveira",
  "Clara Fernandes",
  "Estúdio Casa Verde",
  "Café Jardim",
]) {
  await ensure("/clientes", {
    nome,
    observacoes: "Cadastro fictício para demonstração local.",
  });
}
const today = new Date();
const date = (days) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const primavera = await ensure("/eventos", {
  nome: "Festival de Primavera",
  tipo: "FEIRA",
  dataInicio: date(7),
  dataFim: date(9),
  descricao: "Evento fictício para demonstração local.",
});
await ensure("/eventos", {
  nome: "Oficina de arranjos naturais",
  tipo: "COMEMORATIVA",
  dataInicio: date(15),
  descricao: "Evento fictício para demonstração local.",
});
const products = [
  [
    "Orquídea Phalaenopsis",
    "Elegância em cada pétala. Vaso com duas hastes.",
    89.9,
    4,
    5,
    "MEIA_SOMBRA",
  ],
  [
    "Costela-de-adão",
    "Folhagem escultural para dar vida aos ambientes.",
    74.9,
    12,
    4,
    "MEIA_SOMBRA",
  ],
  [
    "Buquê de rosas",
    "Uma seleção delicada de rosas para presentear.",
    129.9,
    3,
    5,
    "MEIA_SOMBRA",
  ],
  [
    "Lírio-da-paz",
    "Flores brancas e folhas verdes em perfeita harmonia.",
    49.9,
    18,
    5,
    "SOMBRA",
  ],
  [
    "Lavanda",
    "Perfume suave e um toque de cor para o jardim.",
    32.9,
    2,
    4,
    "SOL_PLENO",
  ],
  [
    "Jiboia",
    "Folhas pendentes, beleza natural e fácil cuidado.",
    29.9,
    24,
    5,
    "MEIA_SOMBRA",
  ],
  [
    "Suculenta Echeveria",
    "Pequenos detalhes que transformam o seu espaço.",
    18.9,
    32,
    8,
    "SOL_PLENO",
  ],
  [
    "Antúrio",
    "Flores marcantes para um ambiente cheio de vida.",
    59.9,
    8,
    3,
    "MEIA_SOMBRA",
  ],
];
for (const [nome, descricao, preco, estoque, estoqueMinimo, luz] of products) {
  const list = await api(
    `/produtos?pagina=0&tamanho=100&nome=${encodeURIComponent(nome)}`,
  );
  if (list.conteudo.some((p) => p.nome === nome)) continue;
  const p = await api("/produtos", "POST", {
    nome,
    descricao,
    preco,
    estoqueMinimo,
    unidadeMedida: "un",
    necessidadeLuz: [luz],
    eventoIds: nome === "Buquê de rosas" ? [primavera.id] : [],
  });
  await api(`/produtos/${p.id}/movimentacoes`, "POST", {
    tipo: "ENTRADA",
    quantidade: estoque,
    fornecedorId: fornecedor.id,
    motivo: "Estoque fictício para demonstração local",
  });
}
console.log(
  "Demonstração carregada: produtos, estoque, contatos e eventos fictícios.",
);
