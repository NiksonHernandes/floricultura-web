import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { FormatoExport, Granularidade, Relatorio } from '../../core/models/relatorio.model';
import { FiltroMovimentacoes } from '../movimentacoes/movimentacoes.service';

/**
 * Recorte do relatório (§3.7) = o recorte da lista (§3.5) **mais** a granularidade.
 *
 * Reusar `FiltroMovimentacoes` é a mesma postura que o §3.7-a1 impôs no back (a `FiltroRelatorio`
 * de lá consome a `FiltroMovimentacao` da T-M7-03, não a copia): dois dialetos de recorte na mesma
 * API seriam duas verdades sobre o mesmo parâmetro.
 *
 * `de`/`ate` são **obrigatórios** aqui — sem período o back responde 400 `field=de` (§3.7-a0). Quem
 * garante que eles existem é a tela, que não requisita sem período (ver `relatorios.ts`).
 */
export interface FiltroRelatorio extends FiltroMovimentacoes {
  granularidade?: Granularidade | null;
}

/**
 * Serviço do relatório de movimentações (SPEC-M7 §3.7, T-M7-09).
 *
 * **ADMIN-only** — é o primeiro GET por papel do projeto (`/api/v1/relatorios/**` no `SecurityConfig`,
 * §3.9/AD-SQ-158). USER recebe **403** e sem token **401**; quem barra de verdade é o back, o
 * `adminGuard` da rota é orientação de UX (FC-07).
 *
 * Id de recorte sem correspondência ⇒ **200 com relatório zerado**, nunca erro (AD-SQ-168) — por
 * isso a tela trata resultado vazio sob filtro como estado vazio honesto, e não como falha.
 */
@Injectable({ providedIn: 'root' })
export class RelatoriosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/relatorios/movimentacoes`;

  /** GET /relatorios/movimentacoes → resumo + série contínua de baldes (§3.7). */
  gerar(filtros: FiltroRelatorio): Observable<Relatorio> {
    return this.http
      .get<ApiResponse<Relatorio>>(this.baseUrl, { params: paramsDe(filtros) })
      .pipe(map((r) => r.data!));
  }

  /**
   * `GET /relatorios/movimentacoes/export?formato=PDF|XLSX` → **binário fora do envelope** (§3.8).
   *
   * `responseType: 'blob'` e **nunca** `<a href>` direto nem `window.open`: o endpoint exige
   * `Authorization`, que só existe no `HttpClient` (o interceptor o injeta). Um link cru daria 401
   * e — pior — o interceptor deslogaria a pessoa no meio de um download.
   *
   * A `granularidade` **não** vai: o back a aceita e a ignora neste endpoint (o arquivo traz o
   * detalhado, não a série). Mandar um parâmetro inerte sugeriria que ele muda o arquivo.
   */
  exportar(filtros: FiltroMovimentacoes, formato: FormatoExport): Observable<Blob> {
    const params = paramsDe(filtros).set('formato', formato);
    return this.http.get(`${this.baseUrl}/export`, { params, responseType: 'blob' });
  }
}

/**
 * Só o que está preenchido viaja (§3.5/§3.7): parâmetro vazio na URL é ruído, e o back trata
 * ausente como "sem recorte". Mesmo laço do `MovimentacoesService.listar` — exportado porque o
 * **export** (§3.8) manda exatamente os mesmos filtros, e duas montagens divergentes de query
 * fariam a tela pedir um recorte e baixar outro.
 */
export function paramsDe(filtros: FiltroRelatorio): HttpParams {
  let params = new HttpParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== null && valor !== undefined && valor !== '') {
      params = params.set(chave, String(valor));
    }
  }
  return params;
}
