import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Fornecedor, FornecedorRequest } from '../../core/models/fornecedor.model';

/**
 * Serviço de Fornecedores (SPEC-M5 §3.4/§3.6, T-M5-6) — espelho fiel de `ClientesService`/
 * `EventosService` (os dois cadastros são simétricos, §3).
 *
 * Consome `/api/v1/fornecedores` DENTRO do envelope §3.1 do M0 (reusa `ApiResponse<T>` e o contrato
 * paginado `PaginaResponse<T>`, AD-SQ-29). LEITURA (USER+ADMIN): `GET /fornecedores` (paginado +
 * filtro por nome) e `GET /fornecedores/{id}` (traz `produtoIds`). ESCRITA (ADMIN, RBAC no back —
 * FC-07): `POST`/`PUT`/`DELETE`. O front só orienta a UX; o RBAC efetivo é do servidor.
 */
/**
 * REVISÃO 2026-09-05 (SPEC-M5.1 HISTÓRIA #5/AD-SQ-72): deixa de ser `providedIn:'root'` e passa a ser
 * provido no `app.config` — MESMO padrão do `EventosService`. Assim `produtos`/`produto-form` podem
 * optar por NÃO carregá-lo nos seus testes (inject **opcional → null** nos specs do M2/M3), preservando
 * a anti-burla (nenhum `GET /fornecedores` dispara sem registro). A app real resolve pelo provider do
 * `app.config`; os specs que USAM o serviço já o provêm explicitamente (fornecedores/movimentar).
 */
@Injectable()
export class FornecedoresService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/fornecedores`;

  /**
   * GET /fornecedores?pagina&tamanho&nome → página de fornecedores (§3.4, 0-based; ordem `nome ASC`
   * no back; itens da lista com `produtoIds=null`). `nome` só entra no request quando há filtro.
   */
  listar(pagina: number, tamanho: number, nome?: string): Observable<PaginaResponse<Fornecedor>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    const termo = nome?.trim();
    if (termo) {
      params = params.set('nome', termo);
    }
    return this.http
      .get<ApiResponse<PaginaResponse<Fornecedor>>>(this.baseUrl, { params })
      .pipe(map((r) => r.data!));
  }

  /** GET /fornecedores/{id} → detalhe com `produtoIds` (inexistente → 404 tratado pelo chamador). */
  detalhar(id: number): Observable<Fornecedor> {
    return this.http.get<ApiResponse<Fornecedor>>(`${this.baseUrl}/${id}`).pipe(map((r) => r.data!));
  }

  /** POST /fornecedores → 201 com o `FornecedorResponse` criado (ADMIN). 400/403 pelo chamador. */
  criar(req: FornecedorRequest): Observable<Fornecedor> {
    return this.http.post<ApiResponse<Fornecedor>>(this.baseUrl, req).pipe(map((r) => r.data!));
  }

  /** PUT /fornecedores/{id} → 200 com o fornecedor atualizado (ADMIN, replace-set §4.2). 400/403/404 pelo chamador. */
  atualizar(id: number, req: FornecedorRequest): Observable<Fornecedor> {
    return this.http
      .put<ApiResponse<Fornecedor>>(`${this.baseUrl}/${id}`, req)
      .pipe(map((r) => r.data!));
  }

  /**
   * DELETE /fornecedores/{id} → hard delete (204 sem corpo, FC-08, IRREVERSÍVEL). O `ON DELETE
   * CASCADE` limpa os vínculos em `fornecedor_produto` sem tocar os produtos (§4.3). A confirmação
   * explícita (com o nome) é do front (`confirmar-exclusao`); 403/404 tratados pelo chamador.
   */
  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
