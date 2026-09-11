import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';

import { CoresService } from './cores.service';
import { Cor } from '../../../core/models/cor.model';

/** MatPaginator em pt-BR — ecoa `fornecedores.ts`/`clientes.ts` (rótulo do domínio). */
function paginatorPtBr(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Cores por página';
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

/**
 * Configurações → Cores (SPEC-M6 §3.15, T-M6-06a, CA-30) — "a cartela de tintas do ateliê".
 *
 * A tela é ADMIN (`adminGuard` na rota + item só no rodapé do menu para ADMIN); a LEITURA do
 * catálogo é USER+ADMIN no back porque alimenta o filtro de cor da lista de produtos (PA#3).
 *
 * FATIA DESTA TASK: **só a lista** — tabela densa com duas colunas (`Cor` = amostra + nome ·
 * `Produtos vinculados`), busca por nome (server-side, debounce 300ms) e paginação 0-based. Não há
 * "Nova cor", coluna "Ações" nem exclusão: eles chegam com o `cor-form` na T-M6-06b, e botão que
 * não faz nada seria UI desonesta. O §3.15 fecha as 3 colunas ao fim da 06b.
 *
 * Ordenação: **não existe** nesta tela (nem `<th>` clicável, nem seletor no celular) — o back
 * devolve o catálogo por `nome ASC` e o §3.2 não expõe `ordenarPor` aqui. Por isso o `cores.scss`
 * inclui `tabela-densa` mas **não** `tabela-ordenar` (D3/§10 #30e: quem não ordena não paga o byte).
 *
 * O `nome` vem CANÔNICO do back (§3.2.1/AD-SQ-90) e é exibido como veio — sem `titlecase`,
 * `uppercase` ou `text-transform` em cima do dado (R1d/CA-40).
 */
@Component({
  selector: 'app-cores',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginatorPtBr }],
  templateUrl: './cores.html',
  styleUrl: './cores.scss',
})
export class Cores implements OnInit {
  private readonly service = inject(CoresService);

  protected readonly cores = signal<Cor[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly totalElementos = signal(0);
  protected readonly pagina = signal(0);
  protected readonly tamanho = signal(12);
  protected readonly vazia = computed(
    () => !this.carregando() && !this.erro() && this.cores().length === 0,
  );

  /** Busca por nome (filtro server-side com debounce — §3.2, ILIKE sobre o canônico no back). */
  protected readonly filtro = new FormControl('', { nonNullable: true });

  constructor() {
    this.filtro.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reiniciar()); // novo filtro reinicia na 1ª página
  }

  ngOnInit(): void {
    this.carregar();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service.listar(this.pagina(), this.tamanho(), this.filtro.value).subscribe({
      next: (pagina) => {
        this.cores.set(pagina.conteudo);
        this.totalElementos.set(pagina.totalElementos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar o catálogo de cores. Tente novamente.');
        this.carregando.set(false);
      },
    });
  }

  /** Troca de página do `MatPaginator` (0-based) → recarrega a mesma fatia do back. */
  protected aoPaginar(evento: PageEvent): void {
    this.pagina.set(evento.pageIndex);
    this.tamanho.set(evento.pageSize);
    this.carregar();
  }

  protected limparFiltro(): void {
    this.filtro.setValue('');
  }

  /** Toda mudança de recorte volta para a 1ª página e refaz UMA requisição. */
  private reiniciar(): void {
    this.pagina.set(0);
    this.carregar();
  }
}
