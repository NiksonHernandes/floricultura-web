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
import { HttpErrorResponse } from '@angular/common/http';

import { ProdutosService } from './produtos.service';
import { EventosService } from '../eventos/eventos.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { CoresService } from '../configuracoes/cores/cores.service';
import { FiltrosProdutos } from './filtros-produtos/filtros-produtos';
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
import {
  VisualizarProduto,
  VisualizarProdutoDados,
} from './visualizar-produto/visualizar-produto';
import { AuthService } from '../../core/services/auth.service';
import { Movimentacao, Produto, UnidadeMedida } from '../../core/models/produto.model';
import { Evento } from '../../core/models/evento.model';
import { Fornecedor } from '../../core/models/fornecedor.model';
import { Cor } from '../../core/models/cor.model';
import {
  FILTRO_VAZIO,
  FiltroProdutos,
  contarFiltros,
} from '../../core/models/produto-filtro.model';

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
    FiltrosProdutos,
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
  /**
   * Serviço de fornecedores (HISTÓRIA #5/AD-SQ-72) — MESMO padrão OPCIONAL do `eventosService`: null
   * nos specs herdados do M2/M3 (nenhum `GET /fornecedores` dispara — anti-burla). A lista-mãe é a dona
   * da carga; o `produto-form` recebe as opções por `@Input` e fica com superfície HTTP zero.
   */
  private readonly fornecedoresService = inject(FornecedoresService, { optional: true });
  /**
   * Catálogo de cores para o filtro de cor (T-M6-11/§3.14) — MESMO padrão OPCIONAL (AD-SQ-72):
   * provido no `app.config`, fica `null` nos specs herdados do M2/M3, que assim seguem sem
   * disparar `GET /cores`. A lista-mãe é a dona da carga; a barra recebe as opções por `input`.
   */
  private readonly coresService = inject(CoresService, { optional: true });

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

  /**
   * Estado da barra de filtros (T-M6-11/§3.6). A barra é a dona do controle; aqui ele existe para
   * (a) entrar na próxima requisição, (b) voltar para a barra pelo `input valor` quando alguém
   * limpa de fora (estado-vazio) e (c) decidir o texto do estado-vazio.
   */
  protected readonly filtros = signal<FiltroProdutos>(FILTRO_VAZIO);
  protected readonly temFiltro = computed(() => contarFiltros(this.filtros()) > 0);

  /** Catálogo de cores do filtro (`GET /cores`) — carregado 1x na abertura da tela. */
  protected readonly cores = signal<Cor[]>([]);
  private coresCarregadas = false;

  /**
   * Mensagens por campo de um 400 do back (`details[]`, §3.6): `precoMin > precoMax` e
   * `semPreco` junto da faixa. Exibimos a mensagem QUE VEIO — o front não reescreve o erro do
   * servidor nem inventa validação paralela que um dia divergiria.
   */
  protected readonly errosFiltro = signal<string[]>([]);

  /** Diálogo do form (T-M2-8): aberto? e produto em edição (null = criar). */
  protected readonly formAberto = signal(false);
  protected readonly produtoEmEdicao = signal<Produto | null>(null);

  /** Opções de eventos para o multiselect do form (T-M4-6) — carregadas 1x sob demanda. */
  protected readonly eventos = signal<Evento[]>([]);
  private eventosCarregados = false;

  /**
   * Opções de fornecedores para o select da entrada inicial (HISTÓRIA #5/AD-SQ-72) — carregadas 1x na
   * ABERTURA do form (create-only), MESMO padrão dos eventos. `*Prontos` (settled) alimenta o guard
   * anti-flash do form: só com ele o select vazio mostra o estado desabilitado/"nada a vincular".
   */
  protected readonly fornecedores = signal<Fornecedor[]>([]);
  protected readonly fornecedoresProntos = signal(false);
  protected readonly eventosProntos = signal(false);
  private fornecedoresCarregados = false;

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
    // A barra de filtros precisa dos dois catálogos ANTES do primeiro toque (T-M6-11). Os dois
    // serviços são opcionais: sem eles (specs herdados) nenhum GET sai e a barra fica sem opções.
    this.carregarEventos();
    this.carregarCores();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.errosFiltro.set([]);
    this.service.listar(this.pagina(), this.tamanho(), this.filtro.value, this.filtros()).subscribe({
      next: (pagina) => {
        this.produtos.set(pagina.conteudo);
        this.totalElementos.set(pagina.totalElementos);
        this.carregando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        // 400 do §3.6 traz `details[]` com UM item por campo — exibimos cada mensagem como veio.
        const detalhes: string[] = (e?.error?.error?.details ?? []).map(
          (d: { message: string }) => d.message,
        );
        this.errosFiltro.set(detalhes);
        this.erro.set(
          detalhes.length > 0
            ? 'Revise os filtros:'
            : 'Não foi possível carregar a prateleira. Tente novamente.',
        );
        this.carregando.set(false);
      },
    });
  }

  /**
   * A barra emitiu um novo filtro (já com debounce de 300ms — §3.14). Zera a página e faz **uma**
   * requisição: dois controles mexidos no mesmo gesto chegam aqui como um evento só.
   */
  protected aoFiltrar(f: FiltroProdutos): void {
    this.filtros.set(f);
    this.pagina.set(0);
    this.carregar();
  }

  /** "Limpar filtros" do estado-vazio (CA-36). O `input valor` leva o reset de volta à barra. */
  protected limparFiltros(): void {
    this.aoFiltrar(FILTRO_VAZIO);
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
    this.carregarFornecedores();
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
    if (this.eventosCarregados) {
      return;
    }
    // Serviço ausente (specs M2/M3): estado vazio-honesto resolve de imediato, sem GET (AD-SQ-72).
    if (!this.eventosService) {
      this.eventosProntos.set(true);
      return;
    }
    this.eventosCarregados = true;
    this.eventosService.listar(0, 100).subscribe({
      next: (pagina) => {
        this.eventos.set(pagina.conteudo);
        this.eventosProntos.set(true); // settled (mesmo vazio) → libera o estado desabilitado/hint
      },
      error: () => {
        this.eventosCarregados = false; // permite nova tentativa numa próxima abertura (fica neutro)
      },
    });
  }

  /**
   * Carrega as opções do select de fornecedor 1x na abertura do form (HISTÓRIA #5/AD-SQ-72) — MESMO
   * padrão de `carregarEventos`. Serviço opcional (null nos specs herdados → nenhum GET). `next` seta
   * `fornecedoresProntos` (settled, mesmo vazio); serviço ausente resolve de imediato (vazio-honesto);
   * falha degrada em silêncio (fica neutro, permite nova tentativa) — não pisca "nada a vincular".
   */
  private carregarFornecedores(): void {
    if (this.fornecedoresCarregados) {
      return;
    }
    if (!this.fornecedoresService) {
      this.fornecedoresProntos.set(true);
      return;
    }
    this.fornecedoresCarregados = true;
    this.fornecedoresService.listar(0, 100).subscribe({
      next: (pagina) => {
        this.fornecedores.set(pagina.conteudo);
        this.fornecedoresProntos.set(true);
      },
      error: () => {
        this.fornecedoresCarregados = false;
      },
    });
  }

  /**
   * Catálogo de cores do filtro (T-M6-11), 1x por abertura da tela — MESMO padrão dos eventos.
   * Serviço ausente (specs herdados) ⇒ nenhum GET e barra sem opções de cor (vazio honesto, sem
   * inventar cartela); falha de rede degrada em silêncio e permite nova tentativa.
   */
  private carregarCores(): void {
    if (this.coresCarregadas || !this.coresService) {
      return;
    }
    this.coresCarregadas = true;
    this.coresService.listar(0, 100).subscribe({
      next: (pagina) => this.cores.set(pagina.conteudo),
      error: () => {
        this.coresCarregadas = false;
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

  /**
   * Abre o modal "Visualizar produto" (`MatDialog`, só leitura — RF-4/R-CA-10). Disponível para
   * USER+ADMIN (não exige `ehAdmin`). O modal busca a ficha (`GET /produtos/{id}`) e os relacionamentos
   * (`GET /produtos/{id}/relacionamentos`); nada muda no estoque, então não recarrega a lista.
   */
  protected visualizarProduto(p: Produto): void {
    const dados: VisualizarProdutoDados = { produtoId: p.id };
    this.dialog.open(VisualizarProduto, {
      data: dados,
      maxWidth: 'min(36rem, calc(100vw - 2rem))',
    });
  }

  protected rotuloUnidade(u: UnidadeMedida): string {
    return ROTULOS_UNIDADE[u] ?? u;
  }

  /**
   * Sufixo do estoque mínimo no card (AD-SQ-55/T-M4.2-1). Retorna `mín. <N>` só quando
   * `estoqueMinimo > 0` (produto sem mínimo = `0`/nulo → `null`, sem "mín. 0" nem traço órfão). O
   * número é cru (igual ao estoque atual, sem `DecimalPipe` — consistência §3.3). É informativo e
   * independe do selo `estoqueBaixo`, que segue vindo do back (FC-13).
   */
  protected rotuloMinimo(p: Produto): string | null {
    return p.estoqueMinimo != null && p.estoqueMinimo > 0 ? `mín. ${p.estoqueMinimo}` : null;
  }

  /** Preço em BRL; `null` = sem preço definido (empty-state honesto, não "R$ 0,00" fake). */
  protected precoFormatado(p: Produto): string | null {
    if (p.preco === null || p.preco === undefined) return null;
    return p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
