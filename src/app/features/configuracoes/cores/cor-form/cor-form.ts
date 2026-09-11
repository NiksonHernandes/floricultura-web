import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { CoresService } from '../cores.service';
import { ApiResponse } from '../../../../core/models/api-response.model';
import { Cor, CorRequest } from '../../../../core/models/cor.model';

/** `#RRGGBB` — mesmo formato do back (§3.2); vazio é VÁLIDO aqui (hex é opcional). */
const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * PRÉVIA display-only do canônico (§3.2.1, 5 passos na ordem). NÃO é a regra: a regra mora no back
 * e o payload vai cru (§12 #22). Se um dia isto divergir, o efeito é cosmético — o valor exibido
 * depois do salvamento é sempre o `nome` da resposta. Por isso não é exportada: nada mais no front
 * pode passar a "canonizar" por conta própria.
 */
function previaCanonica(cru: string): string {
  return cru
    .trim()
    .replace(/\s+/g, '-') // o \s do JS já inclui o NBSP que o Java cita à parte
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

/**
 * Form de criar/editar cor — "a etiqueta do pote de tinta" (SPEC-M6 §3.15, T-M6-06b, CA-30/CA-40).
 *
 * Overlay no padrão de `fornecedor-form` (folha que sobe no celular, caixa na bancada), com dois
 * campos: `nome` (obrigatório) e `hex` (opcional, `#RRGGBB` digitado — **sem** `<input type=color>`,
 * cuja UX e teclado divergem entre navegadores).
 *
 * CA-40: o campo `nome` tem hint FIXO da padronização e uma PRÉVIA do canônico, exibida só quando
 * difere do digitado. O que vai no POST/PUT é o texto **cru** — quem canoniza é o back (§3.2.1).
 * 409 de nome duplicado é exibido **no campo `nome`**, com a `message` que o back mandou.
 */
@Component({
  selector: 'app-cor-form',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  templateUrl: './cor-form.html',
  styleUrl: './cor-form.scss',
})
export class CorForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CoresService);

  /** Cor em edição; `null`/ausente = modo criação. */
  readonly cor = input<Cor | null>(null);

  readonly salvo = output<Cor>();
  readonly cancelado = output<void>();

  protected readonly enviando = signal(false);
  protected readonly erroGeral = signal<string | null>(null);
  protected readonly editando = computed(() => this.cor() !== null);

  protected readonly form = this.fb.group({
    nome: this.fb.nonNullable.control('', [Validators.required]),
    hex: this.fb.nonNullable.control('', [Validators.pattern(HEX)]),
  });

  private readonly nomeCru = toSignal(this.form.controls.nome.valueChanges, { initialValue: '' });
  private readonly hexCru = toSignal(this.form.controls.hex.valueChanges, { initialValue: '' });

  /** Prévia do canônico: `null` quando o digitado já É o canônico (nada a avisar). */
  protected readonly previa = computed(() => {
    const canonico = previaCanonica(this.nomeCru());
    return canonico && canonico !== this.nomeCru() ? canonico : null;
  });

  /** Amostra ao vivo: só pinta hex COMPLETO e válido; o resto fica vazado, como na lista (R2). */
  protected readonly amostra = computed(() => (HEX.test(this.hexCru()) ? this.hexCru() : null));

  ngOnInit(): void {
    const c = this.cor();
    if (c) {
      this.form.setValue({ nome: c.nome, hex: c.hex ?? '' });
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
    const v = this.form.getRawValue();
    // `nome` sem NENHUMA transformação (nem `trim`): o passo 1 do canônico também é do back.
    const req: CorRequest = { nome: v.nome, hex: v.hex.trim() || null };
    const alvo = this.cor();

    (alvo ? this.service.atualizar(alvo.id, req) : this.service.criar(req)).subscribe({
      next: (cor) => {
        this.enviando.set(false);
        this.salvo.emit(cor);
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
   * As mensagens vêm PRONTAS do back e são exibidas como vieram (§3.2.1):
   * 400 → `details[].field` no campo correspondente · 409 (duplicata) → `message` no campo `nome`.
   * Sem mensagem utilizável, um texto neutro — nunca um palpite sobre a causa.
   */
  private tratarErro(erro: HttpErrorResponse): void {
    const envelope = (erro.error as ApiResponse<unknown> | null)?.error ?? null;
    if (erro.status === 400) {
      const detalhes = envelope?.details ?? [];
      for (const item of detalhes) {
        this.form.get(item.field)?.setErrors({ servidor: item.message });
      }
      if (detalhes.length === 0) {
        this.erroGeral.set(envelope?.message ?? 'Confira os dados informados.');
      }
      return;
    }
    if (erro.status === 409 && envelope?.message) {
      this.form.controls.nome.setErrors({ servidor: envelope.message });
      return;
    }
    if (erro.status === 403) {
      this.erroGeral.set('Você não tem permissão para salvar cores.');
      return;
    }
    this.erroGeral.set('Não foi possível salvar agora. Tente novamente.');
  }
}
