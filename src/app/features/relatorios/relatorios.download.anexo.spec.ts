import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DateAdapter, MAT_DATE_FORMATS, provideNativeDateAdapter } from '@angular/material/core';
import { signal } from '@angular/core';

import { Relatorios } from './relatorios';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { AuthService } from '../../core/services/auth.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { PT_BR_DATE_FORMATS, PtBrDateAdapter } from '../../core/date/pt-br-date-adapter';
import { ApiResponse } from '../../core/models/api-response.model';
import { Relatorio } from '../../core/models/relatorio.model';

/**
 * CARONA da T-M7-08 — P2-2 da review da T-M7-09: o `<a download>` tem de estar **no DOM** no
 * instante do clique.
 *
 * Chrome, Edge e Firefox baixam a partir de um link desanexado; o **Safari não**, e `download` sobre
 * `blob:` é o caso mais frágil dele. Como ~90 % do uso é celular (decisão do dono), essa é
 * justamente a plataforma onde a falha apareceria — **sem erro e sem banner**, o pior modo.
 *
 * Arquivo NOVO: `relatorios.download.spec.ts` está **rastreado** (§12 #27) e nenhuma liberação foi
 * pedida. ⚠️ **Não** se mexe no `revokeObjectURL` com `setTimeout`: isso quebraria o `expect`
 * síncrono do arquivo herdado — o conserto é só o par `appendChild`/`remove`.
 */
describe('Relatorios — o <a download> anexado (carona T-M7-08, P2-2)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/relatorios/movimentacoes';

  /** Onde o `<a>` estava pendurado **no instante do clique** — é isso que o Safari exige. */
  let paiNoClique: Node | null = null;

  const dados = {
    de: '2026-09-01',
    ate: '2026-09-30',
    granularidade: 'MES',
    resumo: {
      entradas: { lancamentos: 0, quantidade: 0, valor: 0 },
      saidas: { lancamentos: 0, quantidade: 0, valor: 0 },
      ajustes: { lancamentos: 0, quantidade: 0, valor: 0 },
      resultadoValor: 0,
      lancamentosEstornadosExcluidos: 0,
    },
    periodos: [],
  } as Relatorio;

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  beforeEach(() => {
    paiNoClique = null;
    TestBed.configureTestingModule({
      imports: [Relatorios],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: DateAdapter, useClass: PtBrDateAdapter },
        { provide: MAT_DATE_FORMATS, useValue: PT_BR_DATE_FORMATS },
        {
          provide: AuthService,
          useValue: {
            token: () => 'jwt-de-teste',
            logout: () => {},
            ehAdmin: signal(true),
            usuarioAtual: signal(null),
          },
        },
        FornecedoresService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    // O clique real navegaria a aba do Karma. O spy captura o PAI no instante exato do clique —
    // depois do clique o `<a>` é removido, então olhar o DOM no fim do caso não provaria nada.
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
      paiNoClique = this.parentNode;
    });
  });

  afterEach(() => httpMock.verify());

  it('P2-2: o <a> está no DOM quando o clique acontece — e sai logo depois', () => {
    const fixture = TestBed.createComponent(Relatorios);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(dados));
    fixture.detectChanges();

    spyOn(URL, 'createObjectURL').and.returnValue('blob:teste');
    spyOn(URL, 'revokeObjectURL');
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.acoes__pdf') as HTMLButtonElement).click();
    httpMock
      .expectOne((r) => r.url === `${BASE}/export`)
      .flush(new Blob(['%PDF-'], { type: 'application/pdf' }));

    expect(paiNoClique).toBe(document.body);
    // E não fica lixo pendurado: o link sai do DOM depois de cumprir o papel.
    expect(document.querySelectorAll('a[download]').length).toBe(0);
  });
});
