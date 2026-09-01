/**
 * Modelos de autenticação do front (SPEC-M1 §3.6). Espelham os payloads de
 * `/auth/login` e `/auth/me` que trafegam DENTRO do envelope §3.1 do M0.
 *
 * - `UsuarioSessao`: perfil da sessão corrente (o que o front precisa para RBAC/UX).
 *   A `role` vem da resposta do login / `GET /auth/me` — NUNCA do token (minimização, §3.3).
 * - `Usuario`: linha administrativa completa (usada pela gestão de usuários, T-M1-9).
 */
export interface LoginRequest {
  email: string;
  senha: string;
}

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  role: 'ADMIN' | 'USER';
  senhaProvisoria: boolean;
}

export interface LoginData {
  token: string;
  tokenType: string;
  expiresIn: number;
  usuario: UsuarioSessao;
}

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: 'ADMIN' | 'USER';
  ativo: boolean;
  senhaProvisoria: boolean;
  criadoEm: string;
}
