import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { UsuarioForm } from './usuario-form';
import { UsuariosService, CriarUsuarioRequest } from '../usuarios.service';
import { Usuario } from '../../../core/models/auth.model';

interface FormProbe {
  form: {
    setValue(v: CriarUsuarioRequest): void;
    get(name: string): { hasError(k: string): boolean; getError(k: string): string } | null;
  };
  cadastrar(): void;
  enviando(): boolean;
  criado: { subscribe(fn: (u: Usuario) => void): void };
}

describe('UsuarioForm (T-M1-9)', () => {
  let serviceSpy: jasmine.SpyObj<Pick<UsuariosService, 'criar'>>;

  const maria: Usuario = {
    id: 2,
    nome: 'Maria Silva',
    email: 'maria@floricultura.local',
    role: 'USER',
    ativo: true,
    senhaProvisoria: true,
    criadoEm: '2026-08-31T14:00:00Z',
  };

  const valido: CriarUsuarioRequest = {
    nome: 'Maria Silva',
    email: 'maria@floricultura.local',
    senha: 'provisoria8',
    role: 'USER',
  };

  function montar() {
    const fixture = TestBed.createComponent(UsuarioForm);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as FormProbe;
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<Pick<UsuariosService, 'criar'>>('UsuariosService', ['criar']);
    TestBed.configureTestingModule({
      imports: [UsuarioForm],
      providers: [
        provideNoopAnimations(),
        { provide: UsuariosService, useValue: serviceSpy },
      ],
    });
  });

  it('não chama o serviço com o form inválido', () => {
    const probe = montar();
    probe.cadastrar();
    expect(serviceSpy.criar).not.toHaveBeenCalled();
  });

  it('submete o payload correto e emite `criado` (CA-14)', () => {
    serviceSpy.criar.and.returnValue(of(maria));
    const probe = montar();
    let emitido: Usuario | undefined;
    probe.criado.subscribe((u) => (emitido = u));

    probe.form.setValue(valido);
    probe.cadastrar();

    expect(serviceSpy.criar).toHaveBeenCalledWith(valido);
    expect(emitido).toEqual(maria);
    expect(probe.enviando()).toBeFalse();
  });

  it('409 marca "E-mail já cadastrado." no campo e-mail', () => {
    serviceSpy.criar.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );
    const probe = montar();
    probe.form.setValue(valido);
    probe.cadastrar();

    const email = probe.form.get('email');
    expect(email?.hasError('servidor')).toBeTrue();
    expect(email?.getError('servidor')).toBe('E-mail já cadastrado.');
  });

  it('400 VALIDATION_ERROR aplica os details por campo', () => {
    serviceSpy.criar.and.returnValue(
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
                details: [{ field: 'senha', message: 'senha fora da politica' }],
              },
              timestamp: '',
              path: '',
            },
          }),
      ),
    );
    const probe = montar();
    // Dados válidos no client (senha >= 8) → o submit chega ao servidor, que responde 400.
    probe.form.setValue({ ...valido, senha: 'senhavalida8' });
    probe.cadastrar();

    const senha = probe.form.get('senha');
    expect(senha?.getError('servidor')).toBe('senha fora da politica');
  });
});
