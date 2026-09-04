import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse } from '../../core/models/produto.model';

/**
 * Serviço da lista global de Movimentações (SPEC-M4 §3.5, T-M4-11).
 *
 * Consome `GET /api/v1/movimentacoes` DENTRO do envelope §3.1 (reusa `ApiResponse<T>` e o contrato
 * paginado `PaginaResponse<T>`, AD-SQ-29). Leitura para USER+ADMIN (cai no `authenticated()` do
 * back — sem matcher novo). Ordem `criado_em DESC`; filtro `q` opcional casa `produto_nome` **ou**
 * `usuario_nome` por ILIKE. Paginação obrigatória (o back nunca faz `findAll()` sem `Pageable`).
 */
@Injectable({ providedIn: 'root' })
export class MovimentacoesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/movimentacoes`;

  /**
   * GET /movimentacoes?pagina&tamanho&q → página do ledger global (§3.5, 0-based). `q` só entra no
   * request quando há filtro (evita `q=` vazio na URL) — mesmo padrão de `ProdutosService.listar`.
   */
  listar(pagina: number, tamanho: number, q?: string): Observable<PaginaResponse<Movimentacao>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    const termo = q?.trim();
    if (termo) {
      params = params.set('q', termo);
    }
    return this.http
      .get<ApiResponse<PaginaResponse<Movimentacao>>>(this.baseUrl, { params })
      .pipe(map((r) => r.data!));
  }
}
