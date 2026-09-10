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

import { ClientesService, DirecaoOrdem, OrdemContato } from './clientes.service';
import { ClienteForm } from './cliente-form/cliente-form';
import {
  ConfirmarExclusao,
  ConfirmarExclusaoDados,
} from '../produtos/confirmar-exclusao/confirmar-exclusao';
import { AuthService } from '../../core/services/auth.service';
import { Cliente } from '../../core/models/cliente.model';

/** MatPaginator em pt-BR — ecoa `eventos.ts`/`produtos.ts` (rótulo do domínio). */
function paginatorPtBr(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Clientes por página';
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
 * Clientes — "a agenda de contatos do ateliê" (SPEC-M5 §7 T-M5-7, CA-11/CA-13/CA-14/CA-15).
 *
 * Fatia de LISTA (espelha `eventos.ts`/`produtos.ts`, AD-SQ-29): cards mobile-first, paginação
 * server-side via `MatPaginator` 0-based (casa `pagina` do §3.4), filtro por nome com
 * `debounceTime(300)` (ILIKE no back) e estados honestos carregando/erro (com "tentar de novo")/
 * vazio. Leitura para USER+ADMIN; o menu "Clientes" é `soAdmin:false`.
 *
 * As ações de escrita (Novo/Editar/Excluir) só aparecem para `ehAdmin()` (RBAC de UX, FC-07 — o
 * back é a fonte de verdade). Hard delete (FC-08) reusa `ConfirmarExclusao` (mostra o nome; só ao
 * confirmar dispara o `DELETE`). O `cliente-form` (Novo/Editar) entra com a T-M5-8: os handlers já
 * armam os signals `formAberto`/`clienteEmEdicao` que o form vai consumir.
 *
 * **T-M6-08b (ajuste 8 do dono — SPEC-M6 §3.11, CA-31/CA-37):** os cards viraram uma `<table>`
 * densa (`_tabela-densa.scss`), com dois filtros tri-estado (com/sem telefone, com/sem e-mail) e
 * ordenação por cabeçalho — tudo **server-side** (§3.7), porque filtrar/ordenar só a página
 * corrente mentiria com paginação. Busca e `mat-paginator` permanecem.
 */
@Component({
  selector: 'app-clientes',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    ClienteForm,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginatorPtBr }],
  templateUrl: './clientes.html',
  styleUrl: './clientes.scss',
})
export class Clientes implements OnInit {
  private readonly service = inject(ClientesService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** RBAC de UX (FC-07): só ADMIN vê/usa as ações de escrita. O back é a fonte de verdade. */
  protected readonly ehAdmin = this.auth.ehAdmin;

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly totalElementos = signal(0);
  protected readonly pagina = signal(0);
  protected readonly tamanho = signal(12);
  protected readonly vazia = computed(
    () => !this.carregando() && !this.erro() && this.clientes().length === 0,
  );

  /** Campo de busca por nome (filtro server-side com debounce — §3.4 `nome` ILIKE). */
  protected readonly filtro = new FormControl('', { nonNullable: true });

  // --- Ajuste 8 (T-M6-08b): filtros tri-estado + ordenação, ambos server-side (§3.7/§3.11) ---

  /** Tri-estado dos filtros de contato: `null` = Todos · `true` = Com · `false` = Sem. */
  protected readonly comTelefone = signal<boolean | null>(null);
  protected readonly comEmail = signal<boolean | null>(null);

  /** As 3 opções de cada filtro, na ordem da fileira (evita repetir 3 botões no template). */
  protected readonly opcoesFiltro: ReadonlyArray<{ rotulo: string; valor: boolean | null }> = [
    { rotulo: 'Todos', valor: null },
    { rotulo: 'Com', valor: true },
    { rotulo: 'Sem', valor: false },
  ];

  /**
   * ESTADO DE ORDENAÇÃO — fonte única (§3.11.1/R31). `ordenarPor` + `direcao` são os **únicos**
   * sinais; quem escreve os dois é **só** `definirOrdem`. O `<th>` delega por `alternarOrdem`, e o
   * seletor do celular (T-M6-08d) vai delegar ao MESMO método — nunca um lado sem o outro.
   */
  protected readonly ordenarPor = signal<OrdemContato>('nome');
  protected readonly direcao = signal<DirecaoOrdem>('asc');

  /**
   * Valor do `<select>` do celular (T-M6-08d): PROJEÇÃO do par (campo, direção). `computed` de
   * propósito — um `signal`/`FormControl` aqui criaria um segundo dono da ordenação.
   */
  protected readonly ordemSelecionada = computed(() => `${this.ordenarPor()}:${this.direcao()}`);

  /** Colunas ordenáveis, na ordem do cabeçalho (Observações e Ações não ordenam — §3.11). */
  protected readonly colunas: ReadonlyArray<{ campo: OrdemContato; rotulo: string }> = [
    { campo: 'nome', rotulo: 'Nome' },
    { campo: 'telefone', rotulo: 'Telefone' },
    { campo: 'email', rotulo: 'E-mail' },
  ];

  /**
   * Estado do form (T-M5-8, CA-12): `formAberto` + `clienteEmEdicao` (null = criar). A lista hospeda
   * o overlay `<app-cliente-form>` (renderizado quando `formAberto()`), que consome estes signals e
   * emite `salvo`/`cancelado` de volta (`aoSalvar`/`fecharForm`).
   */
  protected readonly formAberto = signal(false);
  protected readonly clienteEmEdicao = signal<Cliente | null>(null);

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
    const consulta = {
      comTelefone: this.comTelefone(),
      comEmail: this.comEmail(),
      ordenarPor: this.ordenarPor(),
      direcao: this.direcao(),
    };
    this.service.listar(this.pagina(), this.tamanho(), this.filtro.value, consulta).subscribe({
      next: (pagina) => {
        this.clientes.set(pagina.conteudo);
        this.totalElementos.set(pagina.totalElementos);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os clientes. Tente novamente.');
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

  /** Toda mudança de recorte volta para a 1ª página e refaz UMA requisição (R20). */
  private reiniciar(): void {
    this.pagina.set(0);
    this.carregar();
  }

  /** Filtro tri-estado de telefone (`null` = Todos). Uma requisição por clique. */
  protected filtrarPorTelefone(valor: boolean | null): void {
    this.comTelefone.set(valor);
    this.reiniciar();
  }

  /** Filtro tri-estado de e-mail (`null` = Todos). Uma requisição por clique. */
  protected filtrarPorEmail(valor: boolean | null): void {
    this.comEmail.set(valor);
    this.reiniciar();
  }

  /**
   * ÚNICO escritor do estado de ordenação (§3.11.1): seta campo **e** direção juntos, volta para a
   * 1ª página e recarrega. Todo afordance de ordenação (o `<th>` hoje, o seletor do celular na
   * T-M6-08d) passa por aqui — é o que impede estado divergente entre breakpoints.
   */
  protected definirOrdem(campo: OrdemContato, direcao: DirecaoOrdem): void {
    this.ordenarPor.set(campo);
    this.direcao.set(direcao);
    this.reiniciar();
  }

  /** Cabeçalho clicado: mesma coluna inverte a direção; coluna nova começa em `asc`. */
  protected alternarOrdem(campo: OrdemContato): void {
    const invertida = this.ordenarPor() === campo && this.direcao() === 'asc' ? 'desc' : 'asc';
    this.definirOrdem(campo, invertida);
  }

  /**
   * Seletor do celular (§3.11.1): quebra `campo:direcao` e delega ao MESMO escritor do `<th>` — uma
   * escolha, uma requisição, e meio-estado ("troquei o campo, ainda não a direção") impossível.
   */
  protected aoOrdenarNoCelular(valor: string): void {
    const [campo, direcao] = valor.split(':');
    this.definirOrdem(campo as OrdemContato, direcao as DirecaoOrdem);
  }

  /** `aria-sort` do `<th>` (a11y §9): só a coluna ativa anuncia a direção. */
  protected ariaSort(campo: OrdemContato): 'ascending' | 'descending' | 'none' {
    if (this.ordenarPor() !== campo) {
      return 'none';
    }
    return this.direcao() === 'asc' ? 'ascending' : 'descending';
  }

  /** Inicial do monograma (assinatura da tela): 1ª letra do nome em maiúscula. */
  protected inicial(nome: string): string {
    return nome.trim().charAt(0).toUpperCase() || '?';
  }

  // --- Form de criar/editar (T-M5-8, CA-12/CA-13 — só ADMIN) ---

  /** Abre o form em modo criação. Guarda de UX: ignora se não for ADMIN (o back também barra). */
  protected novoCliente(): void {
    if (!this.ehAdmin()) {
      return;
    }
    this.clienteEmEdicao.set(null);
    this.formAberto.set(true);
  }

  /** Abre o form em modo edição do cliente escolhido (só ADMIN). */
  protected editarCliente(c: Cliente): void {
    if (!this.ehAdmin()) {
      return;
    }
    this.clienteEmEdicao.set(c);
    this.formAberto.set(true);
  }

  /** Fecha o overlay do form (cancelar/Esc/véu) sem salvar. */
  protected fecharForm(): void {
    this.formAberto.set(false);
    this.clienteEmEdicao.set(null);
  }

  /** Form emitiu um cliente salvo: confirma, fecha e recarrega a fatia atual da lista. */
  protected aoSalvar(c: Cliente): void {
    const criado = this.clienteEmEdicao() === null;
    this.fecharForm();
    this.snack.open(
      criado ? `${c.nome} entrou na agenda.` : `${c.nome} foi atualizado.`,
      'Fechar',
      { duration: 4000 },
    );
    this.carregar();
  }

  // --- Exclusão (T-M5-7, CA-14, FC-08 — só ADMIN) ---

  /**
   * Abre a confirmação de exclusão exibindo o NOME (FC-08, reusa `confirmar-exclusao`). Só ao
   * confirmar dispara o `DELETE` (hard delete; o cascade limpa `cliente_produto` sem tocar produtos —
   * §4.3). Cancelar/Esc/backdrop não excluem nada. Guarda de UX: ignora se não for ADMIN.
   */
  protected excluirCliente(c: Cliente): void {
    if (!this.ehAdmin()) {
      return;
    }
    const dados: ConfirmarExclusaoDados = { nome: c.nome };
    this.dialog
      .open(ConfirmarExclusao, { data: dados, maxWidth: 'min(28rem, calc(100vw - 2rem))' })
      .afterClosed()
      .subscribe((confirmado) => {
        if (confirmado) {
          this.confirmarExclusao(c);
        }
      });
  }

  private confirmarExclusao(c: Cliente): void {
    this.service.excluir(c.id).subscribe({
      next: () => {
        this.snack.open(`${c.nome} foi removido da agenda.`, 'Fechar', { duration: 4000 });
        this.carregar();
      },
      error: () => {
        this.snack.open('Não foi possível excluir o cliente. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }
}
