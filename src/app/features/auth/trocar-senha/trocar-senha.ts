import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';
import { ApiResponse } from '../../../core/models/api-response.model';

/**
 * Troca VOLUNTÁRIA da própria senha (SPEC-M1 §7 T-M1-10, CA-14; troca forçada removida no
 * M1.1 — AD-SQ-24).
 *
 * Form reativo `senhaAtual` + `novaSenha` (≥8) + `confirmarNovaSenha` (=== nova) →
 * `AuthService.trocarSenha` → PATCH `/auth/senha` (§3.2). Trata `400 VALIDATION_ERROR`
 * aplicando o `details` no campo (`senhaAtual` → "Senha atual incorreta.") SEM deslogar —
 * só o `401` desloga (interceptor). Estados: carregando / erro / sucesso.
 *
 * Acesso: rota autenticada, sem enforce de senha provisória (o `senhaProvisoriaGuard` foi
 * removido no M1.1). É também o stopgap de destino do USER pós-login enquanto não há home de
 * USER no M1 (CRUDs vêm no M2). Ao sucesso:
 * - ADMIN → navega a `/usuarios` (destino real do M1) + snackbar de confirmação;
 * - USER  → permanece na confirmação de sucesso.
 *
 * Design (§9): reusa a "etiqueta de viveiro" do login (tokens do ateliê) — MESMO produto.
 */
@Component({
  selector: 'app-trocar-senha',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './trocar-senha.html',
  styleUrl: './trocar-senha.scss',
})
export class TrocarSenha {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  /** Confere que a confirmação bate com a nova senha (lê o irmão via parent). */
  private readonly confereConfirmacao = (controle: AbstractControl): ValidationErrors | null => {
    const nova = controle.parent?.get('novaSenha')?.value;
    return nova && controle.value && nova !== controle.value ? { diferente: true } : null;
  };

  protected readonly form = this.fb.nonNullable.group({
    senhaAtual: ['', [Validators.required]],
    novaSenha: ['', [Validators.required, Validators.minLength(8)]],
    confirmarNovaSenha: ['', [Validators.required, this.confereConfirmacao]],
  });

  protected readonly enviando = signal(false);
  protected readonly sucesso = signal(false);
  /** Mensagem geral (rede/erro inesperado). null = sem erro. */
  protected readonly erroGeral = signal<string | null>(null);
  protected readonly senhasVisiveis = signal(false);

  /** Capturado na entrada: 1º login forçado muda a copy (acolhe em vez de "renovar"). */
  protected readonly forcado = signal(this.auth.usuarioAtual()?.senhaProvisoria ?? false);
  /** ADMIN tem destino real no M1; USER fica na confirmação (sem home ainda). */
  protected readonly ehAdmin = computed(() => this.auth.ehAdmin());

  constructor() {
    // Reavalia a confirmação quando a nova senha muda (mantém o erro "não confere" vivo).
    this.form.controls.novaSenha.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.form.controls.confirmarNovaSenha.updateValueAndValidity({ emitEvent: false });
    });
  }

  protected alternarSenhas(): void {
    this.senhasVisiveis.update((v) => !v);
  }

  protected salvar(): void {
    if (this.enviando()) {
      return;
    }
    this.erroGeral.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    const { senhaAtual, novaSenha } = this.form.getRawValue();

    this.auth.trocarSenha(senhaAtual, novaSenha).subscribe({
      next: () => this.aoTrocar(),
      error: (erro: HttpErrorResponse) => this.tratarErro(erro),
    });
  }

  /** Sucesso: flag já zerada no serviço → libera navegação (ADMIN) ou confirma (USER). */
  private aoTrocar(): void {
    this.enviando.set(false);
    this.sucesso.set(true);
    if (this.ehAdmin()) {
      this.snack.open('Senha atualizada com sucesso.', 'Fechar', { duration: 4000 });
      this.router.navigate(['/usuarios']);
    }
  }

  /**
   * `400` → aplica `details` por campo (`senhaAtual` incorreta), SEM deslogar (§3.2/CA-10).
   * Rede/inesperado → aviso honesto e acionável, sem se desculpar (§9).
   */
  private tratarErro(erro: HttpErrorResponse): void {
    this.enviando.set(false);
    if (erro.status === 400) {
      this.aplicarErrosDeCampo(erro.error as ApiResponse<unknown> | null);
      return;
    }
    if (erro.status === 0) {
      this.erroGeral.set('Não foi possível falar com o servidor. Verifique a conexão e tente de novo.');
      return;
    }
    this.erroGeral.set('Não foi possível trocar a senha agora. Tente novamente em instantes.');
  }

  /** Espelha os `details` do envelope (§3.1) nos controles; 400 sem details cai em senhaAtual. */
  private aplicarErrosDeCampo(corpo: ApiResponse<unknown> | null): void {
    const detalhes = corpo?.error?.details ?? [];
    if (detalhes.length === 0) {
      this.form.controls.senhaAtual.setErrors({ servidor: 'Senha atual incorreta.' });
      return;
    }
    for (const item of detalhes) {
      const controle = this.form.get(item.field);
      if (controle) {
        controle.setErrors({ servidor: item.message });
      } else {
        this.erroGeral.set(item.message);
      }
    }
  }
}
