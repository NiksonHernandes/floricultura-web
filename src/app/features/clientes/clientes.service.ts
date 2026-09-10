import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Cliente, ClienteRequest } from '../../core/models/cliente.model';

/** Campo de ordenação aceito pelo back em `GET /clientes` (SPEC-M6 §3.7). */
export type OrdemContato = 'nome' | 'telefone' | 'email';

/** Direção da ordenação (SPEC-M6 §3.7). */
export type DirecaoOrdem = 'asc' | 'desc';

/**
 * Filtros/ordenação da lista de contatos (SPEC-M6 §3.7, T-M6-08a).
 *
 * `comTelefone`/`comEmail` são TRI-ESTADO: `null`/ausente = sem filtro · `true` = tem ·
 * `false` = **não** tem (nulo ou vazio após trim, R25). Vai como 4º argumento OPCIONAL de
 * `listar` de propósito: a assinatura posicional `(pagina, tamanho, nome?)` do M5 continua
 * válida para os chamadores que não filtram (`movimentar-estoque`, testes herdados).
 */
export interface ContatoConsulta {
  comTelefone?: boolean | null;
  comEmail?: boolean | null;
  ordenarPor?: OrdemContato;
  direcao?: DirecaoOrdem;
}

/**
 * Serviço de Clientes (SPEC-M5 §3.4/§3.6, T-M5-6). Espelho fiel de `EventosService`.
 *
 * Consome `/api/v1/clientes` DENTRO do envelope §3.1 do M0 (reusa `ApiResponse<T>` e o contrato
 * paginado `PaginaResponse<T>`, AD-SQ-29 — mesmo mapeamento de `ProdutosService`/`EventosService`).
 * LEITURA (USER+ADMIN): `GET /clientes` (paginado + filtro por nome) e `GET /clientes/{id}` (traz
 * `produtoIds`). ESCRITA (ADMIN, RBAC no back — FC-07): `POST`/`PUT`/`DELETE`. O front só orienta a
 * UX; o RBAC efetivo é do servidor.
 *
 * `providedIn:'root'` (SPEC-M5 §3.6): o shell NÃO injeta este serviço, logo não há a restrição de
 * anti-burla do `EventosService` (provido no `appConfig` por causa do badge do menu).
 */
@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/clientes`;

  /**
   * GET /clientes?pagina&tamanho&nome[&comTelefone&comEmail&ordenarPor&direcao] → página de clientes
   * (§3.4, 0-based; itens da lista com `produtoIds=null`). `nome` só entra no request quando há
   * filtro (evita `nome=` vazio na URL); os tri-estados só entram quando o operador escolheu
   * "Com"/"Sem" (SPEC-M6 §3.7 — ausente é "sem filtro", e `comTelefone=false` é filtro LEGÍTIMO,
   * por isso o teste é contra `null`/`undefined`, nunca falsy).
   */
  listar(
    pagina: number,
    tamanho: number,
    nome?: string,
    consulta?: ContatoConsulta,
  ): Observable<PaginaResponse<Cliente>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    const termo = nome?.trim();
    if (termo) {
      params = params.set('nome', termo);
    }
    if (consulta?.comTelefone !== null && consulta?.comTelefone !== undefined) {
      params = params.set('comTelefone', consulta.comTelefone);
    }
    if (consulta?.comEmail !== null && consulta?.comEmail !== undefined) {
      params = params.set('comEmail', consulta.comEmail);
    }
    if (consulta?.ordenarPor) {
      params = params.set('ordenarPor', consulta.ordenarPor).set('direcao', consulta.direcao ?? 'asc');
    }
    return this.http
      .get<ApiResponse<PaginaResponse<Cliente>>>(this.baseUrl, { params })
      .pipe(map((r) => r.data!));
  }

  /** GET /clientes/{id} → detalhe com `produtoIds` (inexistente → 404 tratado pelo chamador). */
  detalhar(id: number): Observable<Cliente> {
    return this.http.get<ApiResponse<Cliente>>(`${this.baseUrl}/${id}`).pipe(map((r) => r.data!));
  }

  /** POST /clientes → 201 com o `ClienteResponse` criado (ADMIN). 400 (validação)/403 pelo chamador. */
  criar(req: ClienteRequest): Observable<Cliente> {
    return this.http.post<ApiResponse<Cliente>>(this.baseUrl, req).pipe(map((r) => r.data!));
  }

  /** PUT /clientes/{id} → 200 com o cliente atualizado (ADMIN, replace-set §4.2). 400/403/404 pelo chamador. */
  atualizar(id: number, req: ClienteRequest): Observable<Cliente> {
    return this.http
      .put<ApiResponse<Cliente>>(`${this.baseUrl}/${id}`, req)
      .pipe(map((r) => r.data!));
  }

  /**
   * DELETE /clientes/{id} → hard delete (204 sem corpo, FC-08, IRREVERSÍVEL). O `ON DELETE CASCADE`
   * limpa os vínculos em `cliente_produto` sem tocar os produtos (§4.3). A confirmação explícita
   * (com o nome) é do front (`confirmar-exclusao`); 403/404 tratados pelo chamador.
   */
  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
