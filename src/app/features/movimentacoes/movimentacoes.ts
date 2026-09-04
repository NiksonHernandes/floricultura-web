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

import { MovimentacoesService } from './movimentacoes.service';
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
}
