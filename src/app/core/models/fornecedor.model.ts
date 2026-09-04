/**
 * Modelos de Fornecedores do front (SPEC-M5 §3.3/§3.6) — espelho fiel de `cliente.model.ts` (os dois
 * cadastros são simétricos, §3). Trafegam DENTRO do envelope §3.1 do M0 (reusa `ApiResponse<T>` e
 * `PaginaResponse<T>` — NÃO redefine envelope nem paginação).
 *
 * Escopo T-M5-6 (front plumbing): tipos do CRUD + lista paginada. Lista/form (T-M5-9/T-M5-10) só
 * consomem estes tipos.
 *
 * LGPD (minimização — SPEC-M5 §9): só `nome/telefone/email/observacoes`; SEM CPF/CNPJ, SEM endereço.
 */

/**
 * `FornecedorResponse` (§3.3) — item de lista / detalhe / retorno de POST-PUT. `telefone`, `email` e
 * `observacoes` anuláveis. `produtoIds` (vínculo N:N informativo, AD-SQ-44) vem SÓ no detalhe e no
 * retorno de POST/PUT; na LISTA vem `null` (AD-SQ-38/44). `criadoEm`/`atualizadoEm` instantes ISO.
 */
export interface Fornecedor {
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
 * Payload de escrita de fornecedor (§3.3, POST/PUT). Só `nome` obrigatório (1..150); `telefone` (≤40,
 * string livre), `email` (formato válido quando presente, ≤180) e `observacoes` (≤500) opcionais.
 * `produtoIds` opcional com semântica de replace-set (AD-SQ-48): presente (inclusive `[]`) substitui;
 * ausente/`null` NÃO altera. O front sempre envia o campo (§4.2).
 */
export interface FornecedorRequest {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
  produtoIds?: number[];
}
