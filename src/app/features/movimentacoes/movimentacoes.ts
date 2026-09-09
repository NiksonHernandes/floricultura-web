import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';

import { MovimentacoesService } from './movimentacoes.service';
import {
  VisualizarLancamento,
  VisualizarLancamentoDados,
} from './visualizar-lancamento/visualizar-lancamento';
import { Movimentacao, TipoMovimentacao } from '../../core/models/produto.model';

/** MatPaginator em pt-BR — ecoa `produtos.ts`, rótulo do domínio (o ledger é o "livro-caixa"). */
function paginatorPtBr(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Lançamentos por página';
  intl.nextPageLabel = 'Próxima página';
  intl.previousPageLabel = 'Página anterior';
  intl.firstPageLabel = 'Primeira página';
  intl.lastPageLabel = 'Última página';
  intl.getRangeLabel = (page, size, length) => {
    if (length === 0) return '0 de 0';
    const inicio = page * size + 1;
    const fim = Math.min((page + 1) * size, length);
    return `${inicio}–${fim} de ${length}`;
  };
  return intl;
}

/** Rótulos pt-BR dos tipos do ledger (AD-SQ-30). */
export const ROTULOS_TIPO_MOV: Record<TipoMovimentacao, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
};

/**
 * Movimentações — "o livro-caixa do estoque" (SPEC-M4 §7 T-M4-11, CA-22/CA-24).
 *
 * Primeira visão consolidada do ledger imutável (leitura USER+ADMIN). Lista paginada server-side
 * (`MatPaginator` 0-based, AD-SQ-29), filtro `q` com `debounceTime(300)` que casa **produto OU
 * autor** (ILIKE no back), ordem `criado_em DESC`. Card mobile-first: tipo, quantidade, produto,
 * **autor** (`usuarioNome` ou `—` — CA-21) e data+hora pt-BR `dd/MM/yyyy HH:mm` em
 * `America/Sao_Paulo` (AD-SQ-40). Estados honestos de carregando/erro/vazio.
 *
 * **RF-3 (REVISÃO 2026-09-04/AD-SQ-67):** o card mostra a **contraparte quando houver** (fornecedor na
 * ENTRADA / cliente na SAÍDA — snapshot do ledger, R3.3) e ganha a ação **"Visualizar"**, que abre a
 * ficha completa do lançamento (`VisualizarLancamento`, `MatDialog`). Nada muda na fonte de dados: o
 * `GET /movimentacoes` (paginação/filtro/ordem `criado_em DESC`) continua igual — a contraparte é
 * aditiva no `MovimentacaoResponse`; a lista **não regride** (anti-regressão dos testes do M4).
 */
@Component({
  selector: 'app-movimentacoes',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginatorPtBr }],
  templateUrl: './movimentacoes.html',
  styleUrl: './movimentacoes.scss',
})
export class Movimentacoes implements OnInit {
  private readonly service = inject(MovimentacoesService);
  private readonly dialog = inject(MatDialog);

  protected readonly movimentacoes = signal<Movimentacao[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly totalElementos = signal(0);
  protected readonly pagina = signal(0);
  protected readonly tamanho = signal(20);
  protected readonly vazia = computed(
    () => !this.carregando() && !this.erro() && this.movimentacoes().length === 0,
  );

  /** Filtro `q` server-side com debounce (§3.5 — casa produto OU autor por ILIKE). */
  protected readonly filtro = new FormControl('', { nonNullable: true });

  constructor() {
    this.filtro.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        this.pagina.set(0); // novo filtro reinicia na 1ª página
        this.carregar();
      });
  }

  ngOnInit(): void {
    this.carregar();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service.listar(this.pagina(), this.tamanho(), this.filtro.value).subscribe({
      next: (pagina) => {
        this.movimentacoes.set(pagina.conteudo);
        this.totalElementos.set(pagina.totalElementos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as movimentações. Tente novamente.');
        this.carregando.set(false);
      },
    });
  }

  protected aoPaginar(evento: PageEvent): void {
    this.pagina.set(evento.pageIndex);
    this.tamanho.set(evento.pageSize);
    this.carregar();
  }

  protected limparFiltro(): void {
    this.filtro.setValue('');
  }

  protected rotuloTipo(t: TipoMovimentacao): string {
    return ROTULOS_TIPO_MOV[t] ?? t;
  }

  /**
   * Produto do lançamento foi hard-deletado (SPEC-M5.2 §3.1, B-R1). O ledger é imutável: o back anula
   * `produtoId` (FK `ON DELETE SET NULL`, FC-08/AD-SQ-34) mas preserva `produtoNome` (snapshot legível).
   * Deriva-se do contrato já existente — **sem** flag nova no back. `== null` cobre `null` e `undefined`
   * (fixtures herdados usam `produtoId:5` → não acionam o selo).
   */
  protected produtoExcluido(m: Movimentacao): boolean {
    return m.produtoId === null || m.produtoId === undefined;
  }

  /**
   * Rótulo da contraparte do lançamento (RF-3): ENTRADA→"Fornecedor" (quando há `fornecedorNome`),
   * SAÍDA→"Cliente" (quando há `clienteNome`); `null` = sem contraparte (não renderiza no card). Usa o
   * NOME (snapshot preservado após hard delete FC-08), não o id.
   */
  protected contraparteRotulo(m: Movimentacao): string | null {
    if (m.tipo === 'ENTRADA' && m.fornecedorNome) return 'Fornecedor';
    if (m.tipo === 'SAIDA' && m.clienteNome) return 'Cliente';
    return null;
  }

  protected contraparteNome(m: Movimentacao): string | null {
    return m.fornecedorNome ?? m.clienteNome ?? null;
  }

  /** Abre a ficha do lançamento (`MatDialog`, só leitura — RF-3/R-CA-11). */
  protected visualizar(m: Movimentacao): void {
    const dados: VisualizarLancamentoDados = { movimentacao: m };
    this.dialog.open(VisualizarLancamento, {
      data: dados,
      maxWidth: 'min(34rem, calc(100vw - 2rem))',
    });
  }
}
