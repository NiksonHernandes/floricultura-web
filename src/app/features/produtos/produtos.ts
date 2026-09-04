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

import { ProdutosService } from './produtos.service';
import { EventosService } from '../eventos/eventos.service';
import { ProximosEventos } from '../eventos/proximos-eventos/proximos-eventos';
import { ProdutoForm } from './produto-form/produto-form';
import { ImagemProduto } from './imagem-produto/imagem-produto';
import {
  ConfirmarExclusao,
  ConfirmarExclusaoDados,
} from './confirmar-exclusao/confirmar-exclusao';
import {
  MovimentarEstoque,
  MovimentarEstoqueDados,
} from './movimentar-estoque/movimentar-estoque';
import { AuthService } from '../../core/services/auth.service';
import { Movimentacao, Produto, UnidadeMedida } from '../../core/models/produto.model';
import { Evento } from '../../core/models/evento.model';

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
 * estados honestos de carregando/erro (com "tentar de novo")/vazio.
 *
 * T-M2-8 (CA-20, parte form): hospeda o `ProdutoForm` num diálogo modal para ADMIN criar/editar
 * (POST/PUT); ao salvar, a lista recarrega. As ações de escrita ("Novo produto"/"Editar") só
 * aparecem para ADMIN (FC-07, via `authService.ehAdmin`) — o RBAC de verdade é do back.
 *
 * T-M2-9 (CA-20 delete + movimentação / CA-11): "Excluir" abre um diálogo de confirmação
 * (`MatDialog`) exibindo o NOME do produto (FC-08) antes do `DELETE`; "Movimentar" abre o diálogo
 * de estoque (`MatDialog`) que registra ENTRADA/SAÍDA/AJUSTE (AD-SQ-30) — SAÍDA acima do estoque
 * mostra o bloqueio (400) sem quebrar (CA-11). Ambos recarregam a lista ao concluir. Só ADMIN.
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
    ProdutoForm,
    ImagemProduto,
    ProximosEventos,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginatorPtBr }],
  templateUrl: './produtos.html',
  styleUrl: './produtos.scss',
})
export class Produtos implements OnInit {
  private readonly service = inject(ProdutosService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  /**
   * Serviço de eventos (SPEC-M4 §3.4/T-M4-6) para popular o multiselect do form. Injeção
   * OPCIONAL de propósito: provido no `appConfig` (não `providedIn:'root'`), fica `null` nos
   * testes que não o registram — assim os specs do M2/M3 não disparam `GET /eventos` (anti-burla).
   */
  private readonly eventosService = inject(EventosService, { optional: true });

  /** RBAC de UX (FC-07): só ADMIN vê/usa as ações de escrita. O back é a fonte de verdade. */
  protected readonly ehAdmin = this.auth.ehAdmin;

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

  /** Diálogo do form (T-M2-8): aberto? e produto em edição (null = criar). */
  protected readonly formAberto = signal(false);
  protected readonly produtoEmEdicao = signal<Produto | null>(null);

  /** Opções de eventos para o multiselect do form (T-M4-6) — carregadas 1x sob demanda. */
  protected readonly eventos = signal<Evento[]>([]);
  private eventosCarregados = false;

  /**
   * Marca transitória (T-M2-11/CA-22): o form emite `entradaInicialFalhou` ANTES de `salvo` quando o
   * produto é criado mas a ENTRADA inicial falha. `aoSalvar` lê e limpa esta marca para escolher o
   * snackbar de warning em vez do de sucesso — o produto existe (estoque 0), só o lançamento faltou.
   */
  private entradaInicialFalhou = false;

  /**
   * Marca transitória (T-M3-5/CA-12): o form emite `imagemFalhou` ANTES de `salvo` quando o produto é
   * criado mas o upload da imagem falha. `aoSalvar` lê e limpa a marca para avisar (snackbar de
   * warning) — o produto existe (sem imagem), a foto pode ser enviada depois na edição.
   */
  private imagemFalhou = false;

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

  // --- Form de criar/editar (T-M2-8, CA-20 — só ADMIN) ---

  /** Abre o form em modo criação. Guarda de UX: ignora se não for ADMIN (o back também barra). */
  protected novoProduto(): void {
    if (!this.ehAdmin()) {
      return;
    }
    this.carregarEventos();
    this.produtoEmEdicao.set(null);
    this.formAberto.set(true);
  }

  /**
   * Abre o form em modo edição (só ADMIN). Busca o DETALHE (`GET /{id}`) para trazer `eventoIds`
   * (a lista não os carrega — §3.4) e pré-selecionar o multiselect; se o detalhe falhar, cai para o
   * item de lista (sem vínculos conhecidos). Também garante as opções de eventos carregadas.
   */
  protected editarProduto(p: Produto): void {
    if (!this.ehAdmin()) {
      return;
    }
    this.carregarEventos();
    this.service.detalhar(p.id).subscribe({
      next: (detalhe) => this.abrirEdicao(detalhe),
      error: () => this.abrirEdicao(p),
    });
  }

  private abrirEdicao(p: Produto): void {
    this.produtoEmEdicao.set(p);
    this.formAberto.set(true);
  }

  /**
   * Carrega as opções do multiselect de eventos 1x (SPEC-M4 §3.4/T-M4-6) via `GET /eventos`. O
   * serviço é opcional (null nos testes do M2/M3): sem ele, o multiselect fica vazio com hint
   * honesto, sem quebrar o cadastro. Falha de rede também degrada em silêncio (opções vazias).
   */
  private carregarEventos(): void {
    if (this.eventosCarregados || !this.eventosService) {
      return;
    }
    this.eventosCarregados = true;
    this.eventosService.listar(0, 100).subscribe({
      next: (pagina) => this.eventos.set(pagina.conteudo),
      error: () => {
        this.eventosCarregados = false; // permite nova tentativa numa próxima abertura
      },
    });
  }

  protected fecharForm(): void {
    this.formAberto.set(false);
    this.produtoEmEdicao.set(null);
    this.entradaInicialFalhou = false;
    this.imagemFalhou = false;
  }

  /**
   * Form sinalizou que o produto foi criado mas a ENTRADA inicial de estoque falhou (AD-SQ-35/CA-22).
   * Emitido ANTES de `salvo` → só registra a marca; `aoSalvar` (a seguir) escolhe o snackbar.
   */
  protected aoEntradaInicialFalhou(): void {
    this.entradaInicialFalhou = true;
  }

  /**
   * Form sinalizou que o produto foi criado mas o upload da imagem falhou (T-M3-5/CA-12). Emitido
   * ANTES de `salvo` → só registra a marca; `aoSalvar` escolhe o snackbar de warning.
   */
  protected aoImagemFalhou(): void {
    this.imagemFalhou = true;
  }

  /** Form emitiu um produto salvo: confirma, fecha e recarrega a fatia atual da lista. */
  protected aoSalvar(p: Produto): void {
    const criado = this.produtoEmEdicao() === null;
    const entradaFalhou = this.entradaInicialFalhou;
    const imagemFalhou = this.imagemFalhou;
    this.fecharForm();
    if (entradaFalhou || imagemFalhou) {
      // Falha parcial (CA-22/CA-12): o produto EXISTE; avisa o que ficou pendente sem desfazer nada.
      const pendencias: string[] = [];
      if (entradaFalhou) {
        pendencias.push('a entrada inicial de estoque não foi registrada (use "Movimentar")');
      }
      if (imagemFalhou) {
        pendencias.push('a imagem não foi enviada (tente novamente ao editar o produto)');
      }
      this.snack.open(`Produto criado, mas ${pendencias.join('; ')}.`, 'Fechar', { duration: 8000 });
    } else {
      this.snack.open(
        criado ? `${p.nome} entrou na prateleira.` : `${p.nome} foi atualizado.`,
        'Fechar',
        { duration: 4000 },
      );
    }
    this.carregar();
  }

  // --- Exclusão + movimentação (T-M2-9, CA-20 delete/mov + CA-11 — só ADMIN) ---

  /**
   * Abre a confirmação de exclusão exibindo o NOME (FC-08). Só ao confirmar dispara o `DELETE`;
   * cancelar/Esc/backdrop não excluem nada. Ao concluir, a lista recarrega. `MatDialog` garante
   * focus-trap/Esc/backdrop (P2-2/P2-3). Guarda de UX: ignora se não for ADMIN (o back também barra).
   */
  protected excluirProduto(p: Produto): void {
    if (!this.ehAdmin()) {
      return;
    }
    const dados: ConfirmarExclusaoDados = { nome: p.nome };
    this.dialog
      .open(ConfirmarExclusao, { data: dados, maxWidth: 'min(28rem, calc(100vw - 2rem))' })
      .afterClosed()
      .subscribe((confirmado) => {
        if (confirmado) {
          this.confirmarExclusao(p);
        }
      });
  }

  private confirmarExclusao(p: Produto): void {
    this.service.excluir(p.id).subscribe({
      next: () => {
        this.snack.open(`${p.nome} foi excluído da prateleira.`, 'Fechar', { duration: 4000 });
        this.carregar();
      },
      error: () => {
        this.snack.open('Não foi possível excluir o produto. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  /**
   * Abre o diálogo de movimentação (`MatDialog`) do produto. Ao registrar com sucesso, o diálogo
   * fecha devolvendo a `Movimentacao`; a lista recarrega para refletir o novo estoque. O bloqueio
   * de SAÍDA (400) é tratado DENTRO do diálogo (CA-11), sem quebrar a tela.
   */
  protected movimentarProduto(p: Produto): void {
    if (!this.ehAdmin()) {
      return;
    }
    const dados: MovimentarEstoqueDados = { produto: p };
    this.dialog
      .open(MovimentarEstoque, { data: dados, maxWidth: 'min(34rem, calc(100vw - 2rem))' })
      .afterClosed()
      .subscribe((mov: Movimentacao | undefined) => {
        if (mov) {
          this.snack.open(
            `Estoque de ${p.nome} atualizado para ${mov.quantidadeResultante} ${this.rotuloUnidade(
              p.unidadeMedida,
            )}.`,
            'Fechar',
            { duration: 4000 },
          );
          this.carregar();
        }
      });
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
