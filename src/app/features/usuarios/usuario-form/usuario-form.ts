import { Component, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
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

import { UsuariosService } from '../usuarios.service';
import { Usuario } from '../../../core/models/auth.model';
import { ApiResponse } from '../../../core/models/api-response.model';

/**
 * Formulário de cadastro de usuário (SPEC-M1 §7 T-M1-9, CA-14 — fatia "form").
 *
 * Form reativo nome+e-mail+senha(+confirmação) → `UsuariosService.criar` (POST /usuarios).
 * A senha nasce definitiva (não há "provisória" nem troca no 1º acesso — AD-SQ-26 adendo);
 * a confirmação é só do client (mesmo padrão do reset), NÃO viaja no payload ao back.
 * Todo cadastro nasce `USER` (regra do dono) — não há seletor de papel; o back grava USER.
 * Tratamento de erro contra o contrato §3.2:
 * - `409 CONFLICT` (e-mail duplicado) → erro no campo e-mail "E-mail já cadastrado.";
 * - `400 VALIDATION_ERROR` → aplica `error.details` por campo.
 * Ao sucesso emite `criado` (a lista-mãe insere sem novo GET) e limpa o form.
 */
@Component({
  selector: 'app-usuario-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './usuario-form.html',
  styleUrl: './usuario-form.scss',
})
export class UsuarioForm {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(UsuariosService);

  /** Emite o usuário recém-criado para a lista-mãe. */
  readonly criado = output<Usuario>();
  /** Emite quando o operador cancela o cadastro. */
  readonly cancelado = output<void>();

  protected readonly enviando = signal(false);

  /** Confere que a confirmação bate com a senha (mesmo padrão do trocar-senha/reset). */
  private readonly confereConfirmacao = (controle: AbstractControl): ValidationErrors | null => {
    const senha = controle.parent?.get('senha')?.value;
    return senha && controle.value && senha !== controle.value ? { diferente: true } : null;
  };

  /** Validação de campo espelha as regras do §3.2 (a validação forte é do back). */
  protected readonly form = this.fb.nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(180)]],
    senha: ['', [Validators.required, Validators.minLength(8)]],
    confirmarSenha: ['', [Validators.required, this.confereConfirmacao]],
  });

  constructor() {
    // Reavalia a confirmação quando a senha muda (mantém o "não confere" vivo).
    this.form.controls.senha.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.form.controls.confirmarSenha.updateValueAndValidity({ emitEvent: false });
    });
  }

  protected cadastrar(): void {
    if (this.enviando()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // `confirmarSenha` é só do client — o payload ao back leva apenas nome/e-mail/senha.
    const { nome, email, senha } = this.form.getRawValue();
    this.enviando.set(true);
    this.service.criar({ nome, email, senha }).subscribe({
      next: (novo) => {
        this.enviando.set(false);
        this.criado.emit(novo);
        this.form.reset({ nome: '', email: '', senha: '', confirmarSenha: '' });
      },
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        this.tratarErro(erro);
      },
    });
  }

  protected cancelar(): void {
    this.form.reset({ nome: '', email: '', senha: '', confirmarSenha: '' });
    this.cancelado.emit();
  }

  /** 409 → e-mail duplicado no campo; 400 → `details` por campo; resto → erro no e-mail como fallback. */
  private tratarErro(erro: HttpErrorResponse): void {
    if (erro.status === 409) {
      this.form.controls.email.setErrors({ servidor: 'E-mail já cadastrado.' });
      return;
    }
    if (erro.status === 400) {
      const detalhes = (erro.error as ApiResponse<unknown> | null)?.error?.details ?? [];
      for (const item of detalhes) {
        this.form.get(item.field)?.setErrors({ servidor: item.message });
      }
      if (detalhes.length === 0) {
        this.form.controls.email.setErrors({ servidor: 'Confira os dados informados.' });
      }
      return;
    }
    this.form.controls.email.setErrors({
      servidor: 'Não foi possível cadastrar agora. Tente novamente.',
    });
  }
}
