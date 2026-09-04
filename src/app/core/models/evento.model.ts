/**
 * Modelos de Eventos & Sazonalidade do front (SPEC-M4 §3.2). Espelham os payloads que
 * trafegam DENTRO do envelope §3.1 do M0 (reusa `ApiResponse<T>` e `PaginaResponse<T>` — não
 * redefine envelope nem o contrato de paginação, que nasce em `produto.model.ts`/AD-SQ-29).
 *
 * Escopo da Onda 3 (front): CRUD + lista paginada (T-M4-4/5) e o vínculo N:N informativo lido
 * como `eventoIds` no produto (T-M4-6). O alerta on-read (`/proximos`) é da Onda 4 (T-M4-8) e
 * NÃO entra aqui — sem tipo órfão antes do consumidor.
 */

/**
 * Enum fixo do tipo de evento (AD-SQ-31): código ASCII persistido + `CHECK` no back. Os rótulos
 * pt-BR ("Comemorativa", "Feira"…) são do front (§4.1) — ver `evento-form`.
 */
export type TipoEvento = 'COMEMORATIVA' | 'FEIRA' | 'BENEFICENTE' | 'ENCOMENDA_CLIENTE';

/**
 * `EventoResponse` (§3.2) — item de lista / detalhe / retorno de POST-PUT. `dataUnica` é derivado
 * no back (`dataFim == null`); `dataFim` nulo ⇒ evento de DATA ÚNICA (AD-SQ-43). Datas em
 * `yyyy-MM-dd` (`LocalDate`, sem hora — §9); `criadoEm`/`atualizadoEm` são instantes ISO.
 */
export interface Evento {
  id: number;
  nome: string;
  tipo: TipoEvento;
  dataInicio: string;
  dataFim: string | null;
  dataUnica: boolean;
  repeteTodoAno: boolean;
  descricao: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Payload de escrita de evento (§3.2, POST/PUT). `nome` e `tipo` obrigatórios; `dataInicio`
 * obrigatória; `dataFim` opcional (ausência ⇒ data única); `repeteTodoAno` opcional (default
 * `false`); `descricao` opcional. A regra cruzada `dataFim >= dataInicio` é validada no front
 * (UX) e no back (fonte de verdade — 400 com `FieldErrorItem("dataFim", …)`).
 */
export interface EventoRequest {
  nome: string;
  tipo: TipoEvento;
  dataInicio: string;
  dataFim?: string | null;
  repeteTodoAno?: boolean;
  descricao?: string | null;
}
