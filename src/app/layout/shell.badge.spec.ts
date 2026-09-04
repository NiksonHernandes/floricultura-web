import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { BehaviorSubject } from 'rxjs';

import { Shell } from './shell';
import { AuthService } from '../core/services/auth.service';
import { EventosService } from '../features/eventos/eventos.service';
import { EventoProximo } from '../core/models/evento.model';

/**
 * T-M4-8 (CA-18): badge do menu "Eventos" = contagem de eventos na janela (`GET /eventos/proximos`).
 * Spec NOVO — não toca o shell.spec. Stub leve do EventosService (signal + carregarProximos spy).
 */
describe('Shell — badge de próximos eventos (T-M4-8, CA-18)', () => {
  let proximos: WritableSignal<EventoProximo[]>;
  let carregarSpy: jasmine.Spy;

  const ev = (id: number): EventoProximo => ({
    id,
    nome: `Evento ${id}`,
    tipo: 'COMEMORATIVA',
    proximaOcorrencia: '2026-05-10',
    diasAte: 20,
    destaqueReforcado: true,
    faixaUrgencia: 4,
    emAndamento: false,
  });

  function montar() {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    proximos = signal<EventoProximo[]>([]);
    carregarSpy = jasmine.createSpy('carregarProximos');
    const bp = new BehaviorSubject<BreakpointState>({ matches: false, breakpoints: {} });

    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: { ehAdmin: signal(false), usuarioAtual: signal(null), logout: () => {} } },
        { provide: BreakpointObserver, useValue: { observe: () => bp.asObservable() } },
        { provide: EventosService, useValue: { proximos, carregarProximos: carregarSpy } },
      ],
    });
  });

  it('carrega os próximos eventos no boot do shell', () => {
    montar();
    expect(carregarSpy).toHaveBeenCalled();
  });

  it('badge conta os eventos da janela (0 = sem badge)', () => {
    const fixture = montar();
    const probe = fixture.componentInstance as unknown as { badgeEventos(): number };
    expect(probe.badgeEventos()).toBe(0);

    proximos.set([ev(1), ev(2), ev(3)]);
    fixture.detectChanges();
    expect(probe.badgeEventos()).toBe(3);
  });
});
