import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { AuthService } from '../core/services/auth.service';

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
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Corte mobile (AD-SQ-33: drawer/hambúrguer em ≤ ~700px). */
  static readonly MOBILE = '(max-width: 700px)';

  protected readonly ehMobile = signal(false);
  /** Drawer aberto: fixo/aberto no desktop, fechado no mobile (over). */
  protected readonly drawerAberto = signal(true);

  /** RBAC de UX (o RBAC efetivo é do back): papel corrente da sessão. */
  protected readonly ehAdmin = this.auth.ehAdmin;
  protected readonly usuario = this.auth.usuarioAtual;

  /**
   * Menu (AD-SQ-33 + SPEC-M4 §12): Produtos/Eventos/Movimentações (todos os autenticados) +
   * Usuários (ADMIN). Eventos e Movimentações são leitura para USER+ADMIN (`soAdmin:false`).
   */
  private readonly itens: readonly ItemMenu[] = [
    { rota: '/produtos', rotulo: 'Produtos', icone: 'local_florist', soAdmin: false },
    { rota: '/eventos', rotulo: 'Eventos', icone: 'event', soAdmin: false },
    { rota: '/movimentacoes', rotulo: 'Movimentações', icone: 'swap_vert', soAdmin: false },
    { rota: '/usuarios', rotulo: 'Usuários', icone: 'group', soAdmin: true },
  ];

  /** Itens visíveis conforme o papel — "Usuários" só p/ ADMIN (CA-17). */
  protected readonly itensVisiveis = computed(() =>
    this.itens.filter((item) => !item.soAdmin || this.ehAdmin()),
  );

  constructor() {
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
