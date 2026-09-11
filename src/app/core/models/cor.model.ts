/**
 * Modelo do catálogo de cores (SPEC-M6 §3.2, FC-17) — o vocabulário com que a floricultura
 * descreve a flor. Trafega DENTRO do envelope §3.1 do M0 (`ApiResponse<T>` + `PaginaResponse<T>`;
 * este arquivo NÃO redefine envelope nem paginação).
 *
 * T-M6-06a trouxe a leitura; a T-M6-06b traz o `CorRequest` da escrita, junto do seu consumidor.
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

/**
 * `CorRequest` (§3.2) — mesmo payload no POST e no PUT.
 *
 * ⚠️ `nome` vai **CRU**, exatamente como foi digitado: quem canoniza é o `Cores.canonizar` do back,
 * fonte ÚNICA da regra (§3.2.1/armadilha §12 #22). O front tem só uma PRÉVIA display-only.
 * `hex` em branco vira `null` (= sem amostra); o back o devolve em maiúsculas.
 */
export interface CorRequest {
  nome: string;
  hex: string | null;
}
