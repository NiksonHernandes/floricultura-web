import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { UsuariosService } from './usuarios.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { PaginaResponse } from '../../core/models/produto.model';
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

  function pagina(conteudo: Usuario[]): PaginaResponse<Usuario> {
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
    service = TestBed.inject(UsuariosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // Retrofit T-M2-10/CA-21 (AD-SQ-29): `listar` migra de `Usuario[]` para `PaginaResponse<Usuario>`,
  // enviando pagina/tamanho (0-based) e o filtro `nome` — mesmo padrão de `ProdutosService`.
  it('listar() faz GET com pagina/tamanho e desembrulha a PaginaResponse do envelope', () => {
    let recebido: PaginaResponse<Usuario> | undefined;
    service.listar(0, 20).subscribe((p) => (recebido = p));

    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('pagina') === '0' && r.params.get('tamanho') === '20',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('nome')).toBeFalse();
    req.flush(envelope(pagina([maria])));

    expect(recebido?.conteudo).toEqual([maria]);
    expect(recebido?.totalElementos).toBe(1);
  });

  it('listar() com nome inclui o filtro (trimado) nos params', () => {
    service.listar(1, 50, '  ma  ').subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('pagina') === '1' && r.params.get('tamanho') === '50',
    );
    expect(req.request.params.get('nome')).toBe('ma');
    req.flush(envelope(pagina([])));
  });

  it('listar() com nome só de espaços NÃO envia o param nome', () => {
    service.listar(0, 20, '   ').subscribe();

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('nome')).toBeFalse();
    req.flush(envelope(pagina([])));
  });

  it('detalhar() faz GET /{id}', () => {
    let recebido: Usuario | undefined;
    service.detalhar(2).subscribe((u) => (recebido = u));

    const req = httpMock.expectOne(`${BASE}/2`);
    expect(req.request.method).toBe('GET');
    req.flush(envelope(maria));

    expect(recebido).toEqual(maria);
  });

  it('criar() faz POST com o payload (sem `role`) e devolve o UsuarioResponse', () => {
    // Regra do dono: cadastro nasce USER — o front não envia `role` no corpo.
    const payload = {
      nome: 'Maria Silva',
      email: 'maria@floricultura.local',
      senha: 'provisoria8',
    };
    let recebido: Usuario | undefined;
    service.criar(payload).subscribe((u) => (recebido = u));

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    expect(req.request.body.role).toBeUndefined();
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
