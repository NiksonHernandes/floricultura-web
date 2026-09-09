import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  AtualizarProdutoRequest,
  CriarProdutoRequest,
  Movimentacao,
  MovimentacaoRequest,
  PaginaResponse,
  Produto,
  ProdutoRelacionamentos,
  VarianteImagem,
} from '../../core/models/produto.model';

/**
 * Serviço de Produtos (SPEC-M2 §3.1/§3.6, T-M2-7/T-M2-8).
 *
 * LEITURA (T-M2-7): `GET /produtos` (paginado + filtro por nome) e `GET /produtos/{id}`.
 * ESCRITA (T-M2-8): `POST /produtos` (cria com `estoqueAtual=0` — AD-SQ-30) e
 * `PUT /produtos/{id}` (atualiza só campos de cadastro; nunca toca estoque). Tudo DENTRO do
 * envelope §3.1 (reusa `ApiResponse<T>`; não redefine envelope), lendo `environment.apiBaseUrl`.
 * A escrita é protegida por RBAC no back (só ADMIN — FC-07); o front só orienta a UX.
 *
 * T-M2-9: `excluir` (hard delete → 204, FC-08), `movimentar` (POST movimentação → 201, AD-SQ-30;
 * SAÍDA acima do estoque → 400 tratado pelo chamador — CA-11) e `movimentacoes` (histórico
 * paginado, `criadoEm DESC`).
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
   * GET /produtos/{id}/relacionamentos → derivados por NOME (SPEC-M5 REVISÃO 2026-09-04, R3.5/AD-SQ-66)
   * para o modal "Visualizar produto" (RF-4): `eventos` (junção), `fornecedores` (ENTRADAS), `clientes`
   * (SAÍDAS). Leitura USER+ADMIN (só GET, catch-all — sem matcher novo); 404 se o produto não existe
   * (tratado pelo chamador). Nunca traz binário/`bytea` (AD-SQ-38).
   */
  relacionamentos(id: number): Observable<ProdutoRelacionamentos> {
    return this.http
      .get<ApiResponse<ProdutoRelacionamentos>>(`${this.baseUrl}/${id}/relacionamentos`)
      .pipe(map((r) => r.data!));
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

  /**
   * DELETE /produtos/{id} → hard delete (204 sem corpo, FC-08, IRREVERSÍVEL). O back anula o
   * vínculo do ledger (`produto_id=NULL`) preservando o snapshot. `403` (USER) / `404` tratados
   * pelo chamador. A confirmação explícita (com o nome) é responsabilidade do front (§3.2).
   */
  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * POST /produtos/{id}/movimentacoes → registra a movimentação (ADMIN, 201). SAÍDA acima do
   * estoque → `400 VALIDATION_ERROR` com `message:"Estoque insuficiente (X em estoque)."` — o
   * chamador exibe a mensagem sem quebrar a tela (CA-11). Retorna o `MovimentacaoResponse`.
   */
  movimentar(id: number, req: MovimentacaoRequest): Observable<Movimentacao> {
    return this.http
      .post<ApiResponse<Movimentacao>>(`${this.baseUrl}/${id}/movimentacoes`, req)
      .pipe(map((r) => r.data!));
  }

  /**
   * GET /produtos/{id}/movimentacoes?pagina&tamanho → histórico paginado (`criadoEm DESC`, §3.2).
   * Leitura autenticada (USER+ADMIN). Usado para as últimas movimentações no diálogo de estoque.
   */
  movimentacoes(id: number, pagina: number, tamanho: number): Observable<PaginaResponse<Movimentacao>> {
    const params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    return this.http
      .get<ApiResponse<PaginaResponse<Movimentacao>>>(`${this.baseUrl}/${id}/movimentacoes`, {
        params,
      })
      .pipe(map((r) => r.data!));
  }

  // --- Imagem no banco (SPEC-M3 §3.3/§3.6, T-M3-4) ---

  /**
   * POST /produtos/{id}/imagem → envia a imagem (`multipart/form-data`, parte **`arquivo`**). Só
   * ADMIN (RBAC no back, FC-07). Desembrulha o `ProdutoResponse` atualizado (`temImagem:true`,
   * `atualizadoEm` novo). Erros (`400` tipo/tamanho/spoof/vazio · `403` USER · `404`) são tratados
   * pelo chamador (o form aplica `error.details` no campo `arquivo`).
   */
  enviarImagem(id: number, arquivo: File): Observable<Produto> {
    const dados = new FormData();
    dados.append('arquivo', arquivo);
    return this.http
      .post<ApiResponse<Produto>>(`${this.baseUrl}/${id}/imagem`, dados)
      .pipe(map((r) => r.data!));
  }

  /**
   * DELETE /produtos/{id}/imagem → remove o binário do banco (`204`, idempotente — remover o que
   * já não há ainda é sucesso). Só ADMIN. O card cai de volta para `imagemUrl` (se houver). `403`/
   * `404` tratados pelo chamador.
   */
  removerImagem(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/imagem`);
  }

  /**
   * URL **versionada** do binário do banco (§3.3): `.../imagem?v=<atualizadoEm epoch>&tamanho=<var>`.
   * Upload/delete bumpam `atualizadoEm` → novo `?v` invalida o cache imutável ao trocar a foto. O
   * `tamanho` (SPEC-M5.2 §3.3) pede a variante por contexto (`thumb`/`medio`/`original`); **default
   * `original` preserva a assinatura dos chamadores M3** (vitrine/form seguem inalterados). **NUNCA**
   * usar em `<img src>` direto (sem Bearer → `401` → logout do interceptor, §12); é a chave que
   * `imagemBlob` carrega via `HttpClient`.
   */
  urlImagem(p: Produto, tamanho: VarianteImagem = 'original'): string {
    return `${this.baseUrl}/${p.id}/imagem?v=${Date.parse(p.atualizadoEm)}&tamanho=${tamanho}`;
  }

  /**
   * GET do binário como `Blob` (`responseType:'blob'`, Bearer via interceptor). A exibição usa
   * `URL.createObjectURL` no blob e **revoga** ao descartar/trocar. `404` (sem imagem) **não**
   * desloga — só `401` dispara o logout do interceptor (§12) —, então o chamador cai para o
   * fallback sem quebrar o card.
   */
  imagemBlob(url: string): Observable<Blob> {
    return this.http.get(url, { responseType: 'blob' });
  }
}
