import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';

import { AuthService } from '../core/services/auth.service';
import { EventosService } from '../features/eventos/eventos.service';

/** Item de navegação do menu lateral (RBAC via `soAdmin`). */
interface ItemMenu {
  readonly rota: string;
  readonly rotulo: string;
  readonly icone: string;
  readonly soAdmin: boolean;
}

/**
 * Shell pós-login (SPEC-M2 §4, AD-SQ-33, CA-16/CA-17/CA-18).
 *
 * Hospeda as rotas autenticadas como filhas (ver `app.routes.ts`) dentro de um
 * `MatSidenav` responsivo: **fixo no desktop** (`mode="side"`, sempre aberto) e
 * **drawer/hambúrguer no mobile** (`mode="over"`, fechado por padrão) a partir de
 * `BreakpointObserver` (~700px). O menu aplica RBAC — "Usuários" só aparece para
 * ADMIN (CA-17); a rota mantém `adminGuard`. `/login` fica FORA deste shell
 * (resolve a DT-M1-1 — sem `position:fixed`/`<h1>` de layout por baixo, CA-18).
 *
 * Design distintivo (§9): reusa os tokens do ateliê (`_atelie-tokens.scss`) — a
 * estante lateral em folhagem, o item ativo com caule + nó de dália. Ver shell.scss.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatBadgeModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /**
   * Serviço de eventos (SPEC-M4 §3.3/T-M4-8) para o badge de "próximos eventos" no menu. Injeção
   * OPCIONAL de propósito (provido no `appConfig`, não `providedIn:'root'`): fica `null` no
   * shell.spec, que não o registra — o badge nasce 0 e não altera as asserções de menu (anti-burla).
   */
  private readonly eventosService = inject(EventosService, { optional: true });

  /** Corte mobile (AD-SQ-33: drawer/hambúrguer em ≤ ~700px). */
  static readonly MOBILE = '(max-width: 700px)';

  protected readonly ehMobile = signal(false);
  /** Drawer aberto: fixo/aberto no desktop, fechado no mobile (over). */
  protected readonly drawerAberto = signal(true);

  /** RBAC de UX (o RBAC efetivo é do back): papel corrente da sessão. */
  protected readonly ehAdmin = this.auth.ehAdmin;
  protected readonly usuario = this.auth.usuarioAtual;

  /**
   * Menu (AD-SQ-33 + SPEC-M4 §12 + SPEC-M5 §3.6): Produtos/Eventos/Movimentações/Clientes/
   * Fornecedores (todos os autenticados) + Usuários (ADMIN). Clientes e Fornecedores são leitura
   * para USER+ADMIN (`soAdmin:false`, CA-10); a escrita é barrada por RBAC no back (FC-07).
   */
  private readonly itens: readonly ItemMenu[] = [
    { rota: '/produtos', rotulo: 'Produtos', icone: 'local_florist', soAdmin: false },
    { rota: '/eventos', rotulo: 'Eventos', icone: 'event', soAdmin: false },
    { rota: '/movimentacoes', rotulo: 'Movimentações', icone: 'swap_vert', soAdmin: false },
    { rota: '/clientes', rotulo: 'Clientes', icone: 'people', soAdmin: false },
    { rota: '/fornecedores', rotulo: 'Fornecedores', icone: 'local_shipping', soAdmin: false },
    { rota: '/usuarios', rotulo: 'Usuários', icone: 'group', soAdmin: true },
  ];

  /** Itens visíveis conforme o papel — "Usuários" só p/ ADMIN (CA-17). */
  protected readonly itensVisiveis = computed(() =>
    this.itens.filter((item) => !item.soAdmin || this.ehAdmin()),
  );

  /**
   * Badge do menu "Eventos" (T-M4-8/CA-18): quantidade de eventos na janela ≤60 dias
   * (`GET /eventos/proximos`, mesma fonte do bloco da Home). `0` quando não há alerta ou o serviço
   * não está disponível (testes) → o template não pinta o badge.
   */
  protected readonly badgeEventos = computed(() => this.eventosService?.proximos().length ?? 0);

  constructor() {
    this.eventosService?.carregarProximos();
    // Sincroniza modo/estado do drawer com a largura da viewport (mobile-first, FC-02).
    this.breakpoints
      .observe(Shell.MOBILE)
      .pipe(takeUntilDestroyed())
      .subscribe((estado) => {
        this.ehMobile.set(estado.matches);
        this.drawerAberto.set(!estado.matches); // desktop aberto; mobile fechado
      });
  }

  protected alternarDrawer(): void {
    this.drawerAberto.update((aberto) => !aberto);
  }

  /** No mobile, navegar fecha o drawer (over); no desktop ele permanece fixo. */
  protected aoNavegar(): void {
    if (this.ehMobile()) {
      this.drawerAberto.set(false);
    }
  }

  /** Logout client-side (JWT stateless, AD-SQ-15) e volta ao login. */
  protected sair(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
