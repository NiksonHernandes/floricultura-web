import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';

/** Dados do diálogo: o NOME do produto a excluir (FC-08 — confirmação exibe o nome). */
export interface ConfirmarExclusaoDados {
  nome: string;
}

/**
 * Diálogo de confirmação de exclusão de produto — "arrancar o vaso da prateleira"
 * (SPEC-M2 §7 T-M2-9, CA-20 parte delete, FC-08).
 *
 * Hard delete é IRREVERSÍVEL: o diálogo exibe o NOME do produto (FC-08) e um aviso claro antes de
 * confirmar. Fecha com `true` no "Excluir" e `false`/`undefined` no cancelar/Esc/backdrop. Quem
 * dispara o `DELETE` (e recarrega a lista / trata 403/404) é a lista-mãe. Usa `MatDialog`
 * (focus-trap + Esc + backdrop gerenciados — resolve P2-2/P2-3 para os diálogos novos).
 */
@Component({
  selector: 'app-confirmar-exclusao',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './confirmar-exclusao.html',
  styleUrl: './confirmar-exclusao.scss',
})
export class ConfirmarExclusao {
  private readonly ref = inject(MatDialogRef<ConfirmarExclusao, boolean>);
  protected readonly dados = inject<ConfirmarExclusaoDados>(MAT_DIALOG_DATA);

  protected confirmar(): void {
    this.ref.close(true);
  }

  protected cancelar(): void {
    this.ref.close(false);
  }
}
