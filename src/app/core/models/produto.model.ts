/**
 * Modelos de Produtos & Estoque do front (SPEC-M2 §3.6). Espelham os payloads que
 * trafegam DENTRO do envelope §3.1 do M0 (reusa `ApiResponse<T>`, não redefine envelope).
 *
 * - `PaginaResponse<T>`: contrato de listagem paginada reutilizável (§3.3, AD-SQ-29).
 *   Nasce aqui (1º consumidor = Produtos); o retrofit de Usuários (T-M2-10) reusa este tipo.
 * - `Produto`: item de `PaginaResponse.conteudo` e `data` de GET detalhe (§3.2). `preco`,
 *   `descricao` e `imagemUrl` são anuláveis; `estoqueBaixo` é computado no back (FC-13).
 *   `temImagem` (SPEC-M3 §3.2/§3.6, AD-SQ-37/39) indica se HÁ binário no banco (`bytea`) — o
 *   binário NUNCA trafega no JSON; a exibição prioriza banco → `imagemUrl` → placeholder.
 *
 * Escopo T-M2-7 = leitura (lista + detalhe). A escrita (`ProdutoRequest` + aliases
 * `CriarProdutoRequest`/`AtualizarProdutoRequest`) entra com a T-M2-8 (form). A
 * movimentação chega com a T-M2-9 (sem tipo órfão antes do consumidor).
 */

/** Envelope de listagem paginada — `data` de todo GET de lista (§3.3, AD-SQ-29). */
export interface PaginaResponse<T> {
  conteudo: T[];
  pagina: number;
  tamanho: number;
  totalElementos: number;
  totalPaginas: number;
  primeira: boolean;
  ultima: boolean;
}

/** Enum fixo de unidade (AD-SQ-31): código ASCII persistido; `m3` é exibido `m³` no front. */
export type UnidadeMedida = 'un' | 'kg' | 'saco' | 'm3' | 'l' | 'g';

/**
 * Variante de imagem servida por `GET /produtos/{id}/imagem?tamanho=` (SPEC-M5.2 §3.2/§3.3): `thumb`
 * (~200px, card da lista), `medio` (~800px, "Visualizar produto") e `original` (≤1280px, vitrine/form —
 * **default**, preserva o comportamento M3). Legado sem variante cai no fallback ao original no back.
 */
export type VarianteImagem = 'thumb' | 'medio' | 'original';

/** Porte da planta (SPEC-M6 §3.3). Só `JOVEM`/`ADULTA` aceitam altura — R13/§4.3. */
export type Caracteristica = 'MUDA' | 'JOVEM' | 'ADULTA';

/** Toxicidade TRI-ESTADO por ausência (R8): `null` = não informado — nunca `false` (armadilha #14). */
export type Toxicidade = 'TOXICA' | 'NAO_TOXICA';

/** Necessidade de luz (§3.3) — conjunto: a planta pode aceitar mais de uma condição. */
export type NecessidadeLuz = 'SOL_PLENO' | 'MEIA_SOMBRA' | 'SOMBRA';

/** Cor vinculada ao produto (§3.4): `ReferenciaSimples` + `hex` (`null` = sem amostra cadastrada). */
export interface CorReferencia {
  id: number;
  nome: string;
  hex: string | null;
}

export interface Produto {
  id: number;
  nome: string;
  descricao: string | null;
  unidadeMedida: UnidadeMedida;
  estoqueMinimo: number;
  estoqueAtual: number;
  preco: number | null;
  imagemUrl: string | null;
  estoqueBaixo: boolean;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  /** Há imagem binária no banco (SPEC-M3 §3.2, aditivo — o back sempre envia). */
  temImagem: boolean;
  /**
   * Produto vinculado a ≥1 evento (SPEC-M4 §3.4, aditivo). Vem na LISTA via `@Formula exists(...)`
   * (leve, sem materializar a coleção nem o binário — AD-SQ-38). Opcional no tipo: o back sempre
   * envia, mas fixtures/telas do M2/M3 que não o conhecem seguem válidas (mudança aditiva).
   */
  sazonal?: boolean;
  /**
   * Ids dos eventos vinculados (SPEC-M4 §3.4) — presente **só no detalhe** `GET /{id}`; na lista
   * vem `null`/ausente (evita N+1). Alimenta a pré-seleção do multiselect no `produto-form`.
   */
  eventoIds?: number[] | null;
  /**
   * Atributos botânicos (SPEC-M6 §3.4, aditivos). Os 3 escalares vêm na lista E no detalhe; as
   * duas COLEÇÕES vêm `null` na lista (nenhuma coleção é materializada ali — R11/AD-SQ-38) e só
   * são preenchidas no detalhe `GET /{id}`. `alturaCm` é SEMPRE inteiro em centímetros (R12).
   */
  caracteristica?: Caracteristica | null;
  alturaCm?: number | null;
  toxicidade?: Toxicidade | null;
  necessidadeLuz?: NecessidadeLuz[] | null;
  cores?: CorReferencia[] | null;
}

