import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { MovimentacoesService } from './movimentacoes.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { Movimentacao, PaginaResponse } from '../../core/models/produto.model';

describe('MovimentacoesService (T-M4-11)', () => {
  let service: MovimentacoesService;
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/movimentacoes';

  const mov: Movimentacao = {
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

  function pagina(conteudo: Movimentacao[]): PaginaResponse<Movimentacao> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 20,
      totalElementos: conteudo.length,
      totalPaginas: 1,
      primeira: true,
      ultima: true,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MovimentacoesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar sem filtro não envia o param q (só paginação)', () => {
    service.listar(0, 20).subscribe((p) => expect(p.conteudo.length).toBe(1));
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.get('tamanho')).toBe('20');
    expect(req.request.params.has('q')).toBeFalse();
    req.flush(envelope(pagina([mov])));
  });

  it('listar com filtro envia q (trim) + paginação (§3.5)', () => {
    service.listar(2, 40, '  rosa  ').subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE && r.params.get('q') === 'rosa');
    expect(req.request.params.get('pagina')).toBe('2');
    expect(req.request.params.get('tamanho')).toBe('40');
    req.flush(envelope(pagina([mov])));
  });
});
