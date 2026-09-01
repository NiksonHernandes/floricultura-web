import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../models/api-response.model';
import { UsuarioSessao } from '../models/auth.model';

describe('adminGuard', () => {
  let router: { createUrlTree: jasmine.Spy };
  let snackBar: { open: jasmine.Spy };
  let auth: AuthService;
  let httpMock: HttpTestingController;

  const BASE = 'http://localhost:8080/api/v1';
  const rota = {} as ActivatedRouteSnapshot;
  const estado = {} as RouterStateSnapshot;

  function envelope(usuario: UsuarioSessao): ApiResponse<UsuarioSessao> {
    return { success: true, data: usuario, error: null, timestamp: '', path: '' };
  }

  function carregarPerfil(role: 'ADMIN' | 'USER') {
    auth.me().subscribe();
    httpMock.expectOne(`${BASE}/auth/me`).flush(
      envelope({ id: 1, nome: 'X', email: 'x@floricultura.local', role, senhaProvisoria: false }),
    );
  }

  function executar() {
    return TestBed.runInInjectionContext(() => adminGuard(rota, estado));
  }

  beforeEach(() => {
    router = { createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue({} as UrlTree) };
    snackBar = { open: jasmine.createSpy('open') };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    auth = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('libera a rota para ADMIN', () => {
    carregarPerfil('ADMIN');
    expect(executar()).toBeTrue();
    expect(router.createUrlTree).not.toHaveBeenCalled();
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('bloqueia USER: snackbar 403 + redireciona para home (CA-13)', () => {
    carregarPerfil('USER');
    executar();
    expect(snackBar.open).toHaveBeenCalled();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
  });

  it('bloqueia anônimo (sem perfil) da mesma forma', () => {
    executar();
    expect(snackBar.open).toHaveBeenCalled();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
  });
});
