import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { UsuariosService } from './usuarios.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { Usuario } from '../../core/models/auth.model';

describe('UsuariosService (T-M1-9)', () => {
  let service: UsuariosService;
  let httpMock: HttpTestingController;

  const BASE = 'http://localhost:8080/api/v1/usuarios';
  const maria: Usuario = {
    id: 2,
    nome: 'Maria Silva',
    email: 'maria@floricultura.local',
    role: 'USER',
    ativo: true,
    senhaProvisoria: true,
    criadoEm: '2026-08-31T14:00:00Z',
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UsuariosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar() faz GET e desembrulha o array do envelope', () => {
    let recebido: Usuario[] | undefined;
    service.listar().subscribe((l) => (recebido = l));

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush(envelope([maria]));

    expect(recebido).toEqual([maria]);
  });

  it('detalhar() faz GET /{id}', () => {
    let recebido: Usuario | undefined;
    service.detalhar(2).subscribe((u) => (recebido = u));

    const req = httpMock.expectOne(`${BASE}/2`);
    expect(req.request.method).toBe('GET');
    req.flush(envelope(maria));

    expect(recebido).toEqual(maria);
  });

  it('criar() faz POST com o payload e devolve o UsuarioResponse', () => {
    const payload = {
      nome: 'Maria Silva',
      email: 'maria@floricultura.local',
      senha: 'provisoria8',
      role: 'USER' as const,
    };
    let recebido: Usuario | undefined;
    service.criar(payload).subscribe((u) => (recebido = u));

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(envelope(maria), { status: 201, statusText: 'Created' });

    expect(recebido).toEqual(maria);
  });

  it('alterarStatus() faz PATCH /{id}/status com { ativo }', () => {
    let recebido: Usuario | undefined;
    service.alterarStatus(2, false).subscribe((u) => (recebido = u));

    const req = httpMock.expectOne(`${BASE}/2/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ ativo: false });
    req.flush(envelope({ ...maria, ativo: false }));

    expect(recebido?.ativo).toBeFalse();
  });

  it('resetarSenha() faz PATCH /{id}/senha com { novaSenha } e trata 204', () => {
    let completou = false;
    service.resetarSenha(2, 'temporaria8').subscribe(() => (completou = true));

    const req = httpMock.expectOne(`${BASE}/2/senha`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ novaSenha: 'temporaria8' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(completou).toBeTrue();
  });
});
