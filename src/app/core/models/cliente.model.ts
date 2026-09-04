/**
 * Modelos de Clientes do front (SPEC-M5 §3.3/§3.6). Espelham os payloads que trafegam DENTRO do
 * envelope §3.1 do M0 (reusa `ApiResponse<T>` e `PaginaResponse<T>` — NÃO redefine envelope nem o
 * contrato de paginação, que nasce em `produto.model.ts`/AD-SQ-29).
 *
 * Escopo T-M5-6 (front plumbing): tipos do CRUD + lista paginada. A lista/form (T-M5-7/T-M5-8)
 * apenas consomem estes tipos — sem tipo órfão antes do consumidor.
 *
 * LGPD (minimização — SPEC-M5 §9): só `nome/telefone/email/observacoes`; SEM CPF/CNPJ, SEM endereço.
 */

/**
 * `ClienteResponse` (§3.3) — item de lista / detalhe / retorno de POST-PUT. `telefone`, `email` e
 * `observacoes` são anuláveis. `produtoIds` (vínculo N:N informativo, AD-SQ-44) vem SÓ no detalhe
 * `GET /{id}` e no retorno de POST/PUT; na LISTA vem `null` (nunca materializa o vínculo —
 * AD-SQ-38/44). `criadoEm`/`atualizadoEm` são instantes ISO.
 */
export interface Cliente {
  id: number;
  nome: string;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  produtoIds: number[] | null;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Payload de escrita de cliente (§3.3, POST/PUT). Só `nome` obrigatório (1..150); `telefone` (≤40,
 * string livre), `email` (formato válido quando presente, ≤180) e `observacoes` (≤500) opcionais.
 * `produtoIds` opcional com semântica de replace-set (AD-SQ-48): presente (inclusive `[]`) substitui
 * o conjunto; ausente/`null` NÃO altera. O front sempre envia o campo (§4.2).
 */
export interface ClienteRequest {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
  produtoIds?: number[];
}
