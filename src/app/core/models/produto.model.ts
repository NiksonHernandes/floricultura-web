/**
 * Modelos de Produtos & Estoque do front (SPEC-M2 §3.6). Espelham os payloads que
 * trafegam DENTRO do envelope §3.1 do M0 (reusa `ApiResponse<T>`, não redefine envelope).
 *
 * - `PaginaResponse<T>`: contrato de listagem paginada reutilizável (§3.3, AD-SQ-29).
 *   Nasce aqui (1º consumidor = Produtos); o retrofit de Usuários (T-M2-10) reusa este tipo.
 * - `Produto`: item de `PaginaResponse.conteudo` e `data` de GET detalhe (§3.2). `preco`,
 *   `descricao` e `imagemUrl` são anuláveis; `estoqueBaixo` é computado no back (FC-13).
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
}

/** Alias semântico do payload de criação (`POST /produtos`) — mesma forma de `ProdutoRequest`. */
export type CriarProdutoRequest = ProdutoRequest;

/** Alias semântico do payload de edição (`PUT /produtos/{id}`) — mesma forma de `ProdutoRequest`. */
export type AtualizarProdutoRequest = ProdutoRequest;
