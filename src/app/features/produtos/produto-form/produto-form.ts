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

/**
 * Motivo padrão da ENTRADA lançada na criação do produto (AD-SQ-35/CA-22). Grava no ledger
 * o rastro de que o estoque nasceu junto do cadastro (auditável — o estoque nunca fura o ledger).
 */
export const MOTIVO_ENTRADA_INICIAL = 'Estoque inicial (cadastro)';

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
 *
 * T-M2-11 (CA-22, AD-SQ-35): SÓ no modo criação, oferece um campo OPCIONAL de **entrada inicial**
 * de estoque (`FormControl` standalone, FORA do form group — a quantidade NUNCA entra no
 * `ProdutoRequest`). Orquestra 2 chamadas: `POST /produtos` (nasce estoque 0 — AD-SQ-30) → se
 * `entradaInicial > 0`, `POST /produtos/{id}/movimentacoes` (ENTRADA, motivo default). Se a criação
 * dá 201 mas a ENTRADA falha, o produto JÁ existe: emite `salvo` (não recria/deleta) e sinaliza
 * `entradaInicialFalhou` para a lista-mãe avisar (snackbar de warning). O diálogo "Movimentar"
 * (T-M2-9) permanece intacto.
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
  /**
   * Sinaliza que o produto foi criado (201) mas a ENTRADA inicial de estoque falhou (AD-SQ-35).
   * Emitido ANTES de `salvo` no ramo de falha; a lista-mãe troca o snackbar de sucesso pelo de
   * warning (o produto existe com estoque 0 — não é desfeito).
   */
  readonly entradaInicialFalhou = output<void>();

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

  /**
   * Entrada inicial de estoque (AD-SQ-35/CA-22) — controle STANDALONE, FORA do `form` group: a
   * quantidade NUNCA entra no `ProdutoRequest`, só no `MovimentacaoRequest` da 2ª chamada. Opcional
   * (vazio/`null`/`0` = sem ENTRADA); `min(0)` bloqueia negativo. Só é lido/exibido no modo criação.
   */
  protected readonly entradaInicial = this.fb.control<number | null>(null, [Validators.min(0)]);

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
    // No modo criação, a entrada inicial (standalone) também precisa ser válida (não negativa).
    const entradaInvalida = !this.editando() && this.entradaInicial.invalid;
    if (this.form.invalid || entradaInvalida) {
      this.form.markAllAsTouched();
      this.entradaInicial.markAsTouched();
      return;
    }

    this.enviando.set(true);
    this.erroGeral.set(null);
    const req = this.montarPayload();
    const alvo = this.produto();

    if (alvo) {
      // Edição: PUT nunca toca estoque (AD-SQ-30); a entrada inicial não existe/age aqui.
      this.service.atualizar(alvo.id, req).subscribe({
        next: (salvo) => {
          this.enviando.set(false);
          this.salvo.emit(salvo);
        },
        error: (erro: HttpErrorResponse) => {
          this.enviando.set(false);
          this.tratarErro(erro);
        },
      });
      return;
    }

    // Criação: POST /produtos (nasce estoque 0). Só encadeia a 2ª chamada se houver entrada > 0.
    this.service.criar(req).subscribe({
      next: (criado) => {
        const entrada = this.entradaInicial.value;
        if (entrada !== null && entrada > 0) {
          this.registrarEntradaInicial(criado, entrada);
        } else {
          this.enviando.set(false);
          this.salvo.emit(criado);
        }
      },
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        this.tratarErro(erro);
      },
    });
  }

  /**
   * 2ª chamada da orquestração (AD-SQ-35): lança a ENTRADA inicial no ledger via
   * `POST /produtos/{id}/movimentacoes`. No sucesso, emite `salvo` (a lista recarrega o estoque real).
   * Na falha, o produto JÁ existe com estoque 0: sinaliza `entradaInicialFalhou` e AINDA emite `salvo`
   * — NÃO desfaz/deleta o produto e NÃO re-chama `criar` (evita duplicata; semântica de falha CA-22).
   */
  private registrarEntradaInicial(criado: Produto, quantidade: number): void {
    this.service
      .movimentar(criado.id, {
        tipo: 'ENTRADA',
        quantidade,
        motivo: MOTIVO_ENTRADA_INICIAL,
      })
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.salvo.emit(criado);
        },
        error: () => {
          this.enviando.set(false);
          this.entradaInicialFalhou.emit();
          this.salvo.emit(criado);
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
