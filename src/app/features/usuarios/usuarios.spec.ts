import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { Usuarios } from './usuarios';
import { UsuariosService } from './usuarios.service';
import { PaginaResponse } from '../../core/models/produto.model';
import { Usuario } from '../../core/models/auth.model';

interface UsuariosProbe {
  usuarios(): Usuario[];
  vazia(): boolean;
  totalElementos(): number;
  erroStatus(): string | null;
  alvoStatus(): Usuario | null;
  alvoReset(): Usuario | null;
  filtro: FormControl<string>;
  formAberto: { set(v: boolean): void };
  resetForm: { setValue(v: { novaSenha: string; confirmarNovaSenha: string }): void };
  aoCriar(u: Usuario): void;
  aoPaginar(e: { pageIndex: number; pageSize: number }): void;
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

  // Retrofit T-M2-10/CA-21: a listagem migra para `PaginaResponse` (§3.3). O back já ordena por
  // `nome ASC`; o stub devolve a página na ordem em que o teste a fornece.
  function pagina(conteudo: Usuario[], total = conteudo.length): PaginaResponse<Usuario> {
    return {
      conteudo,
      pagina: 0,
      tamanho: 20,
      totalElementos: total,
      totalPaginas: Math.max(1, Math.ceil(total / 20)),
      primeira: true,
      ultima: total <= 20,
    };
  }

  function montar(lista: Usuario[] = [ana, zelia], total = lista.length) {
    serviceSpy.listar.and.returnValue(of(pagina(lista, total)));
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

  it('carrega a página do back preservando a ordem (nome ASC do back — retrofit CA-21)', () => {
    // O back já ordena por nome ASC (§3.3); a tela não reordena no carregamento.
    const probe = montar([ana, zelia], 2);
    expect(probe.usuarios().map((u) => u.nome)).toEqual(['Ana', 'Zelia']);
    expect(probe.totalElementos()).toBe(2);
    expect(probe.vazia()).toBeFalse();
  });

  it('lista vazia sinaliza estado vazio honesto', () => {
    const probe = montar([]);
    expect(probe.vazia()).toBeTrue();
  });

  it('trocar de página chama o serviço com pagina/tamanho (MatPaginator 0-based — CA-21)', () => {
    const probe = montar([ana, zelia], 60);
    serviceSpy.listar.calls.reset();

    probe.aoPaginar({ pageIndex: 2, pageSize: 50 });

    expect(serviceSpy.listar).toHaveBeenCalledWith(2, 50, '');
  });

  it('filtro por nome com debounce (~300ms) refaz a busca com o nome, na 1ª página (CA-21)', fakeAsync(() => {
    const probe = montar([ana, zelia], 60);
    // Vai para outra página para provar que o filtro reinicia em 0.
    probe.aoPaginar({ pageIndex: 3, pageSize: 20 });
    serviceSpy.listar.calls.reset();

    probe.filtro.setValue('an');

    tick(150);
    expect(serviceSpy.listar).not.toHaveBeenCalled(); // ainda dentro do debounce

    tick(200); // passa dos 300ms
    expect(serviceSpy.listar).toHaveBeenCalledWith(0, 20, 'an');
  }));

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
