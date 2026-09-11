import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../core/models/api-response.model';
import { PaginaResponse } from '../../../core/models/produto.model';
import { Cor } from '../../../core/models/cor.model';

/**
 * Serviço do catálogo de cores (SPEC-M6 §3.2, T-M6-06a) — espelho de `FornecedoresService`.
 *
 * Escopo desta task: **só `listar`**. POST/PUT/DELETE entram com o `cor-form` (T-M6-06b), junto do
 * seu chamador — método sem consumidor é código morto, e o 409 da escrita precisa do tratamento de
 * erro que só existe lá.
 *
 * RBAC (PA#3): `GET /cores` é USER+ADMIN (alimenta o filtro de cor da lista de produtos, que o USER
 * usa); a escrita é ADMIN por matcher no back. A TELA de Configurações é ADMIN (`adminGuard`) — o
 * guard é UX, o RBAC efetivo é do servidor.
 *
 * Provido no `app.config` (NÃO `providedIn:'root'`) — mesmo padrão de `EventosService`/
 * `FornecedoresService` (AD-SQ-72): quando o `produto-form` passar a injetá-lo (T-M6-09a), os specs
 * herdados do M2/M3 que não o registram recebem `null` no inject opcional e seguem sem disparar
 * `GET /cores`. É prevenção de quebra de teste herdado (anti-burla), não preferência de estilo.
 */
@Injectable()
export class CoresService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/cores`;

  /**
   * GET /cores?pagina&tamanho[&nome] → página de cores (0-based, §3.2).
   *
   * O termo do filtro vai **CRU** para o back: quem canoniza é o `Cores.canonizar` do servidor,
   * fonte ÚNICA da regra (§3.2.1) — normalizar aqui duplicaria a lógica e um dia divergiria. O
   * `trim()` aparece só na DECISÃO "há filtro?", para não mandar `nome=   ` na URL (termo que
   * canoniza para vazio = sem filtro, §3.2.1/PR3).
   */
  listar(pagina: number, tamanho: number, nome?: string): Observable<PaginaResponse<Cor>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    if (nome?.trim()) {
      params = params.set('nome', nome);
    }
    return this.http
      .get<ApiResponse<PaginaResponse<Cor>>>(this.baseUrl, { params })
      .pipe(map((r) => r.data!));
  }
}
