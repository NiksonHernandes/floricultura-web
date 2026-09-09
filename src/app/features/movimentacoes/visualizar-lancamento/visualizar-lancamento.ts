import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';

import { Movimentacao, TipoMovimentacao } from '../../../core/models/produto.model';

/** Dados do diálogo: o lançamento do ledger a visualizar (read-only). */
export interface VisualizarLancamentoDados {
  movimentacao: Movimentacao;
}

/** Rótulos pt-BR dos tipos do ledger (AD-SQ-30) — local para evitar import circular com a lista. */
const ROTULOS_TIPO: Record<TipoMovimentacao, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
};

/**
 * Diálogo "Visualizar lançamento" — a ficha do razão (SPEC-M5 REVISÃO 2026-09-04, RF-3/AD-SQ-67,
 * R-CA-11). Só leitura: mostra produto, tipo, quantidade (→ resultante), autor (`usuarioNome` ou `—`),
 * data+hora pt-BR `dd/MM/yyyy HH:mm` em `America/Sao_Paulo` (AD-SQ-40), motivo (se houver) e a
 * **contraparte quando houver** (fornecedor na ENTRADA / cliente na SAÍDA — snapshot do ledger, R3.3).
 * AJUSTE (ou lançamento sem contraparte) não exibe o campo. Usa `MatDialog` (focus-trap/Esc/backdrop).
 */
@Component({
  selector: 'app-visualizar-lancamento',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './visualizar-lancamento.html',
  styleUrl: './visualizar-lancamento.scss',
})
export class VisualizarLancamento {
  private readonly ref = inject(MatDialogRef<VisualizarLancamento>);
  protected readonly dados = inject<VisualizarLancamentoDados>(MAT_DIALOG_DATA);
  protected readonly m = this.dados.movimentacao;

  protected rotuloTipo(t: TipoMovimentacao): string {
    return ROTULOS_TIPO[t] ?? t;
  }

  /**
   * Produto hard-deletado (SPEC-M5.2 §3.1, B-R1/CA-B3). `produtoId` anulado pelo back (FC-08/AD-SQ-34),
   * `produtoNome` (snapshot) preservado. Deriva do contrato existente — sem flag nova. `== null` cobre
   * `null` e `undefined`.
   */
  protected produtoExcluido(): boolean {
    return this.m.produtoId === null || this.m.produtoId === undefined;
  }

  /**
   * Rótulo da contraparte conforme o tipo: ENTRADA→"Fornecedor" (quando há `fornecedorNome`),
   * SAÍDA→"Cliente" (quando há `clienteNome`). `null` = sem contraparte (não renderiza o campo).
   * Baseia-se no NOME (snapshot preservado após hard delete FC-08), não no id.
   */
  protected contraparteRotulo(): string | null {
    if (this.m.tipo === 'ENTRADA' && this.m.fornecedorNome) return 'Fornecedor';
    if (this.m.tipo === 'SAIDA' && this.m.clienteNome) return 'Cliente';
    return null;
  }

  protected contraparteNome(): string | null {
    return this.m.fornecedorNome ?? this.m.clienteNome ?? null;
  }

  protected fechar(): void {
    this.ref.close();
  }
}
