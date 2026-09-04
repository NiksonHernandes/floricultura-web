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
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';

import { FornecedoresService } from './fornecedores.service';
import {
  ConfirmarExclusao,
  ConfirmarExclusaoDados,
} from '../produtos/confirmar-exclusao/confirmar-exclusao';
import { AuthService } from '../../core/services/auth.service';
import { Fornecedor } from '../../core/models/fornecedor.model';

/** MatPaginator em pt-BR — ecoa `clientes.ts`/`eventos.ts` (rótulo do domínio). */
function paginatorPtBr(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Fornecedores por página';
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
 * Fornecedores — "a agenda de quem abastece o ateliê" (SPEC-M5 §7 T-M5-9, espelho fiel de
 * `Clientes`/T-M5-7, CA-11/CA-13/CA-14/CA-15).
 *
 * Fatia de LISTA (espelha `clientes.ts`/`eventos.ts`, AD-SQ-29): cards mobile-first, paginação
 * server-side via `MatPaginator` 0-based (casa `pagina` do §3.4), filtro por nome com
 * `debounceTime(300)` (ILIKE no back) e estados honestos carregando/erro (com "tentar de novo")/
 * vazio. Leitura para USER+ADMIN; o menu "Fornecedores" é `soAdmin:false`.
 *
 * As ações de escrita (Novo/Editar/Excluir) só aparecem para `ehAdmin()` (RBAC de UX, FC-07 — o
 * back é a fonte de verdade). Hard delete (FC-08) reusa `ConfirmarExclusao`. O `fornecedor-form`
 * (Novo/Editar) entra com a T-M5-10: os handlers já armam os signals `formAberto`/`fornecedorEmEdicao`.
 */
@Component({
  selector: 'app-fornecedores',
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
  templateUrl: './fornecedores.html',
  styleUrl: './fornecedores.scss',
})
export class Fornecedores implements OnInit {
  private readonly service = inject(FornecedoresService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** RBAC de UX (FC-07): só ADMIN vê/usa as ações de escrita. O back é a fonte de verdade. */
  protected readonly ehAdmin = this.auth.ehAdmin;

  protected readonly fornecedores = signal<Fornecedor[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly totalElementos = signal(0);
  protected readonly pagina = signal(0);
  protected readonly tamanho = signal(12);
  protected readonly vazia = computed(
    () => !this.carregando() && !this.erro() && this.fornecedores().length === 0,
  );

  /** Campo de busca por nome (filtro server-side com debounce — §3.4 `nome` ILIKE). */
  protected readonly filtro = new FormControl('', { nonNullable: true });

  /**
   * Gancho do form (T-M5-10, CA-12): `formAberto` + `fornecedorEmEdicao` (null = criar). Os handlers
   * já armam estes signals; o `fornecedor-form` que os consome ainda NÃO existe (chega na T-M5-10),
   * então a lista ainda não renderiza overlay algum — mantém `ng build`/`ng test` verdes.
   */
  protected readonly formAberto = signal(false);
  protected readonly fornecedorEmEdicao = signal<Fornecedor | null>(null);

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
        this.fornecedores.set(pagina.conteudo);
        this.totalElementos.set(pagina.totalElementos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os fornecedores. Tente novamente.');
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

  /** Inicial do monograma (assinatura da tela): 1ª letra do nome em maiúscula. */
  protected inicial(nome: string): string {
    return nome.trim().charAt(0).toUpperCase() || '?';
  }

  // --- Form de criar/editar (T-M5-10, CA-12/CA-13 — só ADMIN) ---

  /** Abre o form em modo criação. Guarda de UX: ignora se não for ADMIN (o back também barra). */
  protected novoFornecedor(): void {
    if (!this.ehAdmin()) {
      return;
    }
    this.fornecedorEmEdicao.set(null);
    this.formAberto.set(true);
  }

  /** Abre o form em modo edição do fornecedor escolhido (só ADMIN). */
  protected editarFornecedor(f: Fornecedor): void {
    if (!this.ehAdmin()) {
      return;
    }
    this.fornecedorEmEdicao.set(f);
    this.formAberto.set(true);
  }

  // --- Exclusão (T-M5-9, CA-14, FC-08 — só ADMIN) ---

  /**
   * Abre a confirmação de exclusão exibindo o NOME (FC-08, reusa `confirmar-exclusao`). Só ao
   * confirmar dispara o `DELETE` (hard delete; o cascade limpa `fornecedor_produto` sem tocar
   * produtos — §4.3). Cancelar/Esc/backdrop não excluem nada. Guarda de UX: ignora se não for ADMIN.
   */
  protected excluirFornecedor(f: Fornecedor): void {
    if (!this.ehAdmin()) {
      return;
    }
    const dados: ConfirmarExclusaoDados = { nome: f.nome };
    this.dialog
      .open(ConfirmarExclusao, { data: dados, maxWidth: 'min(28rem, calc(100vw - 2rem))' })
      .afterClosed()
      .subscribe((confirmado) => {
        if (confirmado) {
          this.confirmarExclusao(f);
        }
      });
  }

  private confirmarExclusao(f: Fornecedor): void {
    this.service.excluir(f.id).subscribe({
      next: () => {
        this.snack.open(`${f.nome} foi removido da agenda.`, 'Fechar', { duration: 4000 });
        this.carregar();
      },
      error: () => {
        this.snack.open('Não foi possível excluir o fornecedor. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }
}
