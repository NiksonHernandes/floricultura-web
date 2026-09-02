import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { Usuarios } from './usuarios';
import { UsuariosService } from './usuarios.service';
import { Usuario } from '../../core/models/auth.model';

interface UsuariosProbe {
  usuarios(): Usuario[];
  vazia(): boolean;
  erroStatus(): string | null;
  alvoStatus(): Usuario | null;
  alvoReset(): Usuario | null;
  formAberto: { set(v: boolean): void };
  resetForm: { setValue(v: { novaSenha: string; confirmarNovaSenha: string }): void };
  aoCriar(u: Usuario): void;
  pedirStatus(u: Usuario): void;
  confirmarStatus(): void;
  pedirReset(u: Usuario): void;
  confirmarReset(): void;
}

describe('Usuarios (T-M1-9)', () => {
  let serviceSpy: jasmine.SpyObj<
    Pick<UsuariosService, 'listar' | 'alterarStatus' | 'resetarSenha'>
  >;

  function usuario(over: Partial<Usuario>): Usuario {
    return {
      id: 1,
      nome: 'Zelia',
      email: 'z@floricultura.local',
      role: 'USER',
      ativo: true,
      senhaProvisoria: false,
      criadoEm: '2026-08-31T00:00:00Z',
      ...over,
    };
  }

  const ana = usuario({ id: 2, nome: 'Ana', email: 'ana@floricultura.local' });
  const zelia = usuario({ id: 1, nome: 'Zelia' });
  const admin = usuario({ id: 3, nome: 'Bianca', role: 'ADMIN' });

  function montar(lista: Usuario[] = [zelia, ana]) {
    serviceSpy.listar.and.returnValue(of(lista));
    const fixture = TestBed.createComponent(Usuarios);
    fixture.detectChanges(); // dispara ngOnInit → carregar()
    return fixture.componentInstance as unknown as UsuariosProbe;
  }

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<
      Pick<UsuariosService, 'listar' | 'alterarStatus' | 'resetarSenha'>
    >('UsuariosService', ['listar', 'alterarStatus', 'resetarSenha']);

    TestBed.configureTestingModule({
      imports: [Usuarios],
      providers: [
        provideNoopAnimations(),
        { provide: UsuariosService, useValue: serviceSpy },
        { provide: MatSnackBar, useValue: jasmine.createSpyObj('MatSnackBar', ['open']) },
      ],
    });
  });

  it('carrega e ordena por nome ao iniciar', () => {
    const probe = montar([zelia, ana]);
    expect(probe.usuarios().map((u) => u.nome)).toEqual(['Ana', 'Zelia']);
    expect(probe.vazia()).toBeFalse();
  });

  it('lista vazia sinaliza estado vazio honesto', () => {
    const probe = montar([]);
    expect(probe.vazia()).toBeTrue();
  });

  it('aoCriar insere ordenado e fecha o form', () => {
    const probe = montar([zelia]);
    probe.aoCriar(ana);
    expect(probe.usuarios().map((u) => u.nome)).toEqual(['Ana', 'Zelia']);
  });

  it('confirmarStatus chama alterarStatus negando `ativo` e atualiza a lista (CA-14)', () => {
    serviceSpy.alterarStatus.and.returnValue(of(usuario({ id: 1, nome: 'Zelia', ativo: false })));
    const probe = montar([zelia]);

    probe.pedirStatus(zelia);
    probe.confirmarStatus();

    expect(serviceSpy.alterarStatus).toHaveBeenCalledWith(1, false);
    expect(probe.usuarios()[0].ativo).toBeFalse();
    expect(probe.alvoStatus()).toBeNull();
  });

  it('409 no status mostra a mensagem do último administrador e mantém o diálogo', () => {
    serviceSpy.alterarStatus.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );
    const probe = montar([admin]);

    probe.pedirStatus(admin);
    probe.confirmarStatus();

    expect(probe.erroStatus()).toBe('Não é possível desativar o único administrador ativo.');
    expect(probe.alvoStatus()).not.toBeNull();
  });

  it('confirmarReset envia a nova senha DEFINITIVA e limpa senhaProvisoria no alvo (CA-14, AD-SQ-26)', () => {
    serviceSpy.resetarSenha.and.returnValue(of(void 0));
    const probe = montar([ana]);

    probe.pedirReset(ana);
    probe.resetForm.setValue({ novaSenha: 'definitiva8', confirmarNovaSenha: 'definitiva8' });
    probe.confirmarReset();

    expect(serviceSpy.resetarSenha).toHaveBeenCalledWith(2, 'definitiva8');
    expect(probe.usuarios().find((u) => u.id === 2)?.senhaProvisoria).toBeFalse();
    expect(probe.alvoReset()).toBeNull();
  });

  it('reset não chama o serviço quando a senha é curta', () => {
    const probe = montar([ana]);
    probe.pedirReset(ana);
    probe.resetForm.setValue({ novaSenha: 'curta1', confirmarNovaSenha: 'curta1' });
    probe.confirmarReset();
    expect(serviceSpy.resetarSenha).not.toHaveBeenCalled();
  });

  it('reset não chama o serviço quando a confirmação diverge da nova senha (AD-SQ-26)', () => {
    const probe = montar([ana]);
    probe.pedirReset(ana);
    probe.resetForm.setValue({ novaSenha: 'definitiva8', confirmarNovaSenha: 'diferente9' });
    probe.confirmarReset();
    expect(serviceSpy.resetarSenha).not.toHaveBeenCalled();
    expect(probe.alvoReset()).not.toBeNull();
  });
});
