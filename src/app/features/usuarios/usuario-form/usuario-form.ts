import { Component, inject, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { UsuariosService } from '../usuarios.service';
import { Usuario } from '../../../core/models/auth.model';
import { ApiResponse } from '../../../core/models/api-response.model';

/**
 * Formulário de cadastro de usuário (SPEC-M1 §7 T-M1-9, CA-14 — fatia "form").
 *
 * Form reativo nome+e-mail+senha+papel → `UsuariosService.criar` (POST /usuarios).
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
    MatSelectModule,
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

  /** Validação de campo espelha as regras do §3.2 (a validação forte é do back). */
  protected readonly form = this.fb.nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(180)]],
    senha: ['', [Validators.required, Validators.minLength(8)]],
    role: ['USER' as 'ADMIN' | 'USER', [Validators.required]],
  });

  protected cadastrar(): void {
    if (this.enviando()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.service.criar(this.form.getRawValue()).subscribe({
      next: (novo) => {
        this.enviando.set(false);
        this.criado.emit(novo);
        this.form.reset({ nome: '', email: '', senha: '', role: 'USER' });
      },
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        this.tratarErro(erro);
      },
    });
  }

  protected cancelar(): void {
    this.form.reset({ nome: '', email: '', senha: '', role: 'USER' });
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
