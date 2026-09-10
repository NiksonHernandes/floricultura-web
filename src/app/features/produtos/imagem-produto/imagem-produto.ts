import { Component, Input, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';

import { ProdutosService } from '../produtos.service';
import { Produto, VarianteImagem } from '../../../core/models/produto.model';

/**
 * Imagem do produto — "a planta no vaso" (SPEC-M3 §3.6, T-M3-4, CA-11, AD-SQ-37).
 *
 * Resolve a exibição por PRIORIDADE, para um produto:
 *  1. `temImagem` → carrega o binário do banco via `HttpClient` (Bearer pelo interceptor),
 *     cria um **object URL** do `Blob` e o usa no `<img [src]>`; **revoga** (`URL.revokeObjectURL`)
 *     ao trocar de produto ou descartar (evita vazamento de memória). O `<img>` **nunca** aponta
 *     direto ao endpoint (sem header → `401` → logout do interceptor, §12).
 *  2. senão, se `imagemUrl` → usa a URL externa direto no `<img src>` (com `(error)` → placeholder,
 *     AD-SQ-32).
 *  3. senão → placeholder botânico (`local_florist`).
 *
 * Erro/404 ao carregar o blob do banco → cai para o fallback (URL → placeholder) **sem** quebrar
 * o card e **sem** deslogar: o `404` do serviço não dispara o logout (só `401` dispara — §12), e
 * este componente jamais chama `logout`.
 */
@Component({
  selector: 'app-imagem-produto',
  imports: [MatIconModule],
  templateUrl: './imagem-produto.html',
  styleUrl: './imagem-produto.scss',
})
export class ImagemProduto implements OnDestroy {
  private readonly service = inject(ProdutosService);

  /** object URL do binário do banco quando carregado (revogado ao trocar/descartar). */
  protected readonly fonteBanco = signal<string | null>(null);
  /** URL externa (`imagemUrl`) quando o banco não se aplica/falhou e a URL ainda não quebrou. */
  protected readonly fonteExterna = signal<string | null>(null);
  /** Texto alternativo = nome do produto (a11y). */
  protected readonly alt = signal('');

  /** object URL vivo (fora de signal para revogar sem disparar CD) + assinatura do carregamento. */
  private objectUrl: string | null = null;
  private carga?: Subscription;

  /**
   * Variante pedida ao back por contexto (SPEC-M5.2 §3.3): card=`thumb`, "Visualizar produto"=`medio`,
   * vitrine/form=`original` (**default** → preserva o comportamento M3). No template, declarar `tamanho`
   * **antes** de `[produto]`: o setter de `produto` dispara a carga e lê `this.tamanho` — a ordem garante
   * a variante correta na 1ª (única) resolução (o binding é estático/one-time).
   */
  @Input() tamanho: VarianteImagem = 'original';

  @Input({ required: true })
  set produto(p: Produto) {
    this.reiniciar();
    this.alt.set(p.nome);
    if (p.temImagem) {
      // Prioridade 1: binário do banco (blob + object URL, variante por contexto).
      this.carga = this.service.imagemBlob(this.service.urlImagem(p, this.tamanho)).subscribe({
        next: (blob) => {
          this.objectUrl = URL.createObjectURL(blob);
          this.fonteBanco.set(this.objectUrl);
        },
        // 404/rede → fallback silencioso (sem quebrar, sem deslogar).
        error: () => this.aplicarFallbackUrl(p),
      });
    } else {
      this.aplicarFallbackUrl(p);
    }
  }

  /** Prioridade 2: URL externa (se houver); senão fica no placeholder (prioridade 3). */
  private aplicarFallbackUrl(p: Produto): void {
    this.fonteExterna.set(p.imagemUrl ?? null);
  }

  /** `<img>` da URL externa falhou → placeholder botânico (AD-SQ-32). */
  protected aoErroUrlExterna(): void {
    this.fonteExterna.set(null);
  }

  private reiniciar(): void {
    this.carga?.unsubscribe();
    this.revogar();
    this.fonteBanco.set(null);
    this.fonteExterna.set(null);
  }

  private revogar(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  ngOnDestroy(): void {
    this.carga?.unsubscribe();
    this.revogar();
  }
}
