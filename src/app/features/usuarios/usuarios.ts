import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { UsuariosService } from './usuarios.service';
import { UsuarioForm } from './usuario-form/usuario-form';
import { Usuario } from '../../core/models/auth.model';

/**
 * Gestão de usuários — "o canteiro de pessoas do ateliê" (SPEC-M1 §7 T-M1-9, CA-14).
 *
 * Container da fatia "lista": carrega/ordena por nome, hospeda o form de cadastro (filho
 * `UsuarioForm`), e conduz ativar/desativar (com confirmação e 409 último-admin) e o reset
 * de senha por ADMIN (PATCH /{id}/senha). Consome `UsuariosService` (§3.1/§3.2).
 *
 * Design (§9): reusa a paleta/tipografia do login (tokens em _atelie-tokens.scss) — a placa
 * de canteiro ecoa a etiqueta de viveiro; a dália segue reservada só à ação primária.
 */
@Component({
  selector: 'app-usuarios',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    UsuarioForm,
  ],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class Usuarios implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(UsuariosService);
  private readonly snack = inject(MatSnackBar);

  protected readonly usuarios = signal<Usuario[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erroLista = signal<string | null>(null);
  protected readonly formAberto = signal(false);
  protected readonly vazia = computed(() => !this.carregando() && this.usuarios().length === 0);

  /** Alvo da confirmação de ativar/desativar (null = diálogo fechado). */
  protected readonly alvoStatus = signal<Usuario | null>(null);
  protected readonly processandoStatus = signal(false);
  protected readonly erroStatus = signal<string | null>(null);

  /** Alvo do reset de senha (null = diálogo fechado). */
  protected readonly alvoReset = signal<Usuario | null>(null);
  protected readonly processandoReset = signal(false);
  protected readonly resetForm = this.fb.nonNullable.group({
    novaSenha: ['', [Validators.required, Validators.minLength(8)]],
  });

  ngOnInit(): void {
    this.carregar();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erroLista.set(null);
    this.service.listar().subscribe({
      next: (lista) => {
        this.usuarios.set(this.ordenar(lista));
        this.carregando.set(false);
      },
      error: () => {
        this.erroLista.set('Não foi possível carregar o canteiro. Tente novamente.');
        this.carregando.set(false);
      },
    });
  }

  protected alternarForm(): void {
    this.formAberto.update((aberto) => !aberto);
  }

  /** Filho emitiu um usuário criado: insere ordenado, sinaliza e fecha o form. */
  protected aoCriar(novo: Usuario): void {
    this.usuarios.update((lista) => this.ordenar([...lista, novo]));
    this.snack.open(`${novo.nome} entrou no canteiro.`, 'Fechar', { duration: 4000 });
    this.formAberto.set(false);
  }

  // --- Ativar / desativar (com confirmação) ---
  protected pedirStatus(u: Usuario): void {
    this.erroStatus.set(null);
    this.alvoStatus.set(u);
  }

  protected cancelarStatus(): void {
    this.alvoStatus.set(null);
    this.erroStatus.set(null);
  }

  protected confirmarStatus(): void {
    const alvo = this.alvoStatus();
    if (!alvo || this.processandoStatus()) {
      return;
    }
    this.processandoStatus.set(true);
    this.erroStatus.set(null);
    this.service.alterarStatus(alvo.id, !alvo.ativo).subscribe({
      next: (atualizado) => {
        this.processandoStatus.set(false);
        this.substituir(atualizado);
        this.snack.open(
          atualizado.ativo
            ? `${atualizado.nome} voltou ao cultivo.`
            : `${atualizado.nome} ficou em repouso.`,
          'Fechar',
          { duration: 4000 },
        );
        this.alvoStatus.set(null);
      },
      error: (erro: HttpErrorResponse) => {
        this.processandoStatus.set(false);
        this.erroStatus.set(
          erro.status === 409
            ? 'Não é possível desativar o único administrador ativo.'
            : 'Não foi possível alterar o status. Tente novamente.',
        );
      },
    });
  }

  // --- Reset de senha por ADMIN ---
  protected pedirReset(u: Usuario): void {
    this.resetForm.reset({ novaSenha: '' });
    this.alvoReset.set(u);
  }

  protected cancelarReset(): void {
    this.alvoReset.set(null);
  }

  protected confirmarReset(): void {
    const alvo = this.alvoReset();
    if (!alvo || this.processandoReset()) {
      return;
    }
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.processandoReset.set(true);
    this.service.resetarSenha(alvo.id, this.resetForm.getRawValue().novaSenha).subscribe({
      next: () => {
        this.processandoReset.set(false);
        this.substituir({ ...alvo, senhaProvisoria: true });
        this.snack.open(`Senha provisória definida para ${alvo.nome}.`, 'Fechar', { duration: 4000 });
        this.alvoReset.set(null);
      },
      error: (erro: HttpErrorResponse) => {
        this.processandoReset.set(false);
        if (erro.status === 400) {
          this.resetForm.controls.novaSenha.setErrors({
            servidor: 'A senha precisa de ao menos 8 caracteres.',
          });
        } else {
          this.snack.open('Não foi possível redefinir a senha. Tente novamente.', 'Fechar', {
            duration: 4000,
          });
        }
      },
    });
  }

  private ordenar(lista: Usuario[]): Usuario[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  private substituir(u: Usuario): void {
    this.usuarios.update((lista) => lista.map((item) => (item.id === u.id ? u : item)));
  }
}
