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
 * `FornecedorResponse` (§3.3 + REVISÃO 2026-09-04/AD-SQ-65) — item de lista / detalhe / retorno de
 * POST-PUT. `telefone`, `email` e `observacoes` anuláveis. `produtoIds` agora é **DERIVADO da
 * movimentação** (read-only; produtos das ENTRADAS deste fornecedor): vem SÓ no detalhe e no retorno de
 * POST/PUT; na LISTA vem `null` (AD-SQ-38). O form NÃO usa este campo (RF-1). `criadoEm`/`atualizadoEm` ISO.
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
 * **REVISÃO 2026-09-04 (RF-1/AD-SQ-65):** `produtoIds` REMOVIDO — o vínculo fornecedor↔produto deixou
 * de ser junção editável no cadastro e passou a ser DERIVADO da movimentação (ENTRADAS). O form não
 * escreve mais vínculo.
 */
export interface FornecedorRequest {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
}
