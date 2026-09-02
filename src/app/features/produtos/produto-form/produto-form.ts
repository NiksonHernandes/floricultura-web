import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ProdutosService } from '../produtos.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Produto, ProdutoRequest, UnidadeMedida } from '../../../core/models/produto.model';

/** Opções do select de unidade (AD-SQ-31): valor = código ASCII persistido; rótulo amigável (`m³`, `L`). */
export const OPCOES_UNIDADE: ReadonlyArray<{ valor: UnidadeMedida; rotulo: string }> = [
  { valor: 'un', rotulo: 'Unidade (un)' },
  { valor: 'kg', rotulo: 'Quilograma (kg)' },
  { valor: 'saco', rotulo: 'Saco' },
  { valor: 'm3', rotulo: 'Metro cúbico (m³)' },
  { valor: 'l', rotulo: 'Litro (L)' },
  { valor: 'g', rotulo: 'Grama (g)' },
];

/**
 * Form de criar/editar produto — "a ficha do vaso" (SPEC-M2 §7 T-M2-8, CA-20 parte form).
 *
 * Conteúdo de um diálogo modal hospedado pela lista (`Produtos`). Reativo, espelha a validação
 * do §3.2 (a validação forte é do back): `nome` (2..150, req), `descricao` (opcional),
 * `unidadeMedida` (select do enum, req — AD-SQ-31), `estoqueMinimo` (req, ≥0), `preco`
 * (OPCIONAL, ≥0 — ausência = `null`, AD-SQ-28), `imagemUrl` (opcional, ≤1000, sem validação de
 * existência — AD-SQ-32). **NÃO** há campo de estoque atual: estoque só muda por movimentação
 * (AD-SQ-30). Sem `produto` = criar (`POST`); com `produto` = editar (`PUT`).
 *
 * Erro contra o contrato §3.2: `400 VALIDATION_ERROR` → aplica `error.details` por campo;
 * demais falhas → banner geral. Só ADMIN escreve (FC-07) — a lista só abre este form p/ ADMIN.
 * Ao sucesso emite `salvo` (a lista recarrega).
 */
@Component({
  selector: 'app-produto-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './produto-form.html',
  styleUrl: './produto-form.scss',
})
export class ProdutoForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ProdutosService);

  /** Produto em edição; `null`/ausente = modo criação (nova instância por abertura do diálogo). */
  readonly produto = input<Produto | null>(null);

  /** Emite o produto salvo (criado/editado) para a lista-mãe recarregar. */
  readonly salvo = output<Produto>();
  /** Emite quando o operador cancela/fecha sem salvar. */
  readonly cancelado = output<void>();

  protected readonly enviando = signal(false);
  protected readonly erroGeral = signal<string | null>(null);
  protected readonly opcoesUnidade = OPCOES_UNIDADE;

  protected readonly editando = computed(() => this.produto() !== null);

  /** Validação de campo espelha o §3.2; `estoqueAtual` fica de fora (AD-SQ-30). */
  protected readonly form = this.fb.group({
    nome: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(150),
    ]),
    descricao: this.fb.nonNullable.control('', [Validators.maxLength(2000)]),
    unidadeMedida: this.fb.nonNullable.control<UnidadeMedida | ''>('', [Validators.required]),
    estoqueMinimo: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    preco: this.fb.control<number | null>(null, [Validators.min(0)]),
    imagemUrl: this.fb.nonNullable.control('', [Validators.maxLength(1000)]),
  });

  ngOnInit(): void {
    const p = this.produto();
    if (p) {
      // Modo edição: pré-preenche do produto (sem `estoqueAtual` — não é editável por CRUD).
      this.form.setValue({
        nome: p.nome,
        descricao: p.descricao ?? '',
        unidadeMedida: p.unidadeMedida,
        estoqueMinimo: p.estoqueMinimo,
        preco: p.preco,
        imagemUrl: p.imagemUrl ?? '',
      });
    }
  }

  protected salvar(): void {
    if (this.enviando()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.erroGeral.set(null);
    const req = this.montarPayload();
    const alvo = this.produto();
    const requisicao = alvo ? this.service.atualizar(alvo.id, req) : this.service.criar(req);

    requisicao.subscribe({
      next: (salvo) => {
        this.enviando.set(false);
        this.salvo.emit(salvo);
      },
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        this.tratarErro(erro);
      },
    });
  }

  protected cancelar(): void {
    this.cancelado.emit();
  }

  /** Monta o payload §3.2: opcionais vazios viram `null` (ausência honesta, não string vazia). */
  private montarPayload(): ProdutoRequest {
    const v = this.form.getRawValue();
    return {
      nome: v.nome.trim(),
      descricao: v.descricao.trim() || null,
      unidadeMedida: v.unidadeMedida as UnidadeMedida,
      estoqueMinimo: v.estoqueMinimo!,
      preco: v.preco ?? null,
      imagemUrl: v.imagemUrl.trim() || null,
    };
  }

  /** `400 VALIDATION_ERROR` → `details` por campo; sem details/erro genérico → banner geral. */
  private tratarErro(erro: HttpErrorResponse): void {
    if (erro.status === 400) {
      const detalhes = (erro.error as ApiResponse<unknown> | null)?.error?.details ?? [];
      for (const item of detalhes) {
        this.form.get(item.field)?.setErrors({ servidor: item.message });
      }
      if (detalhes.length === 0) {
        this.erroGeral.set('Confira os dados informados.');
      }
      return;
    }
    if (erro.status === 403) {
      this.erroGeral.set('Você não tem permissão para salvar produtos.');
      return;
    }
    this.erroGeral.set('Não foi possível salvar agora. Tente novamente.');
  }
}
