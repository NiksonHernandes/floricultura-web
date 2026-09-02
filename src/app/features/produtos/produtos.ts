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

import { ProdutosService } from './produtos.service';
import { Produto, UnidadeMedida } from '../../core/models/produto.model';

/** MatPaginator em pt-BR — sem o "Items per page" em inglês do default (design-distintivo §texto). */
function paginatorPtBr(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Vasos por página';
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

/** Rótulos amigáveis de unidade (AD-SQ-31): `m3` vira `m³`; os demais legíveis. */
const ROTULOS_UNIDADE: Record<UnidadeMedida, string> = {
  un: 'un',
  kg: 'kg',
  saco: 'saco',
  m3: 'm³',
  l: 'L',
  g: 'g',
};

/**
 * Produtos — Home pós-login e "prateleira de vasos" do ateliê (SPEC-M2 §7 T-M2-7, CA-19/CA-15).
 *
 * Fatia de LISTA: cards mobile-first (paginação server-side via `MatPaginator` 0-based —
 * casa `pagina` do §3.3; AD-SQ-29), filtro por nome com `debounceTime(300)`, selo de
 * estoque baixo (FC-13/CA-15), fallback de imagem no `(error)` do `<img>` (AD-SQ-32) e
 * estados honestos de carregando/erro (com "tentar de novo")/vazio. Form, exclusão e
 * movimentação são as T-M2-8/T-M2-9.
 */
@Component({
  selector: 'app-produtos',
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
  templateUrl: './produtos.html',
  styleUrl: './produtos.scss',
})
export class Produtos implements OnInit {
  private readonly service = inject(ProdutosService);

  protected readonly produtos = signal<Produto[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly totalElementos = signal(0);
  protected readonly pagina = signal(0);
  protected readonly tamanho = signal(12);
  protected readonly vazia = computed(
    () => !this.carregando() && !this.erro() && this.produtos().length === 0,
  );

  /** Campo de busca por nome (filtro server-side com debounce — §3.3 `nome` ILIKE). */
  protected readonly filtro = new FormControl('', { nonNullable: true });

  /** Ids cujo `<img>` falhou ao carregar → caem no placeholder botânico (AD-SQ-32). */
  private readonly imagensQuebradas = signal<Set<number>>(new Set());

  constructor() {
    this.filtro.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        // Novo filtro sempre reinicia na 1ª página (evita cair numa página vazia).
        this.pagina.set(0);
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
        this.produtos.set(pagina.conteudo);
        this.totalElementos.set(pagina.totalElementos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar a prateleira. Tente novamente.');
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

  /** Exibe placeholder quando não há URL ou o carregamento falhou (AD-SQ-32). */
  protected semImagem(p: Produto): boolean {
    return !p.imagemUrl || this.imagensQuebradas().has(p.id);
  }

  protected aoErroImagem(id: number): void {
    this.imagensQuebradas.update((s) => new Set(s).add(id));
  }

  protected rotuloUnidade(u: UnidadeMedida): string {
    return ROTULOS_UNIDADE[u] ?? u;
  }

  /** Preço em BRL; `null` = sem preço definido (empty-state honesto, não "R$ 0,00" fake). */
  protected precoFormatado(p: Produto): string | null {
    if (p.preco === null || p.preco === undefined) return null;
    return p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
