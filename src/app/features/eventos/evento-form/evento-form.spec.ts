import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { EventoForm } from './evento-form';
import { EventosService } from '../eventos.service';
import { Evento, EventoRequest } from '../../../core/models/evento.model';

interface Probe {
  form: {
    get(name: string): { setValue(v: unknown): void; hasError(k: string): boolean; getError(k: string): string } | null;
  };
  salvar(): void;
  enviando(): boolean;
  erroGeral(): string | null;
  salvo: { subscribe(fn: (e: Evento) => void): void };
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
      providers: [provideNoopAnimations(), { provide: EventosService, useValue: serviceSpy }],
    });
  });

  it('não chama o serviço com nome/tipo/data vazios (obrigatórios — CA-3)', () => {
    const probe = montar();
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('cria data única: POST com dataFim=null (CA-1)', () => {
    serviceSpy.criar.and.returnValue(of(evento));
    const probe = montar();
    let emitido: Evento | undefined;
    probe.salvo.subscribe((e) => (emitido = e));

    preencher(probe, {
      nome: '  Dia das Mães  ',
      tipo: 'COMEMORATIVA',
      dataInicio: '2026-05-10',
      repeteTodoAno: true,
      periodo: false,
    });
    probe.salvar();

    const esperado: EventoRequest = {
      nome: 'Dia das Mães',
      tipo: 'COMEMORATIVA',
      dataInicio: '2026-05-10',
      dataFim: null,
      repeteTodoAno: true,
      descricao: null,
    };
    expect(serviceSpy.criar).toHaveBeenCalledWith(esperado);
    expect(emitido).toEqual(evento);
    expect(probe.enviando()).toBeFalse();
  });

  it('período válido (dataFim >= dataInicio): POST com dataFim (CA-2)', () => {
    serviceSpy.criar.and.returnValue(of(evento));
    const probe = montar();
    preencher(probe, {
      nome: 'Festa das Flores',
      tipo: 'FEIRA',
      dataInicio: '2026-09-04',
      dataFim: '2026-09-13',
      periodo: true,
    });
    probe.salvar();
    expect(serviceSpy.criar).toHaveBeenCalledWith(
      jasmine.objectContaining({ dataInicio: '2026-09-04', dataFim: '2026-09-13' }),
    );
  });

  it('período com dataFim < dataInicio: bloqueia e marca erro no campo (CA-2)', () => {
    const probe = montar();
    preencher(probe, {
      nome: 'Invertido',
      tipo: 'FEIRA',
      dataInicio: '2026-09-13',
      dataFim: '2026-09-04',
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
      dataInicio: '2026-09-04',
      dataFim: '',
      periodo: true,
    });
    probe.salvar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
    expect(probe.form.get('dataFim')?.hasError('required')).toBeTrue();
  });

  it('edição: pré-preenche do evento e faz PUT com o id (CA-6)', () => {
    serviceSpy.atualizar.and.returnValue(of({ ...evento, nome: 'Dia das Mães 2' }));
    const probe = montar(evento);
    preencher(probe, { nome: 'Dia das Mães 2' });
    probe.salvar();
    expect(serviceSpy.atualizar).toHaveBeenCalledWith(
      12,
      jasmine.objectContaining({ nome: 'Dia das Mães 2', dataFim: null }),
    );
    expect(serviceSpy.criar).not.toHaveBeenCalled();
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
      dataInicio: '2026-09-04',
      dataFim: '2026-09-13',
      periodo: true,
    });
    probe.salvar();
    expect(probe.form.get('dataFim')?.getError('servidor')).toBe('Término antes do início.');
    expect(probe.enviando()).toBeFalse();
  });
});
