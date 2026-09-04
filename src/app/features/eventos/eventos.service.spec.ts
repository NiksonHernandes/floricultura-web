import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { EventosService } from './eventos.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
import { Evento, EventoRequest } from '../../core/models/evento.model';

describe('EventosService (T-M4-4)', () => {
  let service: EventosService;
  let httpMock: HttpTestingController;
  const BASE = 'http://localhost:8080/api/v1/eventos';

  const evento: Evento = {
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

  function pagina(conteudo: Evento[]): PaginaResponse<Evento> {
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
      providers: [EventosService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar sem filtro não envia o param nome', () => {
    service.listar(0, 12).subscribe((p) => expect(p.conteudo.length).toBe(1));
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('pagina')).toBe('0');
    expect(req.request.params.get('tamanho')).toBe('12');
    expect(req.request.params.has('nome')).toBeFalse();
    req.flush(envelope(pagina([evento])));
  });

  it('listar com filtro envia nome (trim) e paginação (§3.2)', () => {
    service.listar(1, 24, '  dia  ').subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE && r.params.get('nome') === 'dia');
    expect(req.request.params.get('pagina')).toBe('1');
    req.flush(envelope(pagina([evento])));
  });

  it('criar faz POST e desembrulha o EventoResponse', () => {
    const body: EventoRequest = {
      nome: 'Dia das Mães',
      tipo: 'COMEMORATIVA',
      dataInicio: '2026-05-10',
      repeteTodoAno: true,
    };
    let criado: Evento | undefined;
    service.criar(body).subscribe((e) => (criado = e));
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    req.flush(envelope(evento));
    expect(criado).toEqual(evento);
  });

  it('atualizar faz PUT no id', () => {
    service.atualizar(12, { nome: 'X', tipo: 'FEIRA', dataInicio: '2026-05-10' }).subscribe();
    const req = httpMock.expectOne(`${BASE}/12`);
    expect(req.request.method).toBe('PUT');
    req.flush(envelope(evento));
  });

  it('excluir faz DELETE no id (204)', () => {
    service.excluir(12).subscribe();
    const req = httpMock.expectOne(`${BASE}/12`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
