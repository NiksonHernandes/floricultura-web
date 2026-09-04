import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../core/models/produto.model';
import { Evento, EventoProximo, EventoRequest } from '../../core/models/evento.model';

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

  /**
   * GET /eventos/{id}/produtos?pagina&tamanho → vitrine paginada das flores vinculadas ao evento
   * (SPEC-M4.1 §3.1, T-M4.1-2). Reusa o envelope §3.1 e o contrato `PaginaResponse<Produto>` (mesma
   * variante de LISTA de Produtos: `eventoIds=null`, `sazonal=true`, sem `bytea` — AD-SQ-38/50). O
   * modal carrega a 1ª página com `tamanho=50` (PA#1 — sem paginador visual). Evento inexistente →
   * `404` tratado pelo chamador; evento sem produtos → `200` com `conteudo=[]` (estado vazio, não erro).
   */
  listarProdutosDoEvento(id: number, pagina = 0, tamanho = 50): Observable<PaginaResponse<Produto>> {
    const params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    return this.http
      .get<ApiResponse<PaginaResponse<Produto>>>(`${this.baseUrl}/${id}/produtos`, { params })
      .pipe(map((r) => r.data!));
  }

  // --- Alerta on-read (SPEC-M4 §3.3, T-M4-8) ---

  /**
   * Alerta "próximos eventos" da Home + badge do menu, com estado COMPARTILHADO (signal) e cache:
   * `carregarProximos()` faz `GET /eventos/proximos` uma única vez e publica em `proximos`, de modo
   * que a Home (bloco) e o shell (badge) leem a MESMA lista sem duplicar a chamada. Falha degrada em
   * silêncio (lista vazia, sem badge/bloco) e libera nova tentativa — o alerta é auxiliar, não bloqueia.
   */
  readonly proximos = signal<EventoProximo[]>([]);
  private proximosCarregados = false;

  carregarProximos(): void {
    if (this.proximosCarregados) {
      return;
    }
    this.proximosCarregados = true;
    this.http
      .get<ApiResponse<EventoProximo[]>>(`${this.baseUrl}/proximos`)
      .pipe(map((r) => r.data ?? []))
      .subscribe({
        next: (lista) => this.proximos.set(lista),
        error: () => {
          this.proximosCarregados = false; // permite nova tentativa numa próxima montagem
        },
      });
  }
}