/**
 * Payload de escrita de produto (§3.2, T-M2-8). `POST /produtos` e `PUT /produtos/{id}`
 * carregam os MESMOS campos — só de cadastro; `estoqueAtual` NUNCA viaja aqui (só muda por
 * movimentação — AD-SQ-30). `descricao`, `preco` e `imagemUrl` são opcionais (ausência = `null`;
 * `preco` ausente = sem preço, AD-SQ-28). `unidadeMedida` ∈ enum fixo (AD-SQ-31).
 */
export interface ProdutoRequest {
  nome: string;
  descricao?: string | null;
  unidadeMedida: UnidadeMedida;
  estoqueMinimo: number;
  preco?: number | null;
  imagemUrl?: string | null;
  /**
   * Vínculos evento↔produto (SPEC-M4 §3.4, aditivo). Semântica de replace-set (AD-SQ-48):
   * presente (inclusive `[]`) ⇒ substitui o conjunto; ausente/`null` ⇒ **não altera**. O
   * `produto-form` só o inclui quando há seleção ou quando o produto já tinha vínculos (permite
   * limpar), preservando os payloads exatos de 6 campos dos specs do M2/M3 (anti-burla).
   */
  eventoIds?: number[];
  /**
   * Atributos botânicos (SPEC-M6 §3.3). Escalares: valor grava, `null` LIMPA. Coleções: replace-set
   * igual a `eventoIds` (AD-SQ-44/48) — presente (inclusive `[]`) substitui; ausente/`null` não
   * altera. O `atributos-botanicos` só inclui o campo quando há valor OU quando o produto já tinha
   * aquele atributo (permite limpar), preservando o payload exato de 6 campos dos specs M2/M3.
   */
  caracteristica?: Caracteristica | null;
  alturaCm?: number | null;
  toxicidade?: Toxicidade | null;
  necessidadeLuz?: NecessidadeLuz[];
  corIds?: number[];
}

/** Alias semântico do payload de criação (`POST /produtos`) — mesma forma de `ProdutoRequest`. */
export type CriarProdutoRequest = ProdutoRequest;

/** Alias semântico do payload de edição (`PUT /produtos/{id}`) — mesma forma de `ProdutoRequest`. */
export type AtualizarProdutoRequest = ProdutoRequest;

/**
 * Movimentação de estoque (§3.2/§3.6, T-M2-9, AD-SQ-30). Tipos do ledger imutável:
 * - `ENTRADA`: soma ao estoque (quantidade > 0).
 * - `SAIDA`: subtrai (quantidade > 0, limitada ao estoque — SAÍDA acima do estoque → 400).
 * - `AJUSTE`: define a quantidade-alvo absoluta (`estoqueAtual = quantidade`, ≥ 0; `0` = "zerar",
 *   FC-08: zerar é ajuste, NÃO é hard delete).
 */
export type TipoMovimentacao = 'ENTRADA' | 'SAIDA' | 'AJUSTE';

/**
 * Tipo do desconto do lançamento (SPEC-M7 §3.2-b): `PERCENTUAL` = 0..100 sobre o total bruto;
 * `VALOR` = reais abatidos direto. `null`/ausente = sem desconto (os dois campos viajam juntos).
 */
export type DescontoTipo = 'PERCENTUAL' | 'VALOR';

/**
 * Request de `POST /produtos/{id}/movimentacoes` (§3.2). `motivo` opcional (≤255).
 *
 * **REVISÃO 2026-09-04 (RF-2/AD-SQ-64) — contraparte opcional por tipo:**
 * - `fornecedorId`: SÓ em `ENTRADA` (de quem veio o abastecimento). Ausente = sem contraparte.
 * - `clienteId`: SÓ em `SAIDA` (para quem foi a saída). Ausente = sem contraparte.
 * - `AJUSTE` nunca leva contraparte. Exclusividade/existência são validadas no back (400 com `field`);
 *   o front só envia o campo do tipo vigente quando há seleção (mutuamente exclusivos).
 *
 * **REVISÃO 2026-09-16 (SPEC-M7 §3.2, aditiva) — valores financeiros, todos OPCIONAIS:**
 * - `valorUnitario`: preço CONGELADO no lançamento (não acompanha `produto.preco` depois).
 * - `descontoTipo` + `descontoValor`: viajam **juntos** ou nenhum dos dois.
 * - `AJUSTE` não aceita nenhum dos três (PA#1/AD-SQ-160 — o back devolve 400 `field=valorUnitario`).
 * - `totalBruto`/`totalFinal` **NÃO existem aqui**: quem calcula é o servidor (§3.2-a), numa linha
 *   que ninguém pode corrigir depois. O front envia os valores já normalizados a 2 casas (§3.2-b1).
 */
