/**
 * Modelo do catálogo de cores (SPEC-M6 §3.2, FC-17) — o vocabulário com que a floricultura
 * descreve a flor. Trafega DENTRO do envelope §3.1 do M0 (`ApiResponse<T>` + `PaginaResponse<T>`;
 * este arquivo NÃO redefine envelope nem paginação).
 *
 * Escopo T-M6-06a: só LEITURA. O payload de escrita (`CorRequest`) nasce com o `cor-form`
 * (T-M6-06b) — tipo sem consumidor é código morto (armadilha §12 #34).
 */

/**
 * `CorResponse` (§3.2) — item de lista e detalhe.
 *
 * ⚠️ `nome` JÁ VEM CANÔNICO do back (MAIÚSCULAS, espaço vira hífen — §3.2.1/AD-SQ-90). Não existe
 * "nome de exibição": o front mostra exatamente esta string, sem `titlecase`/`uppercase`/
 * `text-transform` (R1d/CA-40). `hex` é opcional (`null` = cor sem amostra cadastrada) e vem
 * normalizado em maiúsculas (`#C4326B`). `produtosVinculados` é a contagem real de produtos que
 * usam a cor (0 quando ninguém usa) — é o dado que deixa a exclusão honesta ANTES do 409 (P3).
 */
export interface Cor {
  id: number;
  nome: string;
  hex: string | null;
  produtosVinculados: number;
  criadoEm: string;
  atualizadoEm: string;
}
