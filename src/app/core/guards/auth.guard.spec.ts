import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import { authGuard } from './auth.guard';
import { TOKEN_KEY } from '../services/auth.service';

describe('authGuard', () => {
  let router: { createUrlTree: jasmine.Spy };

  const rota = {} as ActivatedRouteSnapshot;
  const estado = {} as RouterStateSnapshot;

  beforeEach(() => {
    localStorage.clear();
    router = { createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue({} as UrlTree) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
  });

  afterEach(() => localStorage.clear());

  function executar() {
    return TestBed.runInInjectionContext(() => authGuard(rota, estado));
  }

  it('libera a rota quando há token', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-xyz');
    expect(executar()).toBeTrue();
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('redireciona para /login quando não há token (CA-13)', () => {
    executar();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
