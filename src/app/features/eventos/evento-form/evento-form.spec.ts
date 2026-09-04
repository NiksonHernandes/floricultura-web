import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  provideNativeDateAdapter,
} from '@angular/material/core';
import { of, throwError } from 'rxjs';

import { EventoForm, dataParaIso, isoParaData } from './evento-form';
import { EventosService } from '../eventos.service';
import { PT_BR_DATE_FORMATS, PtBrDateAdapter } from '../../../core/date/pt-br-date-adapter';
import { Evento, EventoRequest } from '../../../core/models/evento.model';

interface CampoProbe {
  value: unknown;
  setValue(v: unknown): void;
  hasError(k: string): boolean;
  getError(k: string): string;
}

interface Probe {
  form: {
    get(name: string): CampoProbe | null;
  };
  salvar(): void;
  enviando(): boolean;
  erroGeral(): string | null;
  salvo: { subscribe(fn: (e: Evento) => void): void };
}

/** Atalho: `Date` LOCAL (mês 1-based p/ leitura), espelhando o construtor sem fuso do form. */
function dataLocal(ano: number, mes: number, dia: number): Date {
  return new Date(ano, mes - 1, dia);
}

describe('EventoForm (T-M4-5, CA-1/2/3/6)', () => {
  let serviceSpy: jasmine.SpyObj<Pick<EventosService, 'criar' | 'atualizar'>>;

  const evento: Evento = {
    id: 12,
    nome: 'Dia das Mães',
    tipo: 'COMEMORATIVA',
    dataInicio: '2026-05-10',
    dataFim: null,
    dataUnica: true,
    repeteTodoAno: true,
    descricao: null,
    criadoEm: '2026-09-03T13:00:00Z',
    atualizadoEm: '2026-09-03T13:00:00Z',
  };

  function montar(entrada: Evento | null = null): Probe {
    const fixture = TestBed.createComponent(EventoForm);
    if (entrada) {
      fixture.componentRef.setInput('evento', entrada);
    }
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Probe;
  }

  /** Preenche campos por nome no form group (o toggle `periodo` também é um controle do group). */
  function preencher(probe: Probe, valores: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(valores)) {
      probe.form.get(k)!.setValue(v);
    }
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<Pick<EventosService, 'criar' | 'atualizar'>>('EventosService', [
      'criar',
      'atualizar',
    ]);
    TestBed.configureTestingModule({
      imports: [EventoForm],
      providers: [
        provideNoopAnimations(),
        { provide: EventosService, useValue: serviceSpy },
        // O form migrou p/ MatDatepicker — o adapter/formats pt-BR precisam existir na DI (T-M4.1-4).
        provideNativeDateAdapter(),
        { provide: DateAdapter, useClass: PtBrDateAdapter },
        { provide: MAT_DATE_LOCALE, useValue: 'pt-BR' },
        { provide: MAT_DATE_FORMATS, useValue: PT_BR_DATE_FORMATS },
      ],
    });
  });

  it('não chama o serviço com nome/tipo/data vazios (obrigatórios — CA-3)', () => {
    const probe = montar();
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  // Âncora #5 (datas sem fuso): o helper de conversão do form é a fonte da verdade da regra
  // "componentes locais, nunca toISOString" — Date(2026, mai, 10) tem de virar exatamente "2026-05-10".
  it('dataParaIso usa componentes locais: Date(2026,4,10) → "2026-05-10" (âncora #5)', () => {
    expect(dataParaIso(new Date(2026, 4, 10))).toBe('2026-05-10');
    // Meia-noite local em UTC-3 = 03:00Z do mesmo dia; a conversão NÃO pode pular para o dia 9.
    expect(dataParaIso(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(dataParaIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('cria data única (datepicker): Date → POST com yyyy-MM-dd e dataFim=null (CA-1/CA-7)', () => {
    serviceSpy.criar.and.returnValue(of(evento));
    const probe = montar();
    let emitido: Evento | undefined;
    probe.salvo.subscribe((e) => (emitido = e));

    preencher(probe, {
      nome: '  Dia das Mães  ',
      tipo: 'COMEMORATIVA',
      dataInicio: dataLocal(2026, 5, 10), // 10/05/2026 escolhido no calendário
      repeteTodoAno: true,
      periodo: false,
    });
    probe.salvar();

    const esperado: EventoRequest = {
      nome: 'Dia das Mães',
      tipo: 'COMEMORATIVA',
      dataInicio: '2026-05-10', // convertido por componentes locais (sem -1 dia)
      dataFim: null,
      repeteTodoAno: true,
      descricao: null,
    };
    expect(serviceSpy.criar).toHaveBeenCalledWith(esperado);
    expect(emitido).toEqual(evento);
    expect(probe.enviando()).toBeFalse();
  });

  it('período válido (dataFim >= dataInicio): POST com dataFim em yyyy-MM-dd (CA-2/CA-7)', () => {
    serviceSpy.criar.and.returnValue(of(evento));
    const probe = montar();
    preencher(probe, {
      nome: 'Festa das Flores',
      tipo: 'FEIRA',
      dataInicio: dataLocal(2026, 9, 4),
      dataFim: dataLocal(2026, 9, 13),
      periodo: true,
    });
    probe.salvar();
    expect(serviceSpy.criar).toHaveBeenCalledWith(
      jasmine.objectContaining({ dataInicio: '2026-09-04', dataFim: '2026-09-13' }),
    );
  });

  it('período com dataFim < dataInicio: bloqueia e marca erro no campo (CA-2/CA-7)', () => {
    const probe = montar();
    preencher(probe, {
      nome: 'Invertido',
      tipo: 'FEIRA',
      dataInicio: dataLocal(2026, 9, 13),
      dataFim: dataLocal(2026, 9, 4),
      periodo: true,
    });
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(probe.form.get('dataFim')?.hasError('periodoInvalido')).toBeTrue();
  });

  it('período sem dataFim: exige o término (CA-2)', () => {
    const probe = montar();
    preencher(probe, {
      nome: 'Sem fim',
      tipo: 'FEIRA',
      dataInicio: dataLocal(2026, 9, 4),
      dataFim: null,
      periodo: true,
    });
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(probe.form.get('dataFim')?.hasError('required')).toBeTrue();
  });

  it('edição: carrega yyyy-MM-dd → Date local (round-trip sem -1/+1 dia) e faz PUT (CA-6/CA-8)', () => {
    serviceSpy.atualizar.and.returnValue(of({ ...evento, nome: 'Dia das Mães 2' }));
    const probe = montar(evento); // evento.dataInicio = '2026-05-10'

    // O datepicker recebe um Date LOCAL correspondente exatamente ao dia 10/05/2026 (CA-8).
    const carregada = probe.form.get('dataInicio')?.value as Date;
    expect(carregada.getFullYear()).toBe(2026);
    expect(carregada.getMonth()).toBe(4); // maio (0-based)
    expect(carregada.getDate()).toBe(10); // dia idêntico, sem deslocamento

    preencher(probe, { nome: 'Dia das Mães 2' });
    probe.salvar();
    expect(serviceSpy.atualizar).toHaveBeenCalledWith(
      12,
      jasmine.objectContaining({ nome: 'Dia das Mães 2', dataInicio: '2026-05-10', dataFim: null }),
    );
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('isoParaData é o inverso local de dataParaIso (ida-volta sem fuso — CA-8)', () => {
    expect(dataParaIso(isoParaData('2026-05-10'))).toBe('2026-05-10');
    expect(dataParaIso(isoParaData('2026-01-01'))).toBe('2026-01-01');
  });

  it('400 VALIDATION_ERROR aplica os details por campo (dataFim — CA-2)', () => {
    serviceSpy.criar.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              success: false,
              data: null,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Dados inválidos.',
                details: [{ field: 'dataFim', message: 'Término antes do início.' }],
              },
              timestamp: '',
              path: '',
            },
          }),
      ),
    );
    const probe = montar();
    preencher(probe, {
      nome: 'X',
      tipo: 'FEIRA',
      dataInicio: dataLocal(2026, 9, 4),
      dataFim: dataLocal(2026, 9, 13),
      periodo: true,
    });
    probe.salvar();
    expect(probe.form.get('dataFim')?.getError('servidor')).toBe('Término antes do início.');
    expect(probe.enviando()).toBeFalse();
  });
});
