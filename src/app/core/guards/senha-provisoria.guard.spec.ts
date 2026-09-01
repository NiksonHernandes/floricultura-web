import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import { senhaProvisoriaGuard } from './senha-provisoria.guard';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../models/api-response.model';
import { UsuarioSessao } from '../models/auth.model';

describe('senhaProvisoriaGuard', () => {
  let router: { createUrlTree: jasmine.Spy };
  let auth: AuthService;
  let httpMock: HttpTestingController;

  const BASE = 'http://localhost:8080/api/v1';
  const rota = {} as ActivatedRouteSnapshot;
  const estado = {} as RouterStateSnapshot;

  function envelope(usuario: UsuarioSessao): ApiResponse<UsuarioSessao> {
    return { success: true, data: usuario, error: null, timestamp: '', path: '' };
  }

  function carregarPerfil(senhaProvisoria: boolean) {
    auth.me().subscribe();
    httpMock.expectOne(`${BASE}/auth/me`).flush(
      envelope({ id: 1, nome: 'X', email: 'x@floricultura.local', role: 'ADMIN', senhaProvisoria }),
    );
  }

  function executar() {
    return TestBed.runInInjectionContext(() => senhaProvisoriaGuard(rota, estado));
  }

  beforeEach(() => {
    router = { createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue({} as UrlTree) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    auth = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('desvia para /trocar-senha quando a senha é provisória (CA-14 · 1º login forçado)', () => {
    carregarPerfil(true);
    executar();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/trocar-senha']);
  });

  it('libera a rota quando a senha não é provisória', () => {
    carregarPerfil(false);
    expect(executar()).toBeTrue();
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('libera quando não há perfil (anônimo) — quem barra é a authGuard', () => {
    expect(executar()).toBeTrue();
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });
});
