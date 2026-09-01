import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { LoginData, LoginRequest, UsuarioSessao } from '../models/auth.model';

/** Chave do token no localStorage (SPEC-M1 §3.6; nota de risco XSS em §9). */
export const TOKEN_KEY = 'floricultura.token';

/**
 * Núcleo de autenticação do front (SPEC-M1 §3.6, CA-13).
 *
 * Consome `/auth/login`, `/auth/me` e `/auth/senha` dentro do envelope §3.1 do M0.
 * O token vive em `localStorage`; o perfil da sessão vive num signal reidratado via
 * `GET /auth/me` no boot (ver `reidratar()` ligado no `app.config.ts`).
 * A `role` é sempre autoritativa do back — o front só a usa para orientar a UX/guardas.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  /** Perfil da sessão corrente (null = anônimo). */
  private readonly _usuarioAtual = signal<UsuarioSessao | null>(null);
  readonly usuarioAtual = this._usuarioAtual.asReadonly();

  /** Está autenticado quando há perfil carregado na sessão. */
  readonly estaAutenticado = computed(() => this._usuarioAtual() !== null);

  /** Deriva o papel ADMIN do perfil corrente (RBAC de UX). */
  readonly ehAdmin = computed(() => this._usuarioAtual()?.role === 'ADMIN');

  /** Token bruto do storage (usado pelo interceptor e guardas). */
  token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /** Autentica; ao sucesso guarda o token e alimenta o perfil da sessão. */
  login(req: LoginRequest): Observable<UsuarioSessao> {
    return this.http
      .post<ApiResponse<LoginData>>(`${this.baseUrl}/auth/login`, req)
      .pipe(
        map((res) => res.data!),
        tap((data) => {
          localStorage.setItem(TOKEN_KEY, data.token);
          this._usuarioAtual.set(data.usuario);
        }),
        map((data) => data.usuario),
      );
  }

  /** Reidrata o perfil da sessão a partir do token vigente. */
  me(): Observable<UsuarioSessao> {
    return this.http
      .get<ApiResponse<UsuarioSessao>>(`${this.baseUrl}/auth/me`)
      .pipe(
        map((res) => res.data!),
        tap((usuario) => this._usuarioAtual.set(usuario)),
      );
  }

  /** Troca da própria senha (§3.2); ao sucesso zera a flag de senha provisória. */
  trocarSenha(senhaAtual: string, novaSenha: string): Observable<void> {
    return this.http
      .patch<void>(`${this.baseUrl}/auth/senha`, { senhaAtual, novaSenha })
      .pipe(
        tap(() => {
          const atual = this._usuarioAtual();
          if (atual) {
            this._usuarioAtual.set({ ...atual, senhaProvisoria: false });
          }
        }),
      );
  }

  /** Logout client-side (JWT stateless, AD-SQ-15): descarta token e perfil. */
  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this._usuarioAtual.set(null);
  }

  /**
   * Reidratação de boot: se há token, tenta carregar o perfil; se falhar
   * (ex.: token expirado/revogado), desloga silenciosamente. Sem token, no-op.
   */
  reidratar(): Observable<UsuarioSessao | null> {
    if (!this.token()) {
      return of(null);
    }
    return this.me().pipe(
      catchError(() => {
        this.logout();
        return of(null);
      }),
    );
  }
}
