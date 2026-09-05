import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { FornecedoresService } from './fornecedores.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Fornecedor, FornecedorRequest } from '../../core/models/fornecedor.model';

/**
 * Espelho de `clientes.service.spec.ts`. Dados FICTÍCIOS (LGPD, §3.3): "Sítio das Flores",
 * `@exemplo.com.br`, `(11) 91234-5678` — nunca PII real.
 */
describe('FornecedoresService (T-M5-6)', () => {
  let service: FornecedoresService;
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/fornecedores';

  const fornecedor: Fornecedor = {
    id: 3,
    nome: 'Sítio das Flores',
    telefone: '(11) 91234-5678',
    email: 'sitio@exemplo.com.br',
    observacoes: 'Entrega às terças.',
    produtoIds: [5, 8],
    criadoEm: '2026-09-04T14:05:00Z',
    atualizadoEm: '2026-09-04T14:05:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Fornecedor[]): PaginaResponse<Fornecedor> {
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
      providers: [FornecedoresService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FornecedoresService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar sem filtro não envia o param nome (item de lista com produtoIds=null)', () => {
    const item: Fornecedor = { ...fornecedor, produtoIds: null };
    service.listar(0, 20).subscribe((p) => expect(p.conteudo[0].produtoIds).toBeNull());
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.get('tamanho')).toBe('20');
    expect(req.request.params.has('nome')).toBeFalse();
    req.flush(envelope(pagina([item])));
  });

  it('listar com filtro envia nome (trim) e paginação (§3.4)', () => {
    service.listar(1, 24, '  si  ').subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE && r.params.get('nome') === 'si');
    expect(req.request.params.get('pagina')).toBe('1');
    req.flush(envelope(pagina([fornecedor])));
  });

  it('detalhar faz GET /{id} e desembrulha com produtoIds', () => {
    let recebido: Fornecedor | undefined;
    service.detalhar(3).subscribe((f) => (recebido = f));
    const req = httpMock.expectOne(`${BASE}/3`);
    expect(req.request.method).toBe('GET');
    req.flush(envelope(fornecedor));
    expect(recebido?.produtoIds).toEqual([5, 8]);
  });

  it('criar faz POST e desembrulha o FornecedorResponse', () => {
    const body: FornecedorRequest = { nome: 'Sítio das Flores' }; // RF-1: sem produtoIds na escrita
    let criado: Fornecedor | undefined;
    service.criar(body).subscribe((f) => (criado = f));
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    req.flush(envelope(fornecedor));
    expect(criado).toEqual(fornecedor);
  });

  it('atualizar faz PUT no id', () => {
    service.atualizar(3, { nome: 'Sítio das Flores' }).subscribe(); // RF-1: sem produtoIds na escrita
    const req = httpMock.expectOne(`${BASE}/3`);
    expect(req.request.method).toBe('PUT');
    req.flush(envelope(fornecedor));
  });

  it('excluir faz DELETE no id (204)', () => {
    service.excluir(3).subscribe();
    const req = httpMock.expectOne(`${BASE}/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
