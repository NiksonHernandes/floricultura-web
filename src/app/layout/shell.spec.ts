import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { BehaviorSubject } from 'rxjs';

import { Shell } from './shell';
import { AuthService } from '../core/services/auth.service';
import { UsuarioSessao } from '../core/models/auth.model';

/** Acesso aos membros protegidos do shell nos testes. */
interface ShellProbe {
  itensVisiveis(): { rota: string; rotulo: string }[];
  ehMobile(): boolean;
  drawerAberto(): boolean;
  alternarDrawer(): void;
  sair(): void;
}

describe('Shell (T-M2-6)', () => {
  let ehAdmin: WritableSignal<boolean>;
  let usuario: WritableSignal<UsuarioSessao | null>;
  let logoutSpy: jasmine.Spy;
  let bp: BehaviorSubject<BreakpointState>;

  function montar() {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return { fixture, probe: fixture.componentInstance as unknown as ShellProbe };
  }

  beforeEach(() => {
    ehAdmin = signal(false);
    usuario = signal<UsuarioSessao | null>(null);
    logoutSpy = jasmine.createSpy('logout');
    bp = new BehaviorSubject<BreakpointState>({ matches: false, breakpoints: {} });

    const authFake = { ehAdmin, usuarioAtual: usuario, logout: logoutSpy };
    const bpFake = { observe: () => bp.asObservable() };

    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authFake },
        { provide: BreakpointObserver, useValue: bpFake },
      ],
    });
  });

  it('cria o shell', () => {
    const { fixture } = montar();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('USER não vê o item "Usuários" no menu (CA-17)', () => {
    const { probe } = montar();
    const rotas = probe.itensVisiveis().map((i) => i.rota);
    // Menu ampliado no M4 (SPEC-M4 §12): +Eventos +Movimentações (soAdmin:false). "Usuários" só ADMIN.
    expect(rotas).toEqual(['/produtos', '/eventos', '/movimentacoes']);
    expect(rotas).not.toContain('/usuarios');
  });

  it('ADMIN vê "Usuários" no menu (CA-17)', () => {
    ehAdmin.set(true);
    const { probe } = montar();
    const rotas = probe.itensVisiveis().map((i) => i.rota);
    expect(rotas).toEqual(['/produtos', '/eventos', '/movimentacoes', '/usuarios']);
  });

  it('desktop: não é mobile e o drawer nasce aberto/fixo (CA-16)', () => {
    const { probe } = montar();
    expect(probe.ehMobile()).toBeFalse();
    expect(probe.drawerAberto()).toBeTrue();
  });

  it('mobile ≤700px: vira drawer fechado; o hambúrguer alterna (CA-16)', () => {
    const { probe } = montar();
    bp.next({ matches: true, breakpoints: {} });

    expect(probe.ehMobile()).toBeTrue();
    expect(probe.drawerAberto()).toBeFalse();

    probe.alternarDrawer();
    expect(probe.drawerAberto()).toBeTrue();
  });

  it('sair() faz logout e volta ao /login', () => {
    const { probe } = montar();
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    probe.sair();

    expect(logoutSpy).toHaveBeenCalled();
    expect(navSpy).toHaveBeenCalledWith(['/login']);
  });
});
