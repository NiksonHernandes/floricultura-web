import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';

import { ProdutosService } from '../produtos.service';
import { ImagemProduto } from '../imagem-produto/imagem-produto';
import {
  Movimentacao,
  Produto,
  ProdutoRelacionamentos,
  TipoMovimentacao,
  UnidadeMedida,
} from '../../../core/models/produto.model';

/** Dados do diálogo: o id do produto a visualizar (a ficha é buscada por `GET /produtos/{id}`). */
export interface VisualizarProdutoDados {
  produtoId: number;
}

/** Rótulos de unidade (AD-SQ-31): `m3`→`m³` — local (o modal é autônomo). */
const ROTULOS_UNIDADE: Record<UnidadeMedida, string> = {
  un: 'un',
  kg: 'kg',
  saco: 'saco',
  m3: 'm³',
  l: 'L',
  g: 'g',
};

/** Rótulos pt-BR dos tipos do ledger (AD-SQ-30) — espelho de `visualizar-lancamento`. */
const ROTULOS_TIPO: Record<TipoMovimentacao, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
};

/**
 * Modal "Visualizar produto" — a ficha completa do vaso (SPEC-M5 REVISÃO 2026-09-04, RF-4/AD-SQ-66,
 * R-CA-10). Leitura para USER+ADMIN.
 *
 * **Dados próprios:** reaproveita `GET /produtos/{id}` (M2/M4 — congelado, zero regressão) para nome,
 * descrição, foto (via `<app-imagem-produto>`, mesmo caminho do card/form — AD-SQ-37), unidade, estoque
 * (atual + mínimo) e **preço só quando não-nulo** (V3 opcional — empty-state honesto, sem "R$ 0,00").
 * **Derivados:** `GET /produtos/{id}/relacionamentos` (R3.5) para eventos/fornecedores/clientes por
 * NOME; cada seção só aparece quando há dados ("se houver"). A ficha e os relacionamentos carregam
 * independentes: uma falha nos relacionamentos degrada para "sem seções", sem esconder a ficha.
 * `MatDialog` (focus-trap/Esc/backdrop). Mobile-first (FC-02): 1 coluna, sem overflow.
 */
@Component({
  selector: 'app-visualizar-produto',
  imports: [
    DatePipe,
    SlicePipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ImagemProduto,
  ],
  templateUrl: './visualizar-produto.html',
  styleUrl: './visualizar-produto.scss',
})
export class VisualizarProduto implements OnInit {
  private readonly service = inject(ProdutosService);
  private readonly ref = inject(MatDialogRef<VisualizarProduto>);
  private readonly dados = inject<VisualizarProdutoDados>(MAT_DIALOG_DATA);

  protected readonly produto = signal<Produto | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal(false);

  protected readonly relacionamentos = signal<ProdutoRelacionamentos | null>(null);

  /**
   * Últimas movimentações do produto (SPEC-M5.1 HISTÓRIA #4/#6, `?pagina=0&tamanho=3` — REVISÃO
   * AD-SQ-73: dono pediu 3, era 5; `criadoEm DESC`). `null` = ainda não carregado OU falhou (degrada
   * em SILÊNCIO — a seção some, não bloqueia a ficha). `[]` = carregado e sem movimentações.
   */
  protected readonly movimentacoes = signal<Movimentacao[] | null>(null);

  /** Tem ao menos uma relação para exibir (evita renderizar a área de relações vazia). */
  protected readonly temRelacionamentos = computed(() => {
    const r = this.relacionamentos();
    return !!r && (r.eventos.length > 0 || r.fornecedores.length > 0 || r.clientes.length > 0);
  });

  ngOnInit(): void {
    this.carregarFicha();
    this.carregarRelacionamentos();
  }

  protected carregarFicha(): void {
    this.carregando.set(true);
    this.erro.set(false);
    this.service.detalhar(this.dados.produtoId).subscribe({
      next: (p) => {
        this.produto.set(p);
        this.carregando.set(false);
        // Movimentações recentes só fazem sentido com a ficha carregada (produto existente).
        this.carregarMovimentacoes();
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  /** Relacionamentos degradam em silêncio: falha = sem seções (não bloqueia a ficha). */
  private carregarRelacionamentos(): void {
    this.service.relacionamentos(this.dados.produtoId).subscribe({
      next: (r) => this.relacionamentos.set(r),
      error: () => this.relacionamentos.set(null),
    });
  }

  /**
   * Últimas 5 movimentações (HISTÓRIA #4/CA-9/CA-10) — degrada em silêncio na falha (`null`), sem
   * bloquear a ficha nem os relacionamentos. Espelha o histórico curto do `movimentar-estoque`.
   */
  private carregarMovimentacoes(): void {
    this.service.movimentacoes(this.dados.produtoId, 0, 3).subscribe({
      next: (pagina) => this.movimentacoes.set(pagina.conteudo),
      error: () => this.movimentacoes.set(null),
    });
  }

  protected rotuloTipo(t: TipoMovimentacao): string {
    return ROTULOS_TIPO[t] ?? t;
  }

  /**
   * Contraparte por NOME conforme o tipo (snapshot do ledger — espelha `visualizar-lancamento`):
   * ENTRADA→`fornecedorNome`, SAÍDA→`clienteNome`; `null` = sem contraparte (não renderiza).
   */
  protected contraparteNome(m: Movimentacao): string | null {
    if (m.tipo === 'ENTRADA') return m.fornecedorNome ?? null;
    if (m.tipo === 'SAIDA') return m.clienteNome ?? null;
    return null;
  }

  protected rotuloUnidade(u: UnidadeMedida): string {
    return ROTULOS_UNIDADE[u] ?? u;
  }

  /** `mín. <N>` só quando `estoqueMinimo > 0` (AD-SQ-55) — sem "mín. 0" órfão. */
  protected rotuloMinimo(p: Produto): string | null {
    return p.estoqueMinimo != null && p.estoqueMinimo > 0 ? `mín. ${p.estoqueMinimo}` : null;
  }

  /** Preço em BRL; `null` = sem preço definido (não renderiza — empty-state honesto, não fake). */
  protected precoFormatado(p: Produto): string | null {
    if (p.preco === null || p.preco === undefined) return null;
    return p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected fechar(): void {
    this.ref.close();
  }
}
