import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../../core/services/auth.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { UsuarioSessao } from '../../../core/models/auth.model';

/**
 * Tela de login (SPEC-M1 §7 T-M1-8, CA-13/CA-14).
 *
 * Form reativo e-mail+senha → `AuthService.login`. Trata `401` (mensagem genérica
 * "Credenciais inválidas.", §3.2) e `400 VALIDATION_ERROR` (erro por campo via `details`).
 *
 * Redireciono pós-login (SPEC-M2 §4, AD-SQ-33): ADMIN e USER vão para a Home `/painel`
 * dentro do shell. Substitui o destino do M1 (ADMIN→/usuarios, USER→/trocar-senha), agora
 * que existe home. `senhaProvisoria` segue apenas informativo (AD-SQ-24, sem troca forçada).
 *
 * Design distintivo (§9): "etiqueta de viveiro sobre a bancada do ateliê" — ver login.scss.
 */
@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Form reativo: e-mail (formato) + senha (obrigatória). Validação fina é do back. */
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required]],
  });

  protected readonly carregando = signal(false);
  /** Mensagem geral (ex.: 401 genérico ou falha de rede). null = sem erro. */
  protected readonly erroGeral = signal<string | null>(null);
  protected readonly senhaVisivel = signal(false);

  /** Habilita o submit só quando não está carregando (validação de campo é do Material). */
  protected readonly podeEnviar = computed(() => !this.carregando());

  protected alternarSenha(): void {
    this.senhaVisivel.update((v) => !v);
  }

  protected entrar(): void {
    if (this.carregando()) {
      return;
    }
    this.erroGeral.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.carregando.set(true);
    const { email, senha } = this.form.getRawValue();

    this.auth.login({ email, senha }).subscribe({
      next: (usuario) => {
        this.carregando.set(false);
        this.redirecionar(usuario);
      },
      error: (erro: HttpErrorResponse) => {
        this.carregando.set(false);
        this.tratarErro(erro);
      },
    });
  }

  /** Home pós-login (AD-SQ-33): ADMIN e USER vão a `/painel` dentro do shell. */
  private redirecionar(_usuario: UsuarioSessao): void {
    this.router.navigate(['/painel']);
  }

  /**
   * 401 → mensagem genérica do contrato (§3.2). 400 → aplica `details` por campo.
   * Qualquer outro (rede/500) → aviso honesto e acionável, sem se desculpar (§9).
   */
  private tratarErro(erro: HttpErrorResponse): void {
    if (erro.status === 401) {
      this.erroGeral.set('Credenciais inválidas.');
      return;
    }
    if (erro.status === 400) {
      this.aplicarErrosDeCampo(erro.error as ApiResponse<unknown> | null);
      return;
    }
    if (erro.status === 0) {
      this.erroGeral.set('Não foi possível falar com o servidor. Verifique a conexão e tente de novo.');
      return;
    }
    this.erroGeral.set('Algo falhou ao entrar. Tente novamente em instantes.');
  }

  /** Espelha os `details` do envelope de erro (§3.1) nos controles do form. */
  private aplicarErrosDeCampo(corpo: ApiResponse<unknown> | null): void {
    const detalhes = corpo?.error?.details ?? [];
    if (detalhes.length === 0) {
      this.erroGeral.set('Confira os dados informados.');
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