export interface MovimentacaoRequest {
  tipo: TipoMovimentacao;
  quantidade: number;
  motivo?: string | null;
  fornecedorId?: number | null;
  clienteId?: number | null;
  valorUnitario?: number | null;
  descontoTipo?: DescontoTipo | null;
  descontoValor?: number | null;
}

/**
 * `MovimentacaoResponse` (§3.2) — `data` do POST e item do histórico (GET). O ledger grava
 * `produtoNome` (snapshot legível mesmo após hard delete → `produtoId=null`), `quantidadeResultante`
 * (estoque após a operação) e `usuarioId` (do autenticado).
 */
export interface Movimentacao {
  id: number;
  produtoId: number | null;
  produtoNome: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  quantidadeResultante: number;
  motivo: string | null;
  usuarioId: number | null;
  /**
   * Nome do autor da movimentação (SPEC-M4 §3.5, aditivo — snapshot desnormalizado). `null` em
   * linhas históricas pré-V7 ou autor desconhecido; o front renderiza `—` (CA-21). Opcional no
   * tipo: mudança aditiva — fixtures/telas do M2 que não o conhecem seguem válidas.
   */
  usuarioNome?: string | null;
  /**
   * Contraparte da movimentação (SPEC-M5 REVISÃO 2026-09-04/AD-SQ-64, aditivo — snapshot do ledger).
   * `ENTRADA` pode trazer `fornecedorId`/`fornecedorNome`; `SAIDA`, `clienteId`/`clienteNome`. O `id`
   * vem `null` após o hard delete (FC-08) do cadastro, mas o `nome` (snapshot) é preservado — o front
   * exibe o nome; se ambos nulos, `—`. Opcionais no tipo: mudança aditiva (fixtures M2/M4 seguem válidas).
   */
  fornecedorId?: number | null;
  fornecedorNome?: string | null;
  clienteId?: number | null;
  clienteNome?: string | null;
  /**
   * Valores financeiros CONGELADOS na linha (SPEC-M7 §3.3, aditivo — 6 campos, todos `null` quando
   * não se aplicam). Vêm do servidor já em `NUMERIC(14,2)` (§3.1-a): **a tela FORMATA, nunca recalcula**
   * — `totalBruto`/`totalFinal` são autoridade do back (§3.2-a), numa linha que ninguém pode corrigir
   * depois. Recalcular `quantidade × valorUnitario` no navegador erraria toda linha com desconto.
   *
   * `null` ≠ `0`: "sem valor informado" (P6, o lançamento sem dinheiro é legítimo) se exibe `—`,
   * enquanto desconto de 100 % é `R$ 0,00` de verdade (§4.4). O desconto efetivo em R$ **não** é campo:
   * é `totalBruto − totalFinal` (§3.1-a — derivável, não duplicado).
   *
   * `estornaMovimentacaoId` aponta para a linha que ESTA linha estorna (§3.4-a); `null` = lançamento
   * comum. O ponteiro é só para frente — "já foi estornada" se descobre pelo 409 (§12 #5).
   * Opcionais no tipo: mudança aditiva, as fixtures do M2/M4/M5 seguem válidas.
   */
  valorUnitario?: number | null;
  descontoTipo?: DescontoTipo | null;
  descontoValor?: number | null;
  totalBruto?: number | null;
  totalFinal?: number | null;
  estornaMovimentacaoId?: number | null;
  criadoEm: string;
}

/** Alias semântico do payload de resposta da movimentação — mesma forma de `Movimentacao`. */
export type MovimentacaoResponse = Movimentacao;

/**
 * Referência leve `{id, nome}` (SPEC-M5 REVISÃO 2026-09-04, R3.5/AD-SQ-66). Usada nos relacionamentos
 * do produto — leitura por NOME (nunca binário/`bytea`; honra AD-SQ-38).
 */
export interface ReferenciaSimples {
  id: number;
  nome: string;
}

/**
 * Relacionamentos derivados do produto (`GET /produtos/{id}/relacionamentos`, R3.5/AD-SQ-66) — para o
 * modal "Visualizar produto" (RF-4/R-CA-10). `eventos` = junção `evento_produto`; `fornecedores` = das
 * ENTRADAS; `clientes` = das SAÍDAS. Cada lista pode vir vazia (a seção só aparece quando há dados).
 */
export interface ProdutoRelacionamentos {
  eventos: ReferenciaSimples[];
  fornecedores: ReferenciaSimples[];
  clientes: ReferenciaSimples[];
}
