import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CoresService } from './cores.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { PaginaResponse } from '../../../core/models/produto.model';
import { Cor } from '../../../core/models/cor.model';

/**
 * `CoresService` (T-M6-06a, SPEC-M6 §3.2) — espelho de `fornecedores.service.spec.ts`.
 *
 * O que este arquivo trava: a paginação 0-based do envelope e o contrato do filtro `?nome`, que é
 * onde mora a decisão de desenho da task — o termo vai **cru**, porque a canonização (§3.2.1) é
 * responsabilidade ÚNICA do back.
 */
describe('CoresService (T-M6-06a)', () => {
  let service: CoresService;
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/cores';

  const cinza: Cor = {
    id: 7,
    nome: 'CINZA-ESCURO',
    hex: '#C4326B',
    produtosVinculados: 3,
    criadoEm: '2026-09-11T13:02:11Z',
    atualizadoEm: '2026-09-11T13:02:11Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function pagina(conteudo: Cor[]): PaginaResponse<Cor> {
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
      providers: [CoresService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CoresService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar sem filtro manda só paginação e desembrulha o envelope', () => {
    let recebida: PaginaResponse<Cor> | undefined;
    service.listar(0, 12).subscribe((p) => (recebida = p));

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.get('tamanho')).toBe('12');
    expect(req.request.params.has('nome')).toBeFalse();
    req.flush(envelope(pagina([cinza])));

    expect(recebida?.conteudo[0].nome).toBe('CINZA-ESCURO');
    expect(recebida?.conteudo[0].produtosVinculados).toBe(3);
  });

  it('o termo do filtro vai CRU: quem canoniza é o back (§3.2.1, fonte única)', () => {
    service.listar(1, 12, 'cinza escuro').subscribe();

    const req = httpMock.expectOne((r) => r.url === BASE);
    // Nada de MAIÚSCULAS nem hífen aqui: o servidor aplica `Cores.canonizar` no termo e no dado.
    expect(req.request.params.get('nome')).toBe('cinza escuro');
    expect(req.request.params.get('pagina')).toBe('1');
    req.flush(envelope(pagina([cinza])));
  });

  it('termo só de espaços não vira filtro (decisão "tem filtro?" usa trim, o valor não)', () => {
    service.listar(0, 12, '   ').subscribe();

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('nome')).toBeFalse();
    req.flush(envelope(pagina([])));
  });

  it('cor sem amostra chega com hex null e sem vínculo chega com 0 (dado do back, não inventado)', () => {
    const semAmostra: Cor = { ...cinza, id: 9, nome: 'AZUL', hex: null, produtosVinculados: 0 };
    let recebida: PaginaResponse<Cor> | undefined;
    service.listar(0, 12).subscribe((p) => (recebida = p));

    httpMock.expectOne((r) => r.url === BASE).flush(envelope(pagina([semAmostra])));

    expect(recebida?.conteudo[0].hex).toBeNull();
    expect(recebida?.conteudo[0].produtosVinculados).toBe(0);
  });

  // --- Escrita (T-M6-06b): o payload sai cru e o 409 sobe inteiro para o chamador ---

  it('criar faz POST e devolve a cor JÁ canônica da resposta', () => {
    let criada: Cor | undefined;
    service.criar({ nome: 'cinza escuro', hex: null }).subscribe((c) => (criada = c));

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nome: 'cinza escuro', hex: null });
    req.flush(envelope(cinza));

    expect(criada?.nome).toBe('CINZA-ESCURO');
  });

  it('atualizar faz PUT no id', () => {
    service.atualizar(7, { nome: 'cinza escuro', hex: '#c4326b' }).subscribe();

    const req = httpMock.expectOne(`${BASE}/7`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ nome: 'cinza escuro', hex: '#c4326b' });
    req.flush(envelope(cinza));
  });

  it('excluir faz DELETE e NÃO engole o 409 — quem exibe a mensagem é a tela', () => {
    let status = 0;
    let mensagem = '';
    // Tipagem local (em vez de importar `HttpErrorResponse` na 1ª linha do arquivo): o spec da 06a
    // segue com ZERO linha alterada — só acréscimo no fim (anti-burla §10 #31).
    type ErroDeApi = { status: number; error: { error: { message: string } } };
    service.excluir(7).subscribe({
      error: (e: ErroDeApi) => {
        status = e.status;
        mensagem = e.error.error.message;
      },
    });

    const req = httpMock.expectOne(`${BASE}/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush(
      {
        success: false,
        data: null,
        error: { code: 'CONFLICT', message: 'Cor em uso por 3 produto(s).', details: [] },
        timestamp: '',
        path: '',
      },
      { status: 409, statusText: 'Conflict' },
    );

    expect(status).toBe(409);
    expect(mensagem).toBe('Cor em uso por 3 produto(s).');
  });
});
