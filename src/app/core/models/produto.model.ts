/**
 * Modelos de Produtos & Estoque do front (SPEC-M2 §3.6). Espelham os payloads que
 * trafegam DENTRO do envelope §3.1 do M0 (reusa `ApiResponse<T>`, não redefine envelope).
 *
 * - `PaginaResponse<T>`: contrato de listagem paginada reutilizável (§3.3, AD-SQ-29).
 *   Nasce aqui (1º consumidor = Produtos); o retrofit de Usuários (T-M2-10) reusa este tipo.
 * - `Produto`: item de `PaginaResponse.conteudo` e `data` de GET detalhe (§3.2). `preco`,
 *   `descricao` e `imagemUrl` são anuláveis; `estoqueBaixo` é computado no back (FC-13).
 *
 * Escopo T-M2-7 = leitura (lista + detalhe). Os tipos de escrita (`ProdutoRequest`) e de
 * movimentação vêm com seus consumidores nas T-M2-8/T-M2-9 (sem tipo órfão agora).
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
