import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Movimentacoes } from './movimentacoes';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse } from '../../core/models/produto.model';

describe('Movimentacoes (lista global — T-M4-11, CA-22/CA-24)', () => {
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/movimentacoes';

  const base: Movimentacao = {
    id: 87,
    produtoId: 5,
    produtoNome: 'Rosa Vermelha',
    tipo: 'SAIDA',
    quantidade: 12,
    quantidadeResultante: 88,
    motivo: 'Venda balcão',
    usuarioId: 3,
    usuarioNome: 'Ana',
    criadoEm: '2026-09-03T17:05:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Movimentacao[], total = conteudo.length): PaginaResponse<Movimentacao> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 20,
      totalElementos: total,
      totalPaginas: Math.max(1, Math.ceil(total / 20)),
      primeira: true,
      ultima: total <= 20,
    };
  }

  function iniciar(conteudo: Movimentacao[], total = conteudo.length): ComponentFixture<Movimentacoes> {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina(conteudo, total)));
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Movimentacoes],
      providers: [provideNoopAnimations(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('renderiza um único <h1> "Movimentações"', () => {
    const el = iniciar([base]).nativeElement as HTMLElement;
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent).toContain('Movimentações');
  });

  it('card com tipo (rótulo), quantidade, produto, autor e data pt-BR (CA-24)', () => {
    const el = iniciar([base]).nativeElement as HTMLElement;
    expect(el.querySelectorAll('.lancamento').length).toBe(1);
    expect(el.querySelector('.lancamento__tipo')?.textContent).toContain('Saída');
    expect(el.textContent).toContain('Rosa Vermelha');
    expect(el.textContent).toContain('Ana'); // autor
    expect(el.textContent).toContain('88'); // quantidade resultante
    // Data America/Sao_Paulo: 17:05Z → 14:05 local
    expect(el.querySelector('.lancamento__data')?.textContent).toContain('03/09/2026 14:05');
  });

  it('autor ausente (usuarioNome null) exibe "—" sem quebrar (CA-21)', () => {
    const el = iniciar([{ ...base, usuarioNome: null }]).nativeElement as HTMLElement;
    const autor = el.querySelectorAll('.campo dd')[1];
    expect(autor?.textContent?.trim()).toBe('—');
  });

  it('empty-state quando a página vem vazia', () => {
    const el = iniciar([]).nativeElement as HTMLElement;
    expect(el.querySelector('.estado--vazio')).toBeTruthy();
    expect(el.querySelectorAll('.lancamento').length).toBe(0);
  });

  it('error-state com "Tentar de novo" que recarrega', () => {
    const fixture = TestBed.createComponent(Movimentacoes);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === BASE).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.estado--erro')).toBeTruthy();
    (el.querySelector('.estado--erro button') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([base])));
    fixture.detectChanges();
    expect(el.querySelectorAll('.lancamento').length).toBe(1);
  });

  it('filtro q com debounce (~300ms) refaz a busca casando produto OU autor (CA-22)', fakeAsync(() => {
    const fixture = iniciar([base]);
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.busca input',
    ) as HTMLInputElement;

    input.value = 'ana';
    input.dispatchEvent(new Event('input'));

    tick(150);
    httpMock.expectNone((r) => r.url === BASE); // ainda no debounce

    tick(200);
    const req = httpMock.expectOne((r) => r.url === BASE && r.params.get('q') === 'ana');
    expect(req.request.params.get('pagina')).toBe('0'); // reinicia na 1ª página
    req.flush(envelope(pagina([base])));
    fixture.detectChanges();
  }));

  it('trocar de página chama o serviço com pagina/tamanho (0-based)', () => {
    const fixture = iniciar(Array.from({ length: 20 }, (_, i) => ({ ...base, id: i + 1 })), 80);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).aoPaginar({ pageIndex: 3, pageSize: 40 });
    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('pagina') === '3' && r.params.get('tamanho') === '40',
    );
    expect(req.request.method).toBe('GET');
    req.flush(envelope(pagina([], 80)));
  });
});
