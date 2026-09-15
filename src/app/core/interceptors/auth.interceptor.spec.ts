import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { authInterceptor } from './auth.interceptor';
import { TOKEN_KEY } from '../services/auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: { navigate: jasmine.Spy };
  let snackBar: { open: jasmine.Spy };

  const BASE = 'http://localhost:8080/api/v1';

  beforeEach(() => {
    localStorage.clear();
    router = { navigate: jasmine.createSpy('navigate') };
    snackBar = { open: jasmine.createSpy('open') };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('injeta Authorization: Bearer quando há token (CA-13)', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-xyz');

    http.get(`${BASE}/auth/me`).subscribe();
    const req = httpMock.expectOne(`${BASE}/auth/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-xyz');
    req.flush({});
  });

  it('não injeta header quando não há token', () => {
    http.get(`${BASE}/auth/me`).subscribe();
    const req = httpMock.expectOne(`${BASE}/auth/me`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('não intercepta a rota pública de login (sem header e sem logout no 401)', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-xyz');

    http.post(`${BASE}/auth/login`, {}).subscribe({ next: () => {}, error: () => {} });
    const req = httpMock.expectOne(`${BASE}/auth/login`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-xyz');
  });

  it('401 desloga e navega para /login (CA-13)', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-xyz');

    http.get(`${BASE}/auth/me`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${BASE}/auth/me`).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('403 mostra snackbar de permissão e NÃO desloga (CA-13)', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-xyz');

    http.get(`${BASE}/usuarios`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${BASE}/usuarios`).flush({}, { status: 403, statusText: 'Forbidden' });

    expect(snackBar.open).toHaveBeenCalledWith(
      'Você não tem permissão para esta ação.',
      'Fechar',
      { duration: 5000 },
    );
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-xyz');
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('não envia token a terceiros nem encerra a sessão por um 401 externo', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-xyz');
    http.get('https://imagens.example/api/v1/foto').subscribe({ error: () => {} });
    const req = httpMock.expectOne('https://imagens.example/api/v1/foto');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-xyz');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('não confunde um prefixo parecido com o caminho da API', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-xyz');
    http.get(`${BASE}-externa/dados`).subscribe();
    const req = httpMock.expectOne(`${BASE}-externa/dados`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

});
