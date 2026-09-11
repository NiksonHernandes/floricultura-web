import { Caracteristica, NecessidadeLuz, Toxicidade } from './produto.model';

/**
 * Filtros e ordenação server-side de `GET /produtos` (SPEC-M6 §3.6, T-M6-05a/05b).
 *
 * Este arquivo é o espelho 1:1 dos query params do contrato — `pagina`/`tamanho`/`nome` ficam de
 * fora de propósito: são da lista-mãe desde o M2 (paginador + campo de busca), não da barra.
 *
 * ⚠️ **CAIXA É CONTRATO.** Os literais viajam EXATAMENTE como estão aqui (`BAIXO`, `MUDA`,
 * `TOXICA`, `SOL_PLENO`…). A nota da revisão 17 do §3.6 (AD-SQ-127) é explícita: o back só tolera
 * caixa em `ordenarPor`/`direcao`; nos demais a comparação é exata e `baixo` vira **400**. Nada
 * aqui pode depender dessa tolerância.
 *
 * ⚠️ **Repetível é repetido, nunca CSV.** `corIds`, `eventoIds`, `caracteristica`, `toxicidade` e
 * `luz` são listas cujo operador interno é **OU**; entre dimensões diferentes o operador é **E**.
 * Na URL isso é `?corIds=3&corIds=7` (`HttpParams.append`) — `?corIds=3,7` não é o contrato.
 */

/**
 * Atalhos de estoque (§3.6). **NÃO são uma partição:** `SEM_ESTOQUE` ⊂ `BAIXO`, porque `BAIXO` usa
 * a mesma regra do selo `estoqueBaixo` (`estoqueAtual <= estoqueMinimo`, FC-13) e ela inclui o zero.
 * A tela é obrigada a dizer isso (§3.6) — o hint vive no `filtros-produtos.html`.
 */
export type EstoqueFiltro = 'SEM_ESTOQUE' | 'BAIXO' | 'COM_ESTOQUE';

/** Coluna de ordenação (§3.6): default `nome`; `preco` ordena sempre com NULLS LAST no back. */
export type OrdenarProdutoPor = 'nome' | 'estoque' | 'preco';

/** Sentido da ordenação (§3.6): default `asc`. */
export type DirecaoOrdem = 'asc' | 'desc';

/** Estado completo da barra de filtros (§3.14). Vazio = nenhum param extra na URL. */
export interface FiltroProdutos {
  corIds: number[];
  eventoIds: number[];
  caracteristica: Caracteristica[];
  toxicidade: Toxicidade[];
  luz: NecessidadeLuz[];
  estoque: EstoqueFiltro | null;
  /** Inclusivo (`preco >= precoMin`). `precoMin > precoMax` → **400** com `field:"precoMin"`. */
  precoMin: number | null;
  /** Inclusivo (`preco <= precoMax`). */
  precoMax: number | null;
  /** Só produtos sem preço definido. `true` + faixa → **400** (`field:"semPreco"`). */
  semPreco: boolean;
  ordenarPor: OrdenarProdutoPor;
  direcao: DirecaoOrdem;
}

/** Estado neutro: nenhum filtro, ordenação no default do contrato (`nome`/`asc`). */
export const FILTRO_VAZIO: FiltroProdutos = Object.freeze({
  corIds: [],
  eventoIds: [],
  caracteristica: [],
  toxicidade: [],
  luz: [],
  estoque: null,
  precoMin: null,
  precoMax: null,
  semPreco: false,
  ordenarPor: 'nome',
  direcao: 'asc',
});

/**
 * Quantos FILTROS estão ativos (o N de "Limpar filtros (N)" e de "Filtros (N)").
 *
 * A **ordenação não conta**: ela sempre tem um valor e nunca deixa de casar um produto — chamá-la
 * de filtro faria o contador nascer em 1 e o botão "limpar" aparecer numa tela sem filtro nenhum.
 * A faixa de preço conta como **um** filtro mesmo com as duas pontas preenchidas (é um intervalo).
 */
export function contarFiltros(f: FiltroProdutos): number {
  return (
    (f.corIds.length > 0 ? 1 : 0) +
    (f.eventoIds.length > 0 ? 1 : 0) +
    (f.caracteristica.length > 0 ? 1 : 0) +
    (f.toxicidade.length > 0 ? 1 : 0) +
    (f.luz.length > 0 ? 1 : 0) +
    (f.estoque !== null ? 1 : 0) +
    (f.precoMin !== null || f.precoMax !== null ? 1 : 0) +
    (f.semPreco ? 1 : 0)
  );
}
