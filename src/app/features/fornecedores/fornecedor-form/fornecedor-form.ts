import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { FornecedoresService } from '../fornecedores.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Fornecedor, FornecedorRequest } from '../../../core/models/fornecedor.model';

/**
 * Form de criar/editar fornecedor — "a folha da agenda" (SPEC-M5 §7 T-M5-10, §3.6, CA-12/CA-13/CA-15;
 * REVISÃO 2026-09-04/RF-1 — AD-SQ-65).
 *
 * Espelho fiel de `cliente-form` (T-M5-8): overlay modal hospedado pela lista (`Fornecedores`),
 * reativo, validação do §4.1 (a forte é do back): `nome` (req, ≤150), `telefone` (≤40, string livre),
 * `email` (`Validators.email` quando presente, ≤180), `observacoes` (≤500) com **aviso LGPD**. Sem
 * `fornecedor` = criar (`POST`); com `fornecedor` = editar (`PUT`).
 *
 * **RF-1 — sem multiselect de produtos.** O vínculo fornecedor↔produto deixou de nascer do cadastro e
 * passou a ser DERIVADO da movimentação (ENTRADAS — AD-SQ-65). O form NÃO carrega opções de produto
 * (`GET /produtos`), NÃO busca o detalhe para pré-selecionar vínculo e NÃO envia `produtoIds` no
 * payload. Os campos que restam são só `nome/telefone/email/observacoes`.
 *
 * Só ADMIN escreve (FC-07) — a lista só abre p/ ADMIN; o back é a fonte de verdade (403). Ao sucesso
 * emite `salvo` (a lista fecha e recarrega). O hard delete (FC-08) é da lista.
 */
@Component({
  selector: 'app-fornecedor-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './fornecedor-form.html',
  styleUrl: './fornecedor-form.scss',
})
export class FornecedorForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(FornecedoresService);

  /** Fornecedor em edição; `null`/ausente = modo criação. */
  readonly fornecedor = input<Fornecedor | null>(null);

  /** Emite o fornecedor salvo (criado/editado) para a lista-mãe recarregar. */
  readonly salvo = output<Fornecedor>();
  /** Emite quando o operador cancela/fecha sem salvar. */
  readonly cancelado = output<void>();

  protected readonly enviando = signal(false);
  protected readonly erroGeral = signal<string | null>(null);

  protected readonly editando = computed(() => this.fornecedor() !== null);

  /**
   * Validação espelha o §4.1 (a forte é do back). `email` usa `Validators.email` — vazio é VÁLIDO
   * (opcional), valor presente inválido bloqueia o envio. Opcionais em branco viram `null` no payload.
   */
  protected readonly form = this.fb.group({
    nome: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(150)]),
    telefone: this.fb.nonNullable.control('', [Validators.maxLength(40)]),
    email: this.fb.nonNullable.control('', [Validators.email, Validators.maxLength(180)]),
    observacoes: this.fb.nonNullable.control('', [Validators.maxLength(500)]),
  });

  ngOnInit(): void {
    const f = this.fornecedor();
    if (f) {
      // Campos escalares já vêm no item de lista; RF-1 não pré-carrega vínculo (derivado do ledger).
      this.form.setValue({
        nome: f.nome,
        telefone: f.telefone ?? '',
        email: f.email ?? '',
        observacoes: f.observacoes ?? '',
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
    const alvo = this.fornecedor();

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

  /**
   * Monta o payload §3.3: opcionais em branco viram `null`. RF-1: sem `produtoIds` (vínculo é derivado
   * da movimentação — AD-SQ-65).
   */
  private montarPayload(): FornecedorRequest {
    const v = this.form.getRawValue();
    return {
      nome: v.nome.trim(),
      telefone: v.telefone.trim() || null,
      email: v.email.trim() || null,
      observacoes: v.observacoes.trim() || null,
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
      this.erroGeral.set('Você não tem permissão para salvar fornecedores.');
      return;
    }
    this.erroGeral.set('Não foi possível salvar agora. Tente novamente.');
  }
}
