import { TestBed } from '@angular/core/testing';
import {
  DateAdapter,
  MAT_DATE_LOCALE,
  provideNativeDateAdapter,
} from '@angular/material/core';

import { PT_BR_DATE_FORMATS, PtBrDateAdapter } from './pt-br-date-adapter';

/**
 * T-M4.1-4 (CA-6): o adapter exibe/parseia estritamente `dd/MM/yyyy` (pt-BR), construindo a data
 * pelo construtor LOCAL (sem fuso, AD-SQ-40) e rejeitando entradas fora do formato / dias inválidos.
 * Instanciado via DI (o `NativeDateAdapter` usa `inject(MAT_DATE_LOCALE)` no construtor).
 */
describe('PtBrDateAdapter (datepicker pt-BR — T-M4.1-4, CA-6)', () => {
  let adapter: PtBrDateAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNativeDateAdapter(),
        { provide: DateAdapter, useClass: PtBrDateAdapter },
        { provide: MAT_DATE_LOCALE, useValue: 'pt-BR' },
      ],
    });
    adapter = TestBed.inject(DateAdapter) as PtBrDateAdapter;
  });

  it('format exibe sempre dd/MM/yyyy', () => {
    expect(adapter.format(new Date(2026, 4, 10), {})).toBe('10/05/2026');
    expect(adapter.format(new Date(2026, 0, 1), {})).toBe('01/01/2026');
  });

  it('parse dd/MM/yyyy → Date LOCAL com o dia exato (sem -1/+1 dia)', () => {
    const d = adapter.parse('10/05/2026') as Date;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // maio (0-based)
    expect(d.getDate()).toBe(10);
  });

  it('parse rejeita formato ambíguo/ISO e dias inválidos (retorna data inválida)', () => {
    expect(adapter.isValid(adapter.parse('2026-05-10') as Date)).toBeFalse(); // ISO não é dd/MM/yyyy
    expect(adapter.isValid(adapter.parse('31/02/2026') as Date)).toBeFalse(); // 31 de fev não existe
    expect(adapter.isValid(adapter.parse('32/01/2026') as Date)).toBeFalse();
    expect(adapter.isValid(adapter.parse('10/13/2026') as Date)).toBeFalse(); // mês 13
    expect(adapter.isValid(adapter.parse('abc') as Date)).toBeFalse();
  });

  it('parse de string vazia → null (campo opcional/limpo)', () => {
    expect(adapter.parse('')).toBeNull();
    expect(adapter.parse('   ')).toBeNull();
  });

  it('PT_BR_DATE_FORMATS usa dd/MM/yyyy na entrada e exibição', () => {
    expect(PT_BR_DATE_FORMATS.parse.dateInput).toBe('dd/MM/yyyy');
    expect(PT_BR_DATE_FORMATS.display.dateInput).toBe('dd/MM/yyyy');
  });
});
