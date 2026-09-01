import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { Usuario } from '../../core/models/auth.model';

/**
 * Payload de criação de usuário (SPEC-M1 §3.2 POST /usuarios).
 * Regra do dono: todo cadastro nasce `USER` — o front NÃO envia `role`; o back grava USER.
 */
export interface CriarUsuarioRequest {
  nome: string;
  email: string;
  senha: string;
}

/**
 * Serviço da gestão de usuários (SPEC-M1 §3.1, T-M1-9, CA-14).
 *
 * Consome os 5 endpoints de `/usuarios` DENTRO do envelope §3.1 do M0 (reusa
 * `ApiResponse<T>`; não redefine envelope). Os endpoints do back (T-M1-4/5) ainda não
 * existem — os componentes/testes exercitam este serviço via `HttpTestingController`.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/usuarios`;

  /** GET /usuarios → lista completa (o back ordena por nome; §3.2). */
  listar(): Observable<Usuario[]> {
    return this.http.get<ApiResponse<Usuario[]>>(this.baseUrl).pipe(map((r) => r.data ?? []));
  }

  /** GET /usuarios/{id} → detalhe (inexistente → 404 tratado pelo chamador). */
  detalhar(id: number): Observable<Usuario> {
    return this.http.get<ApiResponse<Usuario>>(`${this.baseUrl}/${id}`).pipe(map((r) => r.data!));
  }

  /** POST /usuarios → 201 com o UsuarioResponse criado (409 e-mail dup / 400 validação). */
  criar(req: CriarUsuarioRequest): Observable<Usuario> {
    return this.http.post<ApiResponse<Usuario>>(this.baseUrl, req).pipe(map((r) => r.data!));
  }

  /** PATCH /usuarios/{id}/status → UsuarioResponse atualizado (409 último-admin). */
  alterarStatus(id: number, ativo: boolean): Observable<Usuario> {
    return this.http
      .patch<ApiResponse<Usuario>>(`${this.baseUrl}/${id}/status`, { ativo })
      .pipe(map((r) => r.data!));
  }

  /** PATCH /usuarios/{id}/senha → 204 (reset por ADMIN; define a nova senha — não força troca, AD-SQ-24/26). */
  resetarSenha(id: number, novaSenha: string): Observable<void> {
    return this.http
      .patch<void>(`${this.baseUrl}/${id}/senha`, { novaSenha })
      .pipe(map(() => void 0));
  }
}
