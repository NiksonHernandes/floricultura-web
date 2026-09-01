import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { AuthService, TOKEN_KEY } from './auth.service';
import { ApiResponse } from '../models/api-response.model';
import { LoginData, UsuarioSessao } from '../models/auth.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  const BASE = 'http://localhost:8080/api/v1';
  const usuario: UsuarioSessao = {
    id: 1,
    nome: 'Administrador',
    email: 'admin@floricultura.local',
    role: 'ADMIN',
    senhaProvisoria: false,
  };

  function envelope<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null, timestamp: '', path: '' };
  }

  function logar(usuarioLogin: UsuarioSessao = usuario, token = 'jwt-abc'): void {
    service.login({ email: usuarioLogin.email, senha: 'x' }).subscribe();
    const login: LoginData = { token, tokenType: 'Bearer', expiresIn: 3600, usuario: usuarioLogin };
    httpMock.expectOne(`${BASE}/auth/login`).flush(envelope(login));
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('login guarda token e usuário e alimenta os signals (CA-13)', () => {
    let recebido: UsuarioSessao | undefined;
    service.login({ email: usuario.email, senha: 'x' }).subscribe((u) => (recebido = u));

    const req = httpMock.expectOne(`${BASE}/auth/login`);
    expect(req.request.method).toBe('POST');
    const login: LoginData = { token: 'jwt-abc', tokenType: 'Bearer', expiresIn: 3600, usuario };
    req.flush(envelope(login));

    expect(recebido).toEqual(usuario);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-abc');
    expect(service.token()).toBe('jwt-abc');
    expect(service.usuarioAtual()).toEqual(usuario);
    expect(service.estaAutenticado()).toBeTrue();
    expect(service.ehAdmin()).toBeTrue();
  });

  it('logout limpa token e perfil da sessão (CA-13)', () => {
    logar();
    expect(service.estaAutenticado()).toBeTrue();

    service.logout();

    expect(service.token()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(service.usuarioAtual()).toBeNull();
    expect(service.estaAutenticado()).toBeFalse();
    expect(service.ehAdmin()).toBeFalse();
  });

  it('me() reidrata o perfil no signal (CA-13)', () => {
    let recebido: UsuarioSessao | undefined;
    service.me().subscribe((u) => (recebido = u));

    const req = httpMock.expectOne(`${BASE}/auth/me`);
    expect(req.request.method).toBe('GET');
    // /auth/me devolve tambem `ativo` — campo extra e ignorado no mapeamento.
    req.flush(envelope({ ...usuario, ativo: true }));

    expect(recebido?.id).toBe(1);
    expect(service.usuarioAtual()?.email).toBe('admin@floricultura.local');
    expect(service.ehAdmin()).toBeTrue();
  });

  it('trocarSenha faz PATCH com o payload correto e zera senhaProvisoria', () => {
    logar({ ...usuario, senhaProvisoria: true });
    expect(service.usuarioAtual()?.senhaProvisoria).toBeTrue();

    service.trocarSenha('atual', 'novaSenha8').subscribe();
    const req = httpMock.expectOne(`${BASE}/auth/senha`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ senhaAtual: 'atual', novaSenha: 'novaSenha8' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(service.usuarioAtual()?.senhaProvisoria).toBeFalse();
  });

  it('reidratar() sem token não chama a API e emite null', () => {
    let recebido: UsuarioSessao | null | undefined;
    service.reidratar().subscribe((v) => (recebido = v));

    httpMock.expectNone(`${BASE}/auth/me`);
    expect(recebido).toBeNull();
  });

  it('reidratar() com token chama /auth/me e popula o perfil', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-abc');

    service.reidratar().subscribe();
    httpMock.expectOne(`${BASE}/auth/me`).flush(envelope({ ...usuario, ativo: true }));

    expect(service.usuarioAtual()?.id).toBe(1);
    expect(service.estaAutenticado()).toBeTrue();
  });

  it('reidratar() com token inválido (401) desloga silenciosamente', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-expirado');

    let recebido: UsuarioSessao | null | undefined = undefined;
    service.reidratar().subscribe((v) => (recebido = v));
    httpMock
      .expectOne(`${BASE}/auth/me`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(recebido).toBeNull();
    expect(service.token()).toBeNull();
    expect(service.usuarioAtual()).toBeNull();
  });
});
