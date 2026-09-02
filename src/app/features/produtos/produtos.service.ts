import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../core/models/produto.model';

/**
 * Serviço de Produtos (SPEC-M2 §3.1/§3.6, T-M2-7).
 *
 * Fatia de LEITURA: consome `GET /produtos` (paginado + filtro por nome) e
 * `GET /produtos/{id}` DENTRO do envelope §3.1 (reusa `ApiResponse<T>`; não redefine
 * envelope), lendo `environment.apiBaseUrl`. Escrita (criar/atualizar/excluir) e
 * movimentação chegam com os fluxos das T-M2-8/T-M2-9.
 */
@Injectable({ providedIn: 'root' })
export class ProdutosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/produtos`;

  /**
   * GET /produtos?pagina&tamanho&nome → página de produtos (§3.3, 0-based).
   * `nome` só entra no request quando há filtro (evita `nome=` vazio na URL).
   */
  listar(pagina: number, tamanho: number, nome?: string): Observable<PaginaResponse<Produto>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    const termo = nome?.trim();
    if (termo) {
      params = params.set('nome', termo);
    }
    return this.http
      .get<ApiResponse<PaginaResponse<Produto>>>(this.baseUrl, { params })
      .pipe(map((r) => r.data!));
  }

  /** GET /produtos/{id} → detalhe (inexistente → 404 tratado pelo chamador). */
  detalhar(id: number): Observable<Produto> {
    return this.http.get<ApiResponse<Produto>>(`${this.baseUrl}/${id}`).pipe(map((r) => r.data!));
  }
}
