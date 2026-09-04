import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';
import { of } from 'rxjs';

import { Eventos } from './eventos';
import { EventosService } from './eventos.service';
import { ConfirmarExclusao } from '../produtos/confirmar-exclusao/confirmar-exclusao';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Evento, EventoProximo } from '../../core/models/evento.model';

describe('Eventos (lista — T-M4-4/5, CA-4/CA-5/CA-6/CA-7)', () => {
  let httpMock: HttpTestingController;
  let ehAdmin: WritableSignal<boolean>;
  let dialog: jasmine.SpyObj<MatDialog>;
  const BASE = 'http://localhost:8080/api/v1/eventos';

  const base: Evento = {
    id: 12,
    nome: 'Dia das Mães',
    tipo: 'COMEMORATIVA',
    dataInicio: '2026-05-10',
    dataFim: null,
    dataUnica: true,
    repeteTodoAno: true,
    descricao: 'Pico de arranjos',
    criadoEm: '2026-09-03T13:00:00Z',
    atualizadoEm: '2026-09-03T13:00:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Evento[], total = conteudo.length): PaginaResponse<Evento> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 12,
      totalElementos: total,
      totalPaginas: Math.max(1, Math.ceil(total / 12)),
      primeira: true,
      ultima: total <= 12,
    };
  }

  beforeEach(() => {
    ehAdmin = signal(false);
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    TestBed.configureTestingModule({
      imports: [Eventos],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(), // o form embutido migrou p/ MatDatepicker (T-M4.1-4)
        EventosService,
        { provide: AuthService, useValue: { ehAdmin } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  // T-M4.1-3: o `ngOnInit` agora também chama `carregarProximos()` (reuso p/ o card iminente). Nos
  // testes que não asseveram a urgência, drenamos esse GET auxiliar antes do verify (aditivo — não
  // enfraquece nenhuma asserção herdada; a degradação graciosa é coberta pelo teste dedicado CA-5).
  afterEach(() => {
    httpMock.match((r) => r.url === `${BASE}/proximos`).forEach((r) => r.flush(envelope([])));
    httpMock.verify();
  });

  function proximo(id: number, faixaUrgencia: number): EventoProximo {
    return {
      id,
      nome: `Evento ${id}`,
      tipo: 'COMEMORATIVA',
      proximaOcorrencia: '2026-05-10',
      diasAte: 3,
      destaqueReforcado: true,
      faixaUrgencia,
      emAndamento: false,
    };
  }

  function iniciar(conteudo: Evento[], total = conteudo.length): ComponentFixture<Eventos> {
    const fixture = TestBed.createComponent(Eventos);
    fixture.detectChanges(); // ngOnInit → carregar()
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo, total)));
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza um único <h1> "Eventos" (a11y — um h1 por página)', () => {
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    const titulos = el.querySelectorAll('h1');
    expect(titulos.length).toBe(1);
    expect(titulos[0].textContent).toContain('Eventos');
  });

  it('um card por evento com nome, tipo (rótulo pt-BR) e selo de calendário', () => {
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.data').length).toBe(1);
    expect(el.textContent).toContain('Dia das Mães');
    expect(el.textContent).toContain('Comemorativa');
    expect(el.querySelector('.data__dia')?.textContent).toBe('10'); // dd de 2026-05-10
    expect(el.querySelector('.data__mes')?.textContent).toContain('mai');
  });

  it('data única mostra uma data; "todo ano" quando repeteTodoAno', () => {
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.data__quando')?.textContent).toContain('10/05/2026');
    expect(el.querySelector('.data__quando')?.textContent).not.toContain('—');
    expect(el.querySelector('.data__anual')).toBeTruthy();
  });

  it('período mostra os dois extremos (dataInicio — dataFim)', () => {
    const periodo: Evento = {
      ...base,
      dataFim: '2026-09-13',
      dataUnica: false,
      repeteTodoAno: false,
    };
    const fixture = iniciar([periodo]);
    const texto = (fixture.nativeElement as HTMLElement).querySelector('.data__quando')?.textContent;
    expect(texto).toContain('10/05/2026');
    expect(texto).toContain('13/09/2026');
    expect((fixture.nativeElement as HTMLElement).querySelector('.data__anual')).toBeNull();
  });

  it('empty-state quando a página vem vazia', () => {
    const fixture = iniciar([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--vazio')).toBeTruthy();
    expect(el.querySelectorAll('.data').length).toBe(0);
  });

  it('error-state com "Tentar de novo" que recarrega a lista', () => {
    const fixture = TestBed.createComponent(Eventos);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--erro')).toBeTruthy();
    (el.querySelector('.estado--erro button') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();
    expect(el.querySelector('.estado--erro')).toBeNull();
    expect(el.querySelectorAll('.data').length).toBe(1);
  });

  it('filtro por nome com debounce (~300ms) refaz a busca com o param nome (CA-4)', fakeAsync(() => {
    const fixture = iniciar([base]);
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.busca input',
    ) as HTMLInputElement;

    input.value = 'dia';
    input.dispatchEvent(new Event('input'));

    tick(150);
    httpMock.expectNone((r) => r.url === BASE); // ainda no debounce

    tick(200); // passa dos 300ms
    const req = httpMock.expectOne((r) => r.url === BASE && r.params.get('nome') === 'dia');
    expect(req.request.params.get('pagina')).toBe('0'); // reinicia na 1ª página
    req.flush(envelope(pagina([base])));
    fixture.detectChanges();
  }));

  it('trocar de página chama o serviço com pagina/tamanho (MatPaginator 0-based)', () => {
    const fixture = iniciar(Array.from({ length: 12 }, (_, i) => ({ ...base, id: i + 1 })), 40);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoPaginar({ pageIndex: 2, pageSize: 24 });
    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('pagina') === '2' && r.params.get('tamanho') === '24',
    );
    expect(req.request.method).toBe('GET');
    req.flush(envelope(pagina([], 40)));
  });

  // --- T-M4-5: ações de escrita + RBAC de UX (CA-6/CA-7/CA-8-front) ---

  it('USER não vê "Novo evento"/Editar/Excluir (RBAC de UX — CA-8)', () => {
    ehAdmin.set(false);
    const el = iniciar([base]).nativeElement as HTMLElement;
    expect(el.querySelector('.placa__acao')).toBeNull();
    expect(el.querySelector('.data__editar')).toBeNull();
    expect(el.querySelector('.data__excluir')).toBeNull();
  });

  it('ADMIN vê "Novo evento" na placa e Editar/Excluir no card', () => {
    ehAdmin.set(true);
    const el = iniciar([base]).nativeElement as HTMLElement;
    expect(el.querySelector('.placa__acao')?.textContent).toContain('Novo evento');
    expect(el.querySelector('.data__editar')).toBeTruthy();
    expect(el.querySelector('.data__excluir')).toBeTruthy();
    expect(el.querySelectorAll('h1').length).toBe(1);
  });

  it('ADMIN abre o form ao clicar em "Novo evento"', () => {
    ehAdmin.set(true);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-evento-form')).toBeNull();
    (el.querySelector('.placa__acao') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.veu')).toBeTruthy();
    expect(el.querySelector('app-evento-form')).toBeTruthy();
  });

  it('Excluir abre a confirmação com o NOME e, confirmando, faz DELETE + recarrega (CA-7/FC-08)', () => {
    ehAdmin.set(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(true) } as any);
    const el = iniciar([base]).nativeElement as HTMLElement;

    (el.querySelector('.data__excluir') as HTMLButtonElement).click();

    expect(dialog.open).toHaveBeenCalledWith(
      ConfirmarExclusao,
      jasmine.objectContaining({ data: { nome: base.nome } }),
    );
    httpMock.expectOne((r) => r.url === `${BASE}/${base.id}` && r.method === 'DELETE').flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    httpMock.expectOne((r) => r.url === BASE && r.method === 'GET').flush(envelope(pagina([])));
  });

  it('Excluir cancelado (afterClosed=false) NÃO faz DELETE', () => {
    ehAdmin.set(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dialog.open.and.returnValue({ afterClosed: () => of(false) } as any);
    const el = iniciar([base]).nativeElement as HTMLElement;
    (el.querySelector('.data__excluir') as HTMLButtonElement).click();
    expect(dialog.open).toHaveBeenCalledWith(ConfirmarExclusao, jasmine.anything());
    httpMock.expectNone((r) => r.method === 'DELETE');
  });

  it('ao salvar, o form fecha e a lista recarrega', () => {
    ehAdmin.set(true);
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.placa__acao') as HTMLButtonElement).click();
    fixture.detectChanges();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoSalvar({ ...base, nome: 'Finados' });
    httpMock.expectOne((r) => r.url === BASE && r.method === 'GET').flush(envelope(pagina([base])));
    fixture.detectChanges();
    expect(el.querySelector('app-evento-form')).toBeNull();
  });

  // --- T-M4.1-3: card iminente (≤7d) por reuso de faixaUrgencia===5 (CA-4/CA-5) ---

  it('destaca só o card cujo id está em /proximos com faixaUrgencia===5 (CA-4)', () => {
    const outro: Evento = { ...base, id: 99, nome: 'Feira' };
    const fixture = TestBed.createComponent(Eventos);
    fixture.detectChanges(); // ngOnInit → carregar() + carregarProximos()
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base, outro])));
    // 12 é iminente (faixa 5); 99 está em proximos mas faixa 3 (não iminente)
    httpMock
      .expectOne((r) => r.url === `${BASE}/proximos`)
      .flush(envelope([proximo(12, 5), proximo(99, 3)]));
    fixture.detectChanges();

    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.data');
    expect(cards[0].classList).toContain('data--iminente'); // id 12, faixa 5
    expect(cards[1].classList).not.toContain('data--iminente'); // id 99, faixa 3
  });

  it('a classe vem do reuso de proximos, NÃO de cálculo de data no componente (âncora #4)', () => {
    // O evento é hoje/amanhã pela data, mas se NÃO está em proximos com faixa 5, não é destacado.
    const fixture = TestBed.createComponent(Eventos);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    httpMock.expectOne((r) => r.url === `${BASE}/proximos`).flush(envelope([proximo(base.id, 4)]));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.data--iminente')).toBeNull();
  });

  it('proximos vazio/falho ⇒ nenhum destaque e a lista continua sem erro (CA-5)', () => {
    const fixture = TestBed.createComponent(Eventos);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    httpMock
      .expectOne((r) => r.url === `${BASE}/proximos`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.data--iminente')).toBeNull();
    expect(el.querySelectorAll('.data').length).toBe(1); // lista intacta
  });

  // --- T-M4.1-2: vitrine de flores (CA-3) ---

  it('"Visualizar" aparece em todo card (ADMIN e USER) e abre a vitrine (CA-3)', () => {
    ehAdmin.set(false); // USER também vê o botão (fora do @if ehAdmin)
    const fixture = iniciar([base]);
    const el = fixture.nativeElement as HTMLElement;
    const ver = el.querySelector('.data__ver') as HTMLButtonElement;
    expect(ver).toBeTruthy();

    ver.click();
    fixture.detectChanges();
    expect(el.querySelector('app-evento-produtos')).toBeTruthy();

    // a vitrine dispara o GET das flores do evento; flush honesto para o httpMock.verify()
    httpMock.expectOne((r) => r.url === `${BASE}/${base.id}/produtos`).flush(
      envelope({
        conteudo: [],
        pagina: 0,
        tamanho: 50,
        totalElementos: 0,
        totalPaginas: 1,
        primeira: true,
        ultima: true,
      }),
    );
    fixture.detectChanges();
  });
});
