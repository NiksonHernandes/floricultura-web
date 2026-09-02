import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ProdutosService } from './produtos.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse, Produto } from '../../core/models/produto.model';

describe('ProdutosService (T-M2-7)', () => {
  let service: ProdutosService;
  let httpMock: HttpTestingController;

  const BASE = 'http://localhost:8080/api/v1/produtos';

  const rosa: Produto = {
    id: 10,
    nome: 'Rosa Vermelha',
    descricao: 'Maço com 12 hastes',
    unidadeMedida: 'un',
    estoqueMinimo: 10,
    estoqueAtual: 25,
    preco: 4.5,
    imagemUrl: 'https://exemplo.local/rosa.jpg',
    estoqueBaixo: false,
    ativo: true,
    criadoEm: '2026-09-02T14:00:00Z',
    atualizadoEm: '2026-09-02T14:00:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Produto[]): PaginaResponse<Produto> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 12,
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
    service = TestBed.inject(ProdutosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar() faz GET com pagina/tamanho e desembrulha a PaginaResponse do envelope', () => {
    let recebido: PaginaResponse<Produto> | undefined;
    service.listar(0, 12).subscribe((p) => (recebido = p));

    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('pagina') === '0' && r.params.get('tamanho') === '12',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('nome')).toBeFalse();
    req.flush(envelope(pagina([rosa])));

    expect(recebido?.conteudo).toEqual([rosa]);
    expect(recebido?.totalElementos).toBe(1);
  });

  it('listar() com nome inclui o filtro (trimado) nos params', () => {
    service.listar(1, 24, '  ro  ').subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('pagina') === '1' && r.params.get('tamanho') === '24',
    );
    expect(req.request.params.get('nome')).toBe('ro');
    req.flush(envelope(pagina([])));
  });

  it('listar() com nome só de espaços NÃO envia o param nome', () => {
    service.listar(0, 12, '   ').subscribe();

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('nome')).toBeFalse();
    req.flush(envelope(pagina([])));
  });

  it('detalhar() faz GET /{id} e desembrulha o Produto', () => {
    let recebido: Produto | undefined;
    service.detalhar(10).subscribe((p) => (recebido = p));

    const req = httpMock.expectOne(`${BASE}/10`);
    expect(req.request.method).toBe('GET');
    req.flush(envelope(rosa));

    expect(recebido).toEqual(rosa);
  });
});
