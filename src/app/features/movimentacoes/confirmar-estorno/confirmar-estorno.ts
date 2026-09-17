import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';

import { Movimentacao } from '../../../core/models/produto.model';
import { ROTULOS_TIPO_MOV } from '../movimentacoes';

/** Dados do diálogo: a linha que será estornada (o resumo é derivado dela). */
export interface ConfirmarEstornoDados {
  movimentacao: Movimentacao;
}

/**
 * Diálogo de confirmação do ESTORNO (SPEC-M7 §3.11-d, D-A/PA#2).
 *
 * O ledger é insert-only: estornar **não desfaz** nada — cria uma linha nova, de tipo invertido, que
 * reverte quantidade e valor. Por isso o diálogo não fala em "desfazer": ele mostra **o que será
 * criado**, para o operador reconhecer o efeito antes de assinar.
 *
 * O `motivo` é **obrigatório (3..255)** — decisão do dono na PA#2. A linha é imutável, então esta é a
 * única chance de gravar o porquê; é o que transforma a linha num documento de auditoria. A validação
 * daqui é de **UX**: quem manda é o back (400 `field=motivo`), e o botão fecha o diálogo devolvendo o
 * texto — **não** dispara HTTP. Quem chama o `POST` (e trata 409/400) é a lista-mãe, mesmo padrão do
 * `ConfirmarExclusao`.
 *
 * Fecha com o `motivo` (string) no confirmar e `undefined` no cancelar/Esc/backdrop.
 */
@Component({
  selector: 'app-confirmar-estorno',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './confirmar-estorno.html',
  styleUrl: './confirmar-estorno.scss',
})
export class ConfirmarEstorno {
  private readonly ref = inject(MatDialogRef<ConfirmarEstorno, string | undefined>);
  protected readonly dados = inject<ConfirmarEstornoDados>(MAT_DIALOG_DATA);

  /** 3..255 espelha o `@NotBlank @Size(min=3,max=255)` do back (PA#2) — mesmo limite, não um "parecido". */
  protected readonly motivo = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(255)],
  });

  /**
   * Tipo da linha que SERÁ CRIADA — o inverso da original (§3.4-a). `AJUSTE` não é estornável (409 do
   * back, §3.4-d) e a tela nem oferece o botão; o `?? ` existe só para não inventar rótulo se chegar.
   */
  protected get tipoInvertido(): string {
    const m = this.dados.movimentacao;
    if (m.tipo === 'ENTRADA') return ROTULOS_TIPO_MOV.SAIDA;
    if (m.tipo === 'SAIDA') return ROTULOS_TIPO_MOV.ENTRADA;
    return ROTULOS_TIPO_MOV.AJUSTE;
  }

  /**
   * Valor que será revertido — **o `totalFinal` GRAVADO na linha**, nunca `quantidade × valorUnitario`.
   *
   * ⚠️ Recalcular aqui reintroduziria a aritmética do §3.2-b no navegador e **erraria toda linha com
   * desconto** (12 × R$ 15,50 = R$ 186,00 bruto, mas com 10 % o que valeu foi R$ 167,40). O back é a
   * autoridade (§3.2-d) e já entregou o número pronto em `NUMERIC(14,2)`. `null` = lançamento sem
   * dinheiro (P6): o diálogo então omite a parte do valor, em vez de mostrar "R$ 0,00" mentindo.
   */
  protected get valorRevertido(): string | null {
    const total = this.dados.movimentacao.totalFinal;
    return total == null
      ? null
      : total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected confirmar(): void {
    if (this.motivo.invalid) {
      this.motivo.markAsTouched();
      return;
    }
    this.ref.close(this.motivo.value.trim());
  }

  protected cancelar(): void {
    this.ref.close(undefined);
  }
}
