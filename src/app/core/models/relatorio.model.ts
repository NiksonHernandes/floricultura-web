/**
 * Modelos do relatório de movimentações (SPEC-M7 §3.7, T-M7-09) — espelho do
 * `RelatorioResponse` do back, campo a campo e na mesma ordem, DENTRO do envelope `ApiResponse<T>`.
 *
 * ⚠️ **Nada aqui é calculado no navegador.** `valor` chega em `NUMERIC(14,2)` e `quantidade` em
 * `NUMERIC(14,3)`; até o `resultadoValor` (`saidas.valor − entradas.valor`, §3.7-a) vem **pronto do
 * servidor**, no resumo E em cada balde. A tela **formata** — ela não soma, não arredonda e não
 * deriva número nenhum (§4.7). Por isso este arquivo não declara nenhum campo que o back não
 * entregue: campo sem fonte real viraria número inventado numa tela de fechamento.
 */

/** Corte dos baldes (§3.7) — conjunto fechado, mesma grafia (e mesma CAIXA) do back. */
export type Granularidade = 'SEMANA' | 'MES';

/** Formato do arquivo em `/relatorios/movimentacoes/export` (§3.8) — sensível a caixa no back. */
export type FormatoExport = 'PDF' | 'XLSX';

/**
 * Totais de um tipo de lançamento num recorte.
 *
 * `lancamentos` conta as linhas que ENTRARAM (as do par estornado ficam de fora, §3.7-d);
 * `valor` soma `total_final` tratando `NULL` como zero — em `ajustes` é sempre `0.00` (PA#1).
 */
export interface TotaisRelatorio {
  lancamentos: number;
  quantidade: number;
  valor: number;
}

/**
 * Totais do intervalo inteiro.
 *
 * `lancamentosEstornadosExcluidos` é quantas **linhas do recorte** ficaram de fora por participarem
 * de um par estornado — **nunca "2 sempre"** (§3.7-d/CA-55). A omissão é **declarada** na tela
 * (nota de rodapé, CA-49): relatório que esconde o que tirou da conta mente por omissão (PA#3).
 */
export interface ResumoRelatorio {
  entradas: TotaisRelatorio;
  saidas: TotaisRelatorio;
  ajustes: TotaisRelatorio;
  resultadoValor: number;
  lancamentosEstornadosExcluidos: number;
}

/** Um balde da série contínua. `inicio`/`fim` vêm RECORTADOS por `de`/`ate` nas pontas (CA-22). */
export interface PeriodoRelatorio {
  inicio: string;
  fim: string;
  entradas: TotaisRelatorio;
  saidas: TotaisRelatorio;
  ajustes: TotaisRelatorio;
  resultadoValor: number;
}

/** `data` do `GET /api/v1/relatorios/movimentacoes` (§3.7). Balde vazio vem com zeros (CA-21). */
export interface Relatorio {
  de: string;
  ate: string;
  granularidade: Granularidade;
  resumo: ResumoRelatorio;
  periodos: PeriodoRelatorio[];
}
