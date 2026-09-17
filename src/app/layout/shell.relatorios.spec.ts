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
 * T-M7-09 — Relatórios no menu e na rota (SPEC-M7 §3.13, CA-45).
 *
 * Spec NOVO: `shell.ts` e os 3 specs herdados de shell seguem **intocados** (§10 #23/#24). É por
 * isso que o item vive num grupo próprio do `shell.html` ("FECHAMENTO"), fora do array `itens`:
 * **medido** antes de codificar — um item novo naquele array deixa `shell.spec.ts` ("ADMIN vê
 * Usuários") e `shell.configuracoes.spec.ts` ("o menu inclui a visão geral") VERMELHOS, os dois com
 * `Expected $.length = 8 to equal 7`. O dono escolheu o grupo próprio (2026-09-17, opção B do
 * plano): Relatórios é operação do dia a dia, não ajuste de sistema — por isso não foi para o
 * rodapé, onde mora Configurações.
 *
 * Aqui travam-se as três metades do CA-45 que são do front: o item só existe para ADMIN, o menu
 * principal **não** cresceu, e a rota `/relatorios` está de fato amarrada ao `adminGuard` (o
 * comportamento do guard — snackbar 403 + redirect — já é provado por `admin.guard.spec.ts`).
 */
describe('Shell — Relatórios no grupo "Fechamento" (T-M7-09, CA-45)', () => {
  let ehAdmin: WritableSignal<boolean>;

  function montar(): HTMLElement {
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

  it('ADMIN vê "Relatórios", num grupo próprio apontando para /relatorios', () => {
    const el = montar();
    const link = el.querySelector('.gestao .gestao__item') as HTMLAnchorElement;

    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/relatorios');
    // O rótulo mora no <span>; o texto do <a> carrega junto a ligadura do mat-icon ("summarize").
    expect(link.querySelector('span')?.textContent?.trim()).toBe('Relatórios');
    expect(link.querySelector('mat-icon')?.textContent?.trim()).toBe('summarize');
  });

  it('USER não vê o item (RBAC de UX — FC-07; quem barra de verdade é o back)', () => {
    ehAdmin.set(false);
    const el = montar();

    expect(el.querySelector('.gestao__item')).toBeNull();
    // ...e o resto da estante continua inteiro para o USER.
    expect(el.querySelectorAll('.menu .menu__item').length).toBe(6);
    expect(el.querySelector('.rodape__sair')).toBeTruthy();
  });

  it('o menu principal NÃO ganhou item — o grupo é separado', () => {
    const el = montar();
    const rotas = Array.from(el.querySelectorAll('.menu .menu__item')).map((a) =>
      a.getAttribute('href'),
    );

    // Exatamente as 7 rotas de domínio de antes desta task: é o que mantém os 3 specs herdados de
    // shell verdes e sem nenhuma liberação (§12 #0).
    expect(rotas).toEqual([
      '/painel',
      '/produtos',
      '/eventos',
      '/movimentacoes',
      '/clientes',
      '/fornecedores',
      '/usuarios',
    ]);
    expect(rotas).not.toContain('/relatorios');
  });

  it('a rota /relatorios é de TOPO e exige ADMIN (D8 — não fica sob /configuracoes)', () => {
    const filhas = routes.find((r) => r.path === '')?.children ?? [];
    const relatorios = filhas.find((r) => r.path === 'relatorios') as Route;

    expect(relatorios).toBeTruthy();
    expect(relatorios.canActivate).toContain(adminGuard);
    // ...e continua fora de `configuracoes`, que é área de SISTEMA.
    const config = filhas.find((r) => r.path === 'configuracoes') as Route;
    expect(config.children?.some((f) => f.path === 'relatorios')).toBeFalsy();
  });
});
