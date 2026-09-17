import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DateAdapter, MAT_DATE_FORMATS, provideNativeDateAdapter } from '@angular/material/core';

import { Relatorios } from './relatorios';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { AuthService } from '../../core/services/auth.service';
import { PT_BR_DATE_FORMATS, PtBrDateAdapter } from '../../core/date/pt-br-date-adapter';
import { ApiResponse } from '../../core/models/api-response.model';
import { Relatorio, TotaisRelatorio } from '../../core/models/relatorio.model';

/**
 * T-M7-09 — download do relatório como arquivo (SPEC-M7 §3.8/§3.13; CA-47, CA-48).
 *
 * ⚠️ **O `authInterceptor` é registrado de propósito.** O §10 #19 manda provar que o GET vai com
 * `responseType: 'blob'` **e** com `Authorization` — e o `HttpTestingController` **não passa pelos
 * interceptors** a menos que o TestBed os registre. Sem esta linha, a metade do item que fala do
 * header **não poderia falhar**: seria falso-verde por construção (AD-SQ-182 aplicada a HTTP —
 * prove pelo efeito, não pela intenção). Com ela, tirar o interceptor do `app.config` seria pego.
 *
 * O nome do arquivo é conferido aqui porque ele é montado no FRONT: o `CorsConfig` do back não
 * expõe `Content-Disposition`, então o navegador não o lê entre origens. Um caso que conferisse "o
 * header existe" ficaria verde sem a exposição — o header sempre esteve lá; o que falta é expô-lo.
 *
 * Dados FICTÍCIOS (LGPD).
 */
