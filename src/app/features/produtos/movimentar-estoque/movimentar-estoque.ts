import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';

import { ProdutosService } from '../produtos.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import {
  Movimentacao,
  MovimentacaoRequest,
  Produto,
  TipoMovimentacao,
  UnidadeMedida,
} from '../../../core/models/produto.model';

/** Dados do diálogo: o produto cujo estoque será movimentado. */
export interface MovimentarEstoqueDados {
  produto: Produto;
}

/** Rótulos amigáveis de unidade (AD-SQ-31): `m3` vira `m³`. */
const ROTULOS_UNIDADE: Record<UnidadeMedida, string> = {
  un: 'un',
  kg: 'kg',
  saco: 'saco',
  m3: 'm³',
  l: 'L',
  g: 'g',
};

/** Rótulos e descrição de cada tipo (AD-SQ-30) — orienta o operador sem esconder a semântica. */
export const OPCOES_TIPO: ReadonlyArray<{
  valor: TipoMovimentacao;
  rotulo: string;
  dica: string;
}> = [
  { valor: 'ENTRADA', rotulo: 'Entrada', dica: 'Soma ao estoque atual.' },
  { valor: 'SAIDA', rotulo: 'Saída', dica: 'Subtrai do estoque (não pode passar do disponível).' },
  { valor: 'AJUSTE', rotulo: 'Ajuste', dica: 'Define a quantidade final (0 = zerar).' },
];

/**
 * Diálogo de movimentação de estoque — "o livro-caixa da prateleira"
 * (SPEC-M2 §7 T-M2-9, CA-20 parte movimentação / CA-11, AD-SQ-30).
 *
 * Registra ENTRADA/SAÍDA/AJUSTE contra o ledger imutável. A SAÍDA acima do estoque volta `400`
 * com `message:"Estoque insuficiente (X em estoque)."`, que é exibido NO diálogo sem quebrar a
 * tela nem fechar (CA-11). Ao sucesso fecha devolvendo o `MovimentacaoResponse` (a lista-mãe
 * recarrega o estoque). Mostra também as ÚLTIMAS movimentações (`movimentacoes(id, 0, 5)`).
 * Usa `MatDialog` (focus-trap/Esc/backdrop nativos — P2-2/P2-3). Só ADMIN abre (o back barra USER).
 */
@Component({
  selector: 'app-movimentar-estoque',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './movimentar-estoque.html',
  styleUrl: './movimentar-estoque.scss',
})
export class MovimentarEstoque implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ProdutosService);
  private readonly ref = inject(MatDialogRef<MovimentarEstoque, Movimentacao>);
  protected readonly dados = inject<MovimentarEstoqueDados>(MAT_DIALOG_DATA);

  protected readonly produto = this.dados.produto;
  protected readonly opcoesTipo = OPCOES_TIPO;

  protected readonly enviando = signal(false);
  /** Mensagem de bloqueio/erro do 400 (ex.: "Estoque insuficiente (20 em estoque).") — CA-11. */
  protected readonly erroGeral = signal<string | null>(null);

  /** Últimas movimentações (histórico curto) — `criadoEm DESC`. */
  protected readonly historico = signal<Movimentacao[]>([]);
  protected readonly carregandoHistorico = signal(false);
  protected readonly erroHistorico = signal(false);

  protected readonly form = this.fb.group({
    tipo: this.fb.nonNullable.control<TipoMovimentacao | ''>('', [Validators.required]),
    quantidade: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    motivo: this.fb.nonNullable.control('', [Validators.maxLength(255)]),
  });

  /** Dica contextual do tipo escolhido (semântica AD-SQ-30). */
  protected readonly dicaTipo = computed(() => {
    const t = this.tipoSelecionado();
    return this.opcoesTipo.find((o) => o.valor === t)?.dica ?? null;
  });

  /** Espelha o valor do select num signal (para o `computed` da dica reagir). */
  private readonly tipoSelecionado = signal<TipoMovimentacao | ''>('');

  ngOnInit(): void {
    this.form.controls.tipo.valueChanges.subscribe((t) => this.tipoSelecionado.set(t));
    this.carregarHistorico();
  }

  protected carregarHistorico(): void {
    this.carregandoHistorico.set(true);
    this.erroHistorico.set(false);
    this.service.movimentacoes(this.produto.id, 0, 5).subscribe({
      next: (pagina) => {
        this.historico.set(pagina.conteudo);
        this.carregandoHistorico.set(false);
      },
      error: () => {
        this.erroHistorico.set(true);
        this.carregandoHistorico.set(false);
      },
    });
  }

  protected registrar(): void {
    if (this.enviando()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.erroGeral.set(null);
    const v = this.form.getRawValue();
    const req: MovimentacaoRequest = {
      tipo: v.tipo as TipoMovimentacao,
      quantidade: v.quantidade!,
      motivo: v.motivo.trim() || null,
    };

    this.service.movimentar(this.produto.id, req).subscribe({
      next: (mov) => {
        this.enviando.set(false);
        this.ref.close(mov);
      },
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        this.tratarErro(erro);
      },
    });
  }

  protected cancelar(): void {
    this.ref.close();
  }

  protected rotuloUnidade(): string {
    return ROTULOS_UNIDADE[this.produto.unidadeMedida] ?? this.produto.unidadeMedida;
  }

  protected rotuloTipo(t: TipoMovimentacao): string {
    return this.opcoesTipo.find((o) => o.valor === t)?.rotulo ?? t;
  }

  /**
   * `400` (estoque insuficiente/validação) → exibe a mensagem do envelope sem fechar (CA-11) e
   * aplica `details` por campo quando houver. `403` → mensagem de permissão. Demais → banner genérico.
   */
  private tratarErro(erro: HttpErrorResponse): void {
    if (erro.status === 400) {
      const corpo = erro.error as ApiResponse<unknown> | null;
      const detalhes = corpo?.error?.details ?? [];
      for (const item of detalhes) {
        this.form.get(item.field)?.setErrors({ servidor: item.message });
      }
      // A mensagem principal (ex.: "Estoque insuficiente (20 em estoque).") vai no banner do diálogo.
      this.erroGeral.set(corpo?.error?.message ?? 'Confira os dados informados.');
      return;
    }
    if (erro.status === 403) {
      this.erroGeral.set('Você não tem permissão para movimentar o estoque.');
      return;
    }
    if (erro.status === 404) {
      this.erroGeral.set('Produto não encontrado. Ele pode ter sido excluído.');
      return;
    }
    this.erroGeral.set('Não foi possível registrar agora. Tente novamente.');
  }
}
