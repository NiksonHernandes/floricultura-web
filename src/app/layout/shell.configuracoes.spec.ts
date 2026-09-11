import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { Route, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { BehaviorSubject } from 'rxjs';

import { Shell } from './shell';
import { routes } from '../app.routes';
import { adminGuard } from '../core/guards/admin.guard';
import { AuthService } from '../core/services/auth.service';

/**
 * Configurações no menu (T-M6-06a — SPEC-M6 §3.15, PA#1/AD-SQ-86, CA-30).
 *
 * Spec NOVO: `shell.ts` e `shell.spec.ts` seguem **intocados** (§10 #25). É exatamente por isso que
 * o link vive no RODAPÉ do `shell.html`, fora do array `itens` — o spec herdado assere aquele array
 * com `toEqual` e um item novo o quebraria (anti-burla, precedente AD-SQ-78).
 *
 * Aqui travam-se as duas metades do CA-30 que são do front: o link só existe para ADMIN, e a rota
 * `/configuracoes` está de fato amarrada ao `adminGuard` (o comportamento do guard — snackbar 403 +
 * redirect — já é provado por `admin.guard.spec.ts`, que continua verde sem alteração).
 */
describe('Shell — Configurações no rodapé do menu (T-M6-06a, CA-30)', () => {
  let ehAdmin: WritableSignal<boolean>;

  function montar() {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    ehAdmin = signal(true);
    const bp = new BehaviorSubject<BreakpointState>({ matches: false, breakpoints: {} });

    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { ehAdmin, usuarioAtual: signal(null), logout: () => {} },
        },
        { provide: BreakpointObserver, useValue: { observe: () => bp.asObservable() } },
      ],
    });
  });

  it('ADMIN vê o link, no rodapé e apontando para /configuracoes/cores', () => {
    const el = montar();
    const link = el.querySelector('.rodape .rodape__config') as HTMLAnchorElement;

    expect(link).toBeTruthy();
    // O rótulo mora no <span>; o texto do <a> carrega junto a ligadura do mat-icon ("settings").
    expect(link.querySelector('span')?.textContent?.trim()).toBe('Configurações');
    expect(link.querySelector('mat-icon')?.textContent?.trim()).toBe('settings');
    expect(link.getAttribute('href')).toBe('/configuracoes/cores');
  });

  it('USER não vê o link (RBAC de UX — FC-07)', () => {
    ehAdmin.set(false);
    const el = montar();

    expect(el.querySelector('.rodape__config')).toBeNull();
    // ...e o rodapé continua inteiro: "Sair" não depende do papel.
    expect(el.querySelector('.rodape__sair')).toBeTruthy();
  });

  it('o menu de domínio segue com os MESMOS 6 itens — Configurações não entrou no array', () => {
    const el = montar();
    const rotas = Array.from(el.querySelectorAll('.menu .menu__item')).map((a) =>
      a.getAttribute('href'),
    );

    expect(rotas).toEqual([
      '/produtos',
      '/eventos',
      '/movimentacoes',
      '/clientes',
      '/fornecedores',
      '/usuarios',
    ]);
  });

  it('a rota /configuracoes é ADMIN e abre em Cores', () => {
    const filhas = routes.find((r) => r.path === '')?.children ?? [];
    const config = filhas.find((r) => r.path === 'configuracoes') as Route;

    expect(config.canActivate).toContain(adminGuard);
    expect(config.children?.[0]).toEqual(
      jasmine.objectContaining({ path: '', redirectTo: 'cores' }),
    );
    expect(config.children?.[1].path).toBe('cores');
  });
});