describe('Relatorios — download do arquivo (T-M7-09, §3.8)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/relatorios/movimentacoes';
  let ancora: HTMLAnchorElement | null;

  function totais(lancamentos: number, quantidade: number, valor: number): TotaisRelatorio {
    return { lancamentos, quantidade, valor };
  }

  const dados: Relatorio = {
    de: '2026-09-01',
    ate: '2026-09-30',
    granularidade: 'MES',
    resumo: {
      entradas: totais(12, 140, 40),
      saidas: totais(31, 118, 100),
      ajustes: totais(0, 0, 0),
      resultadoValor: 60,
      lancamentosEstornadosExcluidos: 0,
    },
    periodos: [
      {
        inicio: '2026-09-01',
        fim: '2026-09-30',
        entradas: totais(12, 140, 40),
        saidas: totais(31, 118, 100),
        ajustes: totais(0, 0, 0),
        resultadoValor: 60,
      },
    ],
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function iniciar(): { fixture: ComponentFixture<Relatorios>; el: HTMLElement; periodo: string[] } {
    const fixture = TestBed.createComponent(Relatorios);
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url === BASE);
    const periodo = [req.request.params.get('de')!, req.request.params.get('ate')!];
    req.flush(envelope(dados));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, periodo };
  }

  beforeEach(() => {
    ancora = null;
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
    // O clique real navegaria a aba do Karma; o spy também captura o `<a>` para as asserções.
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
      ancora = this;
    });
  });

  afterEach(() => httpMock.verify());

  /**
   * Espera o banner aparecer.
   *
   * `fixture.whenStable()` NÃO serve aqui: ler o corpo de erro exige `Blob.text()`, e essa promessa
   * nativa não é uma tarefa que a zona do teste enxergue — medido, um caso ficou verde por engano e
   * o outro estourou `Timeout - Async function did not complete within 5000ms`. Sondar o DOM com
   * limite é honesto e determinístico: ou o banner aparece, ou o caso falha na asserção seguinte.
   */
  async function aguardarBanner(fixture: ComponentFixture<Relatorios>, el: HTMLElement) {
    for (let tentativa = 0; tentativa < 50 && !el.querySelector('.acoes__erro'); tentativa++) {
      await new Promise((pronto) => setTimeout(pronto, 10));
      fixture.detectChanges();
    }
  }

  it('CA-47: "Baixar Excel" faz UM GET blob autenticado, com o mesmo recorte da tela', () => {
    const { el, periodo } = iniciar();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:teste');
    const revoke = spyOn(URL, 'revokeObjectURL');

    (el.querySelector('.acoes__xlsx') as HTMLButtonElement).click();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/export`);

    expect(req.request.responseType).toBe('blob');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-de-teste');
    expect(req.request.params.get('formato')).toBe('XLSX');
    expect(req.request.params.get('de')).toBe(periodo[0]);
    expect(req.request.params.get('ate')).toBe(periodo[1]);
    // `granularidade` é inerte no export: mandá-la sugeriria que ela muda o arquivo.
    expect(req.request.params.has('granularidade')).toBeFalse();

    req.flush(new Blob(['PK'], { type: 'application/zip' }));
    expect(ancora!.download).toBe(`movimentacoes-${periodo[0]}_a_${periodo[1]}.xlsx`);
    expect(revoke).toHaveBeenCalledWith('blob:teste');
  });

  it('CA-47: "Baixar PDF" pede o outro formato e nomeia o arquivo com .pdf', () => {
    const { el, periodo } = iniciar();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:teste');
    spyOn(URL, 'revokeObjectURL');

    (el.querySelector('.acoes__pdf') as HTMLButtonElement).click();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/export`);

    expect(req.request.params.get('formato')).toBe('PDF');
    req.flush(new Blob(['%PDF-'], { type: 'application/pdf' }));
    expect(ancora!.download).toBe(`movimentacoes-${periodo[0]}_a_${periodo[1]}.pdf`);
  });

  it('enquanto gera, os dois botões ficam desabilitados e o rótulo diz "Gerando…"', () => {
    const { fixture, el } = iniciar();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:teste');
    spyOn(URL, 'revokeObjectURL');

    (el.querySelector('.acoes__pdf') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect((el.querySelector('.acoes__pdf') as HTMLButtonElement).disabled).toBeTrue();
    expect((el.querySelector('.acoes__xlsx') as HTMLButtonElement).disabled).toBeTrue();
    expect(el.querySelector('.acoes__pdf')?.textContent).toContain('Gerando…');

    httpMock.expectOne((r) => r.url === `${BASE}/export`).flush(new Blob(['%PDF-']));
    fixture.detectChanges();
    expect((el.querySelector('.acoes__pdf') as HTMLButtonElement).disabled).toBeFalse();
  });

  it('CA-48: no 400 o banner mostra a mensagem DO ENVELOPE e o botão reabilita', async () => {
    const { fixture, el } = iniciar();
    (el.querySelector('.acoes__xlsx') as HTMLButtonElement).click();

    // Corpo de erro de um request `blob` chega como Blob — não como JSON já desserializado.
    const corpo = new Blob(
      [
        JSON.stringify({
          success: false,
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'O relatório passou de 5.000 lançamentos. Refine o período ou os filtros.',
            details: [{ field: 'ate', message: 'x' }],
          },
          timestamp: '',
          path: '',
        }),
      ],
      { type: 'application/json' },
    );
    httpMock
      .expectOne((r) => r.url === `${BASE}/export`)
      .flush(corpo, { status: 400, statusText: 'Bad Request' });
    await aguardarBanner(fixture, el);

    expect(el.querySelector('.acoes__erro')?.textContent).toContain('passou de 5.000 lançamentos');
    expect((el.querySelector('.acoes__xlsx') as HTMLButtonElement).disabled).toBeFalse();
  });

  it('CA-48: no 403 o banner é honesto mesmo sem envelope legível', async () => {
    const { fixture, el } = iniciar();
    (el.querySelector('.acoes__pdf') as HTMLButtonElement).click();

    httpMock
      .expectOne((r) => r.url === `${BASE}/export`)
      .flush(new Blob(['<html>proxy</html>']), { status: 403, statusText: 'Forbidden' });
    await aguardarBanner(fixture, el);

    expect(el.querySelector('.acoes__erro')?.textContent).toContain('não tem permissão');
    expect((el.querySelector('.acoes__pdf') as HTMLButtonElement).disabled).toBeFalse();
  });
});
