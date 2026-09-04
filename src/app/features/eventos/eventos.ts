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

import { EventosService } from './eventos.service';
import { EventoForm } from './evento-form/evento-form';
import { EventoProdutos } from './evento-produtos/evento-produtos';
import {
  ConfirmarExclusao,
  ConfirmarExclusaoDados,
} from '../produtos/confirmar-exclusao/confirmar-exclusao';
import { AuthService } from '../../core/services/auth.service';
import { Evento, TipoEvento } from '../../core/models/evento.model';

/** MatPaginator em pt-BR — ecoa `produtos.ts` (design-distintivo §texto), rótulo do domínio. */
function paginatorPtBr(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Datas por página';
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

/** Rótulos pt-BR do enum `tipo` (§4.1 — o código ASCII é do back; o rótulo é do front). */
export const ROTULOS_TIPO_EVENTO: Record<TipoEvento, string> = {
  COMEMORATIVA: 'Comemorativa',
  FEIRA: 'Feira',
  BENEFICENTE: 'Beneficente',
  ENCOMENDA_CLIENTE: 'Encomenda de cliente',
};

/** Meses abreviados pt-BR para o "selo de calendário" — datas de evento são `LocalDate`. */
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Eventos — "o almanaque sazonal do ateliê" (SPEC-M4 §7 T-M4-4, CA-4/CA-5/CA-8).
 *
 * Fatia de LISTA (espelha `produtos.ts`, AD-SQ-29): cards mobile-first, paginação server-side via
 * `MatPaginator` 0-based (casa `pagina` do §3.2), filtro por nome com `debounceTime(300)` (ILIKE
 * no back) e estados honestos de carregando/erro (com "tentar de novo")/vazio. Leitura para
 * USER+ADMIN; o menu "Eventos" é `soAdmin:false`.
 *
 * As ações de escrita (Novo/Editar/Excluir — só ADMIN, FC-07) e o `evento-form` entram com a
 * T-M4-5.
 */
@Component({
  selector: 'app-eventos',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    EventoForm,
    EventoProdutos,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginatorPtBr }],
  templateUrl: './eventos.html',
  styleUrl: './eventos.scss',
})
export class Eventos implements OnInit {
  private readonly service = inject(EventosService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** RBAC de UX (FC-07): só ADMIN vê/usa as ações de escrita. O back é a fonte de verdade. */
  protected readonly ehAdmin = this.auth.ehAdmin;

  protected readonly eventos = signal<Evento[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly totalElementos = signal(0);
  protected readonly pagina = signal(0);
  protected readonly tamanho = signal(12);
  protected readonly vazia = computed(
    () => !this.carregando() && !this.erro() && this.eventos().length === 0,
  );

  /**
   * Ids dos eventos "iminentes" (≤ 7 dias) — T-M4.1-3, CA-4/CA-5. É **reuso** puro do
   * `faixaUrgencia === 5` de `GET /eventos/proximos` (o mesmo signal compartilhado do serviço que
   * alimenta a Home e o badge), NÃO um recálculo de data no componente. `proximos` vazio/falho ⇒
   * `Set` vazio ⇒ nenhum card destacado, sem erro (degradação graciosa — §4.2).
   */
  protected readonly idsIminentes = computed(
    () => new Set(this.service.proximos().filter((p) => p.faixaUrgencia === 5).map((p) => p.id)),
  );

  /** Campo de busca por nome (filtro server-side com debounce — §3.2 `nome` ILIKE). */
  protected readonly filtro = new FormControl('', { nonNullable: true });

  /** Diálogo do form (T-M4-5): aberto? e evento em edição (null = criar). */
  protected readonly formAberto = signal(false);
  protected readonly eventoEmEdicao = signal<Evento | null>(null);

  /** Vitrine (T-M4.1-2, CA-3): evento cujas flores estão em exibição (null = fechada). ADMIN e USER. */
  protected readonly eventoVitrine = signal<Evento | null>(null);

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
    // Reuso do alerta on-read para destacar os cards ≤ 7 dias (T-M4.1-3). Idempotente (cache no
    // serviço) e degrada em silêncio se falhar — não bloqueia a lista/paginação.
    this.service.carregarProximos();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service.listar(this.pagina(), this.tamanho(), this.filtro.value).subscribe({
      next: (pagina) => {
        this.eventos.set(pagina.conteudo);
        this.totalElementos.set(pagina.totalElementos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar o calendário. Tente novamente.');
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

  protected rotuloTipo(t: TipoEvento): string {
    return ROTULOS_TIPO_EVENTO[t] ?? t;
  }

  // --- Vitrine de flores do evento (T-M4.1-2, CA-3 — ADMIN e USER) ---

  /** Abre o modal com as flores vinculadas ao evento (leitura — sem guarda de RBAC, FC-07). */
  protected abrirVitrine(e: Evento): void {
    this.eventoVitrine.set(e);
  }

  /** Fecha a vitrine (botão/Esc/véu). */
  protected fecharVitrine(): void {
    this.eventoVitrine.set(null);
  }

  // --- Form de criar/editar (T-M4-5, CA-1/2/3/6 — só ADMIN) ---

  /** Abre o form em modo criação. Guarda de UX: ignora se não for ADMIN (o back também barra). */
  protected novoEvento(): void {
    if (!this.ehAdmin()) {
      return;
    }
    this.eventoEmEdicao.set(null);
    this.formAberto.set(true);
  }

  /** Abre o form em modo edição do evento escolhido (só ADMIN). */
  protected editarEvento(e: Evento): void {
    if (!this.ehAdmin()) {
      return;
    }
    this.eventoEmEdicao.set(e);
    this.formAberto.set(true);
  }

  protected fecharForm(): void {
    this.formAberto.set(false);
    this.eventoEmEdicao.set(null);
  }

  /** Form emitiu um evento salvo: confirma, fecha e recarrega a fatia atual da lista. */
  protected aoSalvar(e: Evento): void {
    const criado = this.eventoEmEdicao() === null;
    this.fecharForm();
    this.snack.open(
      criado ? `${e.nome} entrou no calendário.` : `${e.nome} foi atualizado.`,
      'Fechar',
      { duration: 4000 },
    );
    this.carregar();
  }

  // --- Exclusão (T-M4-5, CA-7, FC-08 — só ADMIN) ---

  /**
   * Abre a confirmação de exclusão exibindo o NOME (FC-08, reusa `confirmar-exclusao`). Só ao
   * confirmar dispara o `DELETE` (hard delete; o cascade limpa `evento_produto` sem tocar produtos —
   * §4.1). Cancelar/Esc/backdrop não excluem nada. Guarda de UX: ignora se não for ADMIN.
   */
  protected excluirEvento(e: Evento): void {
    if (!this.ehAdmin()) {
      return;
    }
    const dados: ConfirmarExclusaoDados = { nome: e.nome };
    this.dialog
      .open(ConfirmarExclusao, { data: dados, maxWidth: 'min(28rem, calc(100vw - 2rem))' })
      .afterClosed()
      .subscribe((confirmado) => {
        if (confirmado) {
          this.confirmarExclusao(e);
        }
      });
  }

  private confirmarExclusao(e: Evento): void {
    this.service.excluir(e.id).subscribe({
      next: () => {
        this.snack.open(`${e.nome} foi removido do calendário.`, 'Fechar', { duration: 4000 });
        this.carregar();
      },
      error: () => {
        this.snack.open('Não foi possível excluir o evento. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  // --- Formatação de datas `LocalDate` (`yyyy-MM-dd`, sem hora — §9). Split manual evita o
  //     deslocamento de fuso que o DatePipe introduziria numa data sem timezone (AD-SQ-40). ---

  /** Dia (dd) do "selo de calendário" a partir de `yyyy-MM-dd`. */
  protected dia(iso: string): string {
    return iso.slice(8, 10);
  }

  /** Mês abreviado pt-BR (jan…dez) do selo. */
  protected mesAbrev(iso: string): string {
    const mes = Number(iso.slice(5, 7));
    return MESES_ABREV[mes - 1] ?? '';
  }

  /** Data curta `dd/MM/yyyy` (data única ou extremos do período). */
  protected dataCurta(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }
}
