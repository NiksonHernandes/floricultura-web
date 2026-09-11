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

import { CoresService } from './cores.service';
import { CorForm } from './cor-form/cor-form';
import {
  ConfirmarExclusao,
  ConfirmarExclusaoDados,
} from '../../produtos/confirmar-exclusao/confirmar-exclusao';
import { AuthService } from '../../../core/services/auth.service';
import { ApiResponse } from '../../../core/models/api-response.model';
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
 * Tabela densa de TRÊS colunas (`Cor` = amostra + nome · `Produtos vinculados` · `Ações`), busca por
 * nome (server-side, debounce 300ms) e paginação 0-based. A T-M6-06a entregou a leitura; a T-M6-06b
 * fechou a escrita: "Nova cor", editar e excluir (`cor-form` + `ConfirmarExclusao`).
 *
 * A coluna "Ações" inteira (cabeçalho + célula) e o botão "Nova cor" vivem sob `@if (ehAdmin())`:
 * a rota já é ADMIN (`adminGuard`), e um cabeçalho "Ações" sobre células vazias seria um rótulo sem
 * dado. Diferente de Clientes/Fornecedores, onde o USER LÊ a tela e a coluna tem de existir sempre.
 *
 * **Exclusão (§3.15/R3):** o front NÃO antecipa o 409 — `produtosVinculados` é informação, não
 * trava. O `DELETE` é sempre tentado e, no 409, exibimos a `message` que o back mandou (com ou sem
 * o número de produtos: a UI nunca lê a contagem da frase) e a linha PERMANECE na lista.
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
    CorForm,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginatorPtBr }],
  templateUrl: './cores.html',
  styleUrl: './cores.scss',
})
export class Cores implements OnInit {
  private readonly service = inject(CoresService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** RBAC de UX (FC-07): o `adminGuard` já protege a rota; o back é a fonte de verdade. */
  protected readonly ehAdmin = this.auth.ehAdmin;

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

  /** Overlay do `cor-form` (T-M6-06b): `corEmEdicao` = null → criar. */
  protected readonly formAberto = signal(false);
  protected readonly corEmEdicao = signal<Cor | null>(null);

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

  // --- Criar / editar (T-M6-06b, CA-30/CA-40 — só ADMIN) ---

  protected novaCor(): void {
    this.abrirForm(null);
  }

  protected editarCor(c: Cor): void {
    this.abrirForm(c);
  }

  private abrirForm(c: Cor | null): void {
    if (!this.ehAdmin()) {
      return;
    }
    this.corEmEdicao.set(c);
    this.formAberto.set(true);
  }

  protected fecharForm(): void {
    this.formAberto.set(false);
    this.corEmEdicao.set(null);
  }

  /** O nome no aviso é o que o back DEVOLVEU (já canônico) — nunca o que foi digitado (R1d). */
  protected aoSalvar(c: Cor): void {
    const criada = this.corEmEdicao() === null;
    this.fecharForm();
    this.snack.open(
      criada ? `${c.nome} entrou na cartela.` : `${c.nome} foi atualizada.`,
      'Fechar',
      { duration: 4000 },
    );
    this.carregar();
  }

  // --- Exclusão (FC-08 + 409 de cor em uso, §3.15/R3) ---

  protected excluirCor(c: Cor): void {
    if (!this.ehAdmin()) {
      return;
    }
    const dados: ConfirmarExclusaoDados = {
      nome: c.nome,
      entidade: 'cor',
      contexto: 'Os produtos que usam esta cor impedem a exclusão.',
    };
    this.dialog
      .open(ConfirmarExclusao, { data: dados, maxWidth: 'min(28rem, calc(100vw - 2rem))' })
      .afterClosed()
      .subscribe((confirmado) => {
        if (confirmado) {
          this.confirmarExclusao(c);
        }
      });
  }

  private confirmarExclusao(c: Cor): void {
    this.service.excluir(c.id).subscribe({
      next: () => {
        this.snack.open(`${c.nome} saiu da cartela.`, 'Fechar', { duration: 4000 });
        this.carregar();
      },
      error: (erro: HttpErrorResponse) => {
        // 409 = cor em uso: a frase pronta do back vai à tela COMO VEIO (com ou sem o número de
        // produtos) e a lista NÃO recarrega — a linha permanece, que é o estado real do servidor.
        const mensagem = (erro.error as ApiResponse<unknown> | null)?.error?.message;
        if (erro.status === 409 && mensagem) {
          this.snack.open(mensagem, 'Fechar', { duration: 6000 });
          return;
        }
        this.snack.open('Não foi possível excluir a cor. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }
}
