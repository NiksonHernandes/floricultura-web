import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Evento, EventoRequest } from '../../core/models/evento.model';

/**
 * Serviço de Eventos (SPEC-M4 §3.2, T-M4-4/5).
 *
 * Consome `/api/v1/eventos` DENTRO do envelope §3.1 do M0 (reusa `ApiResponse<T>` e o contrato
 * paginado `PaginaResponse<T>`, AD-SQ-29 — mesmo padrão de `ProdutosService`). LEITURA (USER+ADMIN):
 * `GET /eventos` (paginado + filtro por nome) e `GET /eventos/{id}`. ESCRITA (ADMIN, RBAC no back —
 * FC-07): `POST`/`PUT`/`DELETE`. O front só orienta a UX; o RBAC efetivo é do servidor.
 *
 * **Provido no `appConfig`** (não `providedIn:'root'`) de propósito: assim o `produto-form`/`produtos`
 * podem optar por NÃO carregar eventos nos seus testes (inject opcional → null), mantendo os specs
 * do M2/M3 intactos (anti-burla), enquanto a app real resolve o serviço normalmente.
 */
@Injectable()
export class EventosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/eventos`;

  /**
   * GET /eventos?pagina&tamanho&nome → página de eventos (§3.2, 0-based; ordem `dataInicio ASC,
   * nome ASC` no back). `nome` só entra no request quando há filtro (evita `nome=` vazio na URL).
   */
  listar(pagina: number, tamanho: number, nome?: string): Observable<PaginaResponse<Evento>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    const termo = nome?.trim();
    if (termo) {
      params = params.set('nome', termo);
    }
    return this.http
      .get<ApiResponse<PaginaResponse<Evento>>>(this.baseUrl, { params })
      .pipe(map((r) => r.data!));
  }

  /** GET /eventos/{id} → detalhe (inexistente → 404 tratado pelo chamador). */
  detalhar(id: number): Observable<Evento> {
    return this.http.get<ApiResponse<Evento>>(`${this.baseUrl}/${id}`).pipe(map((r) => r.data!));
  }

  /** POST /eventos → 201 com o `EventoResponse` criado (ADMIN). 400 (validação)/403 pelo chamador. */
  criar(req: EventoRequest): Observable<Evento> {
    return this.http.post<ApiResponse<Evento>>(this.baseUrl, req).pipe(map((r) => r.data!));
  }

  /** PUT /eventos/{id} → 200 com o evento atualizado (ADMIN). 400/403/404 pelo chamador. */
  atualizar(id: number, req: EventoRequest): Observable<Evento> {
    return this.http
      .put<ApiResponse<Evento>>(`${this.baseUrl}/${id}`, req)
      .pipe(map((r) => r.data!));
  }

  /**
   * DELETE /eventos/{id} → hard delete (204 sem corpo, FC-08, IRREVERSÍVEL). O `ON DELETE CASCADE`
   * limpa os vínculos em `evento_produto` sem tocar os produtos (§4.1). A confirmação explícita
   * (com o nome) é do front (`confirmar-exclusao`); 403/404 tratados pelo chamador.
   */
  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
