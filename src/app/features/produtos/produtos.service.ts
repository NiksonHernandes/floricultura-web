import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  AtualizarProdutoRequest,
  CriarProdutoRequest,
  PaginaResponse,
  Produto,
} from '../../core/models/produto.model';

/**
 * Serviço de Produtos (SPEC-M2 §3.1/§3.6, T-M2-7/T-M2-8).
 *
 * LEITURA (T-M2-7): `GET /produtos` (paginado + filtro por nome) e `GET /produtos/{id}`.
 * ESCRITA (T-M2-8): `POST /produtos` (cria com `estoqueAtual=0` — AD-SQ-30) e
 * `PUT /produtos/{id}` (atualiza só campos de cadastro; nunca toca estoque). Tudo DENTRO do
 * envelope §3.1 (reusa `ApiResponse<T>`; não redefine envelope), lendo `environment.apiBaseUrl`.
 * A escrita é protegida por RBAC no back (só ADMIN — FC-07); o front só orienta a UX.
 * Exclusão e movimentação chegam com a T-M2-9.
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

  /**
   * POST /produtos → cria o produto (ADMIN). Back devolve o `ProdutoResponse` com
   * `estoqueAtual=0` (AD-SQ-30). `400` (validação por campo) / `403` (USER) são tratados
   * pelo chamador (o form aplica `error.details` por campo).
   */
  criar(req: CriarProdutoRequest): Observable<Produto> {
    return this.http.post<ApiResponse<Produto>>(this.baseUrl, req).pipe(map((r) => r.data!));
  }

  /**
   * PUT /produtos/{id} → atualiza os campos de cadastro (ADMIN); nunca altera `estoqueAtual`
   * (AD-SQ-30). `400`/`403`/`404` tratados pelo chamador.
   */
  atualizar(id: number, req: AtualizarProdutoRequest): Observable<Produto> {
    return this.http
      .put<ApiResponse<Produto>>(`${this.baseUrl}/${id}`, req)
      .pipe(map((r) => r.data!));
  }
}
