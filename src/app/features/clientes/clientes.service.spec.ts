import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ClientesService } from './clientes.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Cliente, ClienteRequest } from '../../core/models/cliente.model';

/**
 * Espelho de `eventos.service.spec.ts`. Dados FICTÍCIOS (LGPD, §3.3): "Maria Flores",
 * `@exemplo.com.br`, `(11) 90000-0000` — nunca PII real.
 */
describe('ClientesService (T-M5-6)', () => {
  let service: ClientesService;
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/clientes';

  const cliente: Cliente = {
    id: 7,
    nome: 'Maria Flores',
    telefone: '(11) 90000-0000',
    email: 'maria@exemplo.com.br',
    observacoes: 'Prefere arranjos de outono.',
    produtoIds: [12, 30],
    criadoEm: '2026-09-04T14:05:00Z',
    atualizadoEm: '2026-09-04T14:05:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Cliente[]): PaginaResponse<Cliente> {
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
      providers: [ClientesService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClientesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar sem filtro não envia o param nome (item de lista com produtoIds=null)', () => {
    // Na lista o back manda produtoIds=null (AD-SQ-38/44).
    const item: Cliente = { ...cliente, produtoIds: null };
    service.listar(0, 20).subscribe((p) => expect(p.conteudo[0].produtoIds).toBeNull());
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.get('tamanho')).toBe('20');
    expect(req.request.params.has('nome')).toBeFalse();
    req.flush(envelope(pagina([item])));
  });

  it('listar com filtro envia nome (trim) e paginação (§3.4)', () => {
    service.listar(1, 24, '  ma  ').subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE && r.params.get('nome') === 'ma');
    expect(req.request.params.get('pagina')).toBe('1');
    req.flush(envelope(pagina([cliente])));
  });

  it('detalhar faz GET /{id} e desembrulha com produtoIds', () => {
    let recebido: Cliente | undefined;
    service.detalhar(7).subscribe((c) => (recebido = c));
    const req = httpMock.expectOne(`${BASE}/7`);
    expect(req.request.method).toBe('GET');
    req.flush(envelope(cliente));
    expect(recebido?.produtoIds).toEqual([12, 30]);
  });

  it('criar faz POST e desembrulha o ClienteResponse', () => {
    const body: ClienteRequest = { nome: 'Maria Flores', produtoIds: [12, 30] };
    let criado: Cliente | undefined;
    service.criar(body).subscribe((c) => (criado = c));
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    req.flush(envelope(cliente));
    expect(criado).toEqual(cliente);
  });

  it('atualizar faz PUT no id', () => {
    service.atualizar(7, { nome: 'Maria Flores', produtoIds: [30] }).subscribe();
    const req = httpMock.expectOne(`${BASE}/7`);
    expect(req.request.method).toBe('PUT');
    req.flush(envelope(cliente));
  });

  it('excluir faz DELETE no id (204)', () => {
    service.excluir(7).subscribe();
    const req = httpMock.expectOne(`${BASE}/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
