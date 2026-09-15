import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { Login } from './login';
import { AuthService } from '../../../core/services/auth.service';
import { LoginRequest, UsuarioSessao } from '../../../core/models/auth.model';

/** Acesso aos membros protegidos do componente nos testes. */
interface LoginProbe {
  form: {
    setValue(v: { email: string; senha: string }): void;
    get(name: string): { hasError(k: string): boolean; getError(k: string): string } | null;
    invalid: boolean;
  };
  entrar(): void;
  carregando(): boolean;
  erroGeral(): string | null;
}

describe('Login (T-M1-8)', () => {
  let authSpy: jasmine.SpyObj<Pick<AuthService, 'login'>>;
  let routerSpy: jasmine.SpyObj<Pick<Router, 'navigate'>>;

  const admin: UsuarioSessao = {
    id: 1,
    nome: 'Administrador',
    email: 'admin@floricultura.local',
    role: 'ADMIN',
    senhaProvisoria: false,
  };

  function montar() {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return {
      fixture,
      probe: fixture.componentInstance as unknown as LoginProbe,
    };
  }

  beforeEach(() => {
    authSpy = jasmine.createSpyObj<Pick<AuthService, 'login'>>('AuthService', ['login']);
    routerSpy = jasmine.createSpyObj<Pick<Router, 'navigate'>>('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideNoopAnimations(),
        { provide: AuthService, useValue: authSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  it('cria o componente', () => {
    const { fixture } = montar();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('não chama o serviço quando o form está inválido', () => {
    const { probe } = montar();
    probe.entrar();
    expect(authSpy.login).not.toHaveBeenCalled();
  });

  it('submete o payload correto e redireciona ADMIN para a Home /painel (CA-16)', () => {
    authSpy.login.and.returnValue(of(admin));
    const { probe } = montar();

    probe.form.setValue({ email: admin.email, senha: 'segredo123' });
    probe.entrar();

    const enviado = authSpy.login.calls.mostRecent().args[0] as LoginRequest;
    expect(enviado).toEqual({ email: admin.email, senha: 'segredo123' });
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/painel']);
    expect(probe.carregando()).toBeFalse();
  });

  it('USER também vai para a Home /painel (AD-SQ-33, CA-16)', () => {
    authSpy.login.and.returnValue(of({ ...admin, role: 'USER' as const }));
    const { probe } = montar();

    probe.form.setValue({ email: 'user@floricultura.local', senha: 'segredo123' });
    probe.entrar();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/painel']);
  });

  it('401 mostra a mensagem genérica do contrato e não redireciona (§3.2)', () => {
    authSpy.login.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
    );
    const { probe } = montar();

    probe.form.setValue({ email: admin.email, senha: 'errada' });
    probe.entrar();

    expect(probe.erroGeral()).toBe('Credenciais inválidas.');
    expect(routerSpy.navigate).not.toHaveBeenCalled();
    expect(probe.carregando()).toBeFalse();
  });

  it('400 VALIDATION_ERROR aplica o erro no campo via details', () => {
    authSpy.login.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              success: false,
              data: null,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Dados inválidos.',
                details: [{ field: 'email', message: 'E-mail em formato inválido.' }],
              },
              timestamp: '',
              path: '',
            },
          }),
      ),
    );
    const { probe } = montar();

    probe.form.setValue({ email: 'x@y.z', senha: 'segredo123' });
    probe.entrar();

    const email = probe.form.get('email');
    expect(email?.hasError('servidor')).toBeTrue();
    expect(email?.getError('servidor')).toBe('E-mail em formato inválido.');
  });
});
