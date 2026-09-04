import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';

import { ProximosEventos } from './proximos-eventos';
import { EventosService } from '../eventos.service';
import { InfoAvisos } from '../info-avisos/info-avisos';
import { AvisosEventosPreferencia } from '../../../core/services/avisos-eventos-preferencia';
import { EventoProximo } from '../../../core/models/evento.model';

/**
 * T-M4-8 (CA-18): o bloco renderiza os itens de `GET /eventos/proximos` (via o signal
 * compartilhado do serviço), aplica o realce para `diasAte ≤ 30` e some quando não há alerta.
 * Stub leve do serviço (signal + carregarProximos spy) — sem HttpClient (diretriz do dono).
 */
describe('ProximosEventos (T-M4-8, CA-18)', () => {
  let proximos: WritableSignal<EventoProximo[]>;
  let carregarSpy: jasmine.Spy;
  let dialog: jasmine.SpyObj<MatDialog>;
  let oculto: WritableSignal<boolean>;

  const perto: EventoProximo = {
    id: 1,
    nome: 'Dia das Mães',
    tipo: 'COMEMORATIVA',
    proximaOcorrencia: '2026-05-10',
    diasAte: 12,
    destaqueReforcado: true,
    faixaUrgencia: 5,
    emAndamento: false,
  };

  const longe: EventoProximo = {
    id: 2,
    nome: 'Festa das Flores',
    tipo: 'FEIRA',
    proximaOcorrencia: '2026-07-01',
    diasAte: 45,
    destaqueReforcado: false,
    faixaUrgencia: 0,
    emAndamento: false,
  };

  function montar() {
    const fixture = TestBed.createComponent(ProximosEventos);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    proximos = signal<EventoProximo[]>([]);
    carregarSpy = jasmine.createSpy('carregarProximos');
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    oculto = signal(false);
    TestBed.configureTestingModule({
      imports: [ProximosEventos],
      providers: [
        provideNoopAnimations(),
        { provide: EventosService, useValue: { proximos, carregarProximos: carregarSpy } },
        { provide: MatDialog, useValue: dialog },
        { provide: AvisosEventosPreferencia, useValue: { oculto } },
      ],
    });
  });

  it('dispara carregarProximos no init', () => {
    montar();
    expect(carregarSpy).toHaveBeenCalled();
  });

  it('some quando não há eventos na janela (bloco não polui a Home)', () => {
    const el = montar().nativeElement as HTMLElement;
    expect(el.querySelector('.proximos')).toBeNull();
  });

  // --- T-M4.1-6: honra a preferência "desligar aviso" (CA-11) ---

  it('esconde o bloco quando a preferência está oculta, mesmo com eventos na janela (CA-11)', () => {
    proximos.set([perto]);
    oculto.set(true);
    const el = montar().nativeElement as HTMLElement;
    expect(el.querySelector('.proximos')).toBeNull();
  });

  it('mostra o bloco quando a preferência volta a exibir (religar — CA-11)', () => {
    proximos.set([perto]);
    oculto.set(true);
    const fixture = montar();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.proximos')).toBeNull();

    oculto.set(false); // religou "Mostrar avisos"
    fixture.detectChanges();
    expect(el.querySelector('.proximos')).toBeTruthy();
  });

  it('renderiza um item por evento com nome e contagem regressiva', () => {
    proximos.set([perto, longe]);
    const el = montar().nativeElement as HTMLElement;
    expect(el.querySelectorAll('.prox').length).toBe(2);
    expect(el.textContent).toContain('Dia das Mães');
    expect(el.textContent).toContain('faltam 12 dias');
  });

  it('aplica o realce reforçado só para diasAte ≤ 30 (destaqueReforcado)', () => {
    proximos.set([perto, longe]);
    const el = montar().nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.prox');
    expect(cards[0].classList).toContain('prox--reforcado'); // diasAte 12
    expect(cards[1].classList).not.toContain('prox--reforcado'); // diasAte 45
  });

  it('o ícone "i" do cabeçalho abre o diálogo InfoAvisos (CA-9)', () => {
    proximos.set([perto]); // o bloco (e o "i") só existem quando há eventos na janela
    const el = montar().nativeElement as HTMLElement;
    const info = el.querySelector('.proximos__info') as HTMLButtonElement;
    expect(info?.getAttribute('aria-label')).toBe('Como funcionam os avisos');
    info.click();
    expect(dialog.open).toHaveBeenCalledWith(InfoAvisos, jasmine.anything());
  });

  it('rótulos de borda: "é hoje" (0), "amanhã" (1), "em andamento" (negativo/emAndamento)', () => {
    proximos.set([
      { ...perto, id: 10, diasAte: 0 },
      { ...perto, id: 11, diasAte: 1 },
      { ...perto, id: 12, diasAte: -3, emAndamento: true },
    ]);
    const el = montar().nativeElement as HTMLElement;
    const textos = Array.from(el.querySelectorAll('.prox__quando')).map((n) => n.textContent?.trim());
    expect(textos).toContain('é hoje');
    expect(textos).toContain('amanhã');
    expect(textos).toContain('em andamento');
  });
});
