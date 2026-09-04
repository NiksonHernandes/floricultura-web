import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';
import { MatDateFormats } from '@angular/material/core';

/**
 * Adapter de datas pt-BR para o `MatDatepicker` (SPEC-M4.1 §4.3, T-M4.1-4, CA-6).
 *
 * Estende o `NativeDateAdapter` sobrescrevendo `parse`/`format` para **`dd/MM/yyyy` estrito** — o
 * parse padrão do Material delega a `new Date(...)`, ambíguo p/ dd/mm (interpreta como mm/dd). Aqui
 * o parse exige o formato `dd/MM/yyyy`, valida os componentes (round-trip: dia/mês/ano têm de bater,
 * barrando `32/13/2026`) e constrói a data com o **construtor LOCAL** (`new Date(ano, mês-1, dia)`,
 * meia-noite local) — nunca via UTC, coerente com a conversão sem fuso do `evento-form` (AD-SQ-40).
 * Entrada inválida ⇒ `invalid()` (o Material marca `matDatepickerParse`, tratado pelo form).
 */
@Injectable()
export class PtBrDateAdapter extends NativeDateAdapter {
  /** `dd/MM/yyyy` estrito → Date local; qualquer outra coisa (fora do formato/dia inválido) ⇒ inválida. */
  override parse(value: unknown): Date | null {
    if (typeof value === 'string') {
      const texto = value.trim();
      if (!texto) {
        return null;
      }
      const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) {
        return this.invalid();
      }
      const dia = Number(m[1]);
      const mes = Number(m[2]);
      const ano = Number(m[3]);
      const data = new Date(ano, mes - 1, dia);
      // Round-trip pelos componentes locais: rejeita overflow (ex.: 31/02, 32/01, mês 13).
      if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
        return this.invalid();
      }
      return data;
    }
    // Números/Date (seleção pelo calendário) seguem o comportamento nativo.
    return value ? new Date(value as number) : null;
  }

  /** Exibição sempre `dd/MM/yyyy` (o input e a label lêem daqui). */
  override format(date: Date, _displayFormat: object): string {
    if (!this.isValid(date)) {
      return '';
    }
    const dia = this._pad2(date.getDate());
    const mes = this._pad2(date.getMonth() + 1);
    return `${dia}/${mes}/${date.getFullYear()}`;
  }

  private _pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
  }
}

/** Formatos pt-BR do datepicker (`MAT_DATE_FORMATS`) — entrada e exibição em `dd/MM/yyyy`. */
export const PT_BR_DATE_FORMATS: MatDateFormats = {
  parse: {
    dateInput: 'dd/MM/yyyy',
  },
  display: {
    dateInput: 'dd/MM/yyyy',
    monthYearLabel: 'MMM yyyy',
    dateA11yLabel: 'dd/MM/yyyy',
    monthYearA11yLabel: 'MMMM yyyy',
  },
};
