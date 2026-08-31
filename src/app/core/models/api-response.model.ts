/**
 * Envelope de resposta de TODA rota /api/v1/** do back (SPEC-M0 §3.1/§3.5).
 * Espelha exatamente os records Java ApiResponse<T> / ApiError do contrato.
 *
 * - sucesso: `success: true`, `error: null`.
 * - erro:    `success: false`, `data: null`, `error` preenchido.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  timestamp: string;
  path: string;
}

export interface ApiError {
  code: string;
  message: string;
  details: { field: string; message: string }[];
}
