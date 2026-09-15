import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Painel } from './painel';

const base = 'http://localhost:8080/api/v1';
describe('Visão geral — integração dos indicadores', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Painel],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function responder() {
    const produtos = http.match((r) => r.url === `${base}/produtos`);
    expect(produtos.length).toBe(2);
    for (const req of produtos) {
      const baixo = req.request.params.get('estoque') === 'BAIXO';
      req.flush({ data: { conteudo: [], totalElementos: baixo ? 17 : 250 } });
    }
    http
      .expectOne((r) => r.url === `${base}/clientes`)
      .flush({ data: { totalElementos: 40 } });
    http
      .expectOne((r) => r.url === `${base}/movimentacoes`)
      .flush({ data: { conteudo: [] } });
    http.expectOne(`${base}/eventos/proximos`).flush({ data: [] });
  }
  it('usa os totais do servidor e não o tamanho da página para contar o estoque', () => {
    const fixture = TestBed.createComponent(Painel);
    responder();
    fixture.detectChanges();
    const values = [
      ...fixture.nativeElement.querySelectorAll('.metric strong'),
    ].map((el: Element) => el.textContent?.trim());
    expect(values).toEqual(['250', '17', '40', '0']);
    expect(
      fixture.nativeElement
        .querySelector('.metric--alert')
        .getAttribute('href'),
    ).toContain('estoque=BAIXO');
  });
  it('mostra erro recuperável em vez de números zero quando a API falha', () => {
    const fixture = TestBed.createComponent(Painel);
    const pending = http.match(() => true);
    pending[0].flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[role="alert"]').textContent,
    ).toContain('Não foi possível');
    expect(fixture.nativeElement.querySelector('.metric')).toBeNull();
    fixture.nativeElement.querySelector('button').click();
    responder();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.metric').length).toBe(4);
  });
});
