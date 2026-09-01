import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { TrocarSenha } from './trocar-senha';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioSessao } from '../../../core/models/auth.model';

/** Acesso tipado aos membros protegidos do componente nos testes. */
interface TrocaProbe {
  form: {
    setValue(v: { senhaAtual: string; novaSenha: string; confirmarNovaSenha: string }): void;
    get(name: string): { hasError(k: string): boolean; getError(k: string): string } | null;
  };
  salvar(): void;
  enviando(): boolean;
  sucesso(): boolean;
  erroGeral(): string | null;
}

/** Envelope de erro §3.1 com details por campo. */
function erro400(field: string, message: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 400,
    statusText: 'Bad Request',
    error: {
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', details: [{ field, message }] },
      timestamp: '',
      path: '',
    },
  });
}

describe('TrocarSenha (T-M1-10)', () => {
  let auth: {
    trocarSenha: jasmine.Spy;
    ehAdmin: jasmine.Spy;
    usuarioAtual: jasmine.Spy;
  };
  let router: { navigate: jasmine.Spy };
  let snack: { open: jasmine.Spy };

  const provisorio: UsuarioSessao = {
    id: 1,
    nome: 'Administrador',
    email: 'admin@floricultura.local',
    role: 'ADMIN',
    senhaProvisoria: true,
  };

  function montar() {
    const fixture = TestBed.createComponent(TrocarSenha);
    fixture.detectChanges();
    return { fixture, probe: fixture.componentInstance as unknown as TrocaProbe };
  }

  beforeEach(() => {
    auth = {
      trocarSenha: jasmine.createSpy('trocarSenha'),
      ehAdmin: jasmine.createSpy('ehAdmin').and.returnValue(true),
      usuarioAtual: jasmine.createSpy('usuarioAtual').and.returnValue(provisorio),
    };
    router = { navigate: jasmine.createSpy('navigate') };
    snack = { open: jasmine.createSpy('open') };

    TestBed.configureTestingModule({
      imports: [TrocarSenha],
      providers: [
        provideNoopAnimations(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snack },
      ],
    });
  });

  it('cria o componente', () => {
    const { fixture } = montar();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('não chama o serviço quando o form está vazio/inválido', () => {
    const { probe } = montar();
    probe.salvar();
    expect(auth.trocarSenha).not.toHaveBeenCalled();
  });

  it('não submete quando a confirmação não confere com a nova senha', () => {
    const { probe } = montar();
    probe.form.setValue({
      senhaAtual: 'atualAtual',
      novaSenha: 'novaSenha8',
      confirmarNovaSenha: 'outraCoisa9',
    });
    probe.salvar();
    expect(auth.trocarSenha).not.toHaveBeenCalled();
    expect(probe.form.get('confirmarNovaSenha')?.hasError('diferente')).toBeTrue();
  });

  it('submete o payload correto e força a navegação do ADMIN a /usuarios (CA-14)', () => {
    auth.trocarSenha.and.returnValue(of(undefined));
    auth.ehAdmin.and.returnValue(true);
    const { probe } = montar();

    probe.form.setValue({
      senhaAtual: 'atualAtual',
      novaSenha: 'novaSenha8',
      confirmarNovaSenha: 'novaSenha8',
    });
    probe.salvar();

    expect(auth.trocarSenha).toHaveBeenCalledWith('atualAtual', 'novaSenha8');
    expect(router.navigate).toHaveBeenCalledWith(['/usuarios']);
    expect(snack.open).toHaveBeenCalled();
    expect(probe.enviando()).toBeFalse();
  });

  it('USER (sem home no M1) fica na confirmação de sucesso, sem navegar', () => {
    auth.trocarSenha.and.returnValue(of(undefined));
    auth.ehAdmin.and.returnValue(false);
    const { probe } = montar();

    probe.form.setValue({
      senhaAtual: 'atualAtual',
      novaSenha: 'novaSenha8',
      confirmarNovaSenha: 'novaSenha8',
    });
    probe.salvar();

    expect(probe.sucesso()).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('400 com details aplica o erro no campo senhaAtual e NÃO navega/desloga (CA-10)', () => {
    auth.trocarSenha.and.returnValue(throwError(() => erro400('senhaAtual', 'senha atual incorreta')));
    const { probe } = montar();

    probe.form.setValue({
      senhaAtual: 'errada',
      novaSenha: 'novaSenha8',
      confirmarNovaSenha: 'novaSenha8',
    });
    probe.salvar();

    const campo = probe.form.get('senhaAtual');
    expect(campo?.hasError('servidor')).toBeTrue();
    expect(campo?.getError('servidor')).toBe('senha atual incorreta');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(probe.enviando()).toBeFalse();
  });

  it('400 sem details cai em "Senha atual incorreta." no campo senhaAtual', () => {
    auth.trocarSenha.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400, statusText: 'Bad Request' })),
    );
    const { probe } = montar();

    probe.form.setValue({
      senhaAtual: 'x',
      novaSenha: 'novaSenha8',
      confirmarNovaSenha: 'novaSenha8',
    });
    probe.salvar();

    expect(probe.form.get('senhaAtual')?.getError('servidor')).toBe('Senha atual incorreta.');
  });
});
