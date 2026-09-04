import { Injectable, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';

/** Prefixo da chave de preferência (SPEC-M4.1 §3.5). O sufixo é o `usuarioId` (por usuário×dispositivo). */
export const CHAVE_BASE_AVISOS_OCULTO = 'floricultura.avisos-eventos.oculto';

/**
 * Preferência "desligar o aviso de eventos da Home" (SPEC-M4.1 §3.5/§4.5, T-M4.1-6, CA-11/12/13).
 *
 * Por **usuário×dispositivo** (`localStorage`), chave `floricultura.avisos-eventos.oculto.<usuarioId>`
 * (`usuarioId = AuthService.usuarioAtual()?.id`; sem sessão hidratada ⇒ chave sem sufixo, fallback de
 * dispositivo). Valor `"1"` = oculto; **ausente / qualquer outro / erro = mostrar** (default seguro).
 *
 * Estado COMPARTILHADO via `signal oculto`: o diálogo `InfoAvisos` alterna e a Home (`ProximosEventos`)
 * reage no mesmo instante. **Degradação graciosa (CA-13, âncora #6):** TODO acesso a `localStorage` vai
 * em `try/catch` — indisponível/quota/corrompido ⇒ trata como default (mostrar) e **não lança**.
 *
 * O **badge do menu NÃO** consulta esta preferência (CA-12) — só o bloco da Home honra `oculto()`.
 */
@Injectable({ providedIn: 'root' })
export class AvisosEventosPreferencia {
  private readonly auth = inject(AuthService);

  /** `true` = o bloco "Próximos eventos" da Home fica oculto para este usuário×dispositivo. */
  readonly oculto = signal<boolean>(false);

  constructor() {
    // Leitura inicial (o serviço é instanciado no 1º inject — pós-login, com a sessão já hidratada).
    this.oculto.set(this.ler());
  }

  /** Alterna mostrar↔ocultar e persiste. */
  alternar(): void {
    this.definir(!this.oculto());
  }

  /**
   * Define a preferência (`true` = ocultar) no signal compartilhado e persiste na chave do usuário.
   * A escrita é encapsulada em `try/catch`: se o `localStorage` falhar (quota/indisponível), a sessão
   * corrente já reflete a escolha pelo signal — apenas não persistimos (sem lançar).
   */
  definir(oculto: boolean): void {
    this.oculto.set(oculto);
    try {
      if (oculto) {
        localStorage.setItem(this.chave(), '1');
      } else {
        localStorage.removeItem(this.chave());
      }
    } catch {
      // localStorage indisponível/quota — degrada em silêncio (CA-13).
    }
  }

  /** Chave por usuário×dispositivo; sem `usuarioId` (sessão não hidratada) usa o prefixo sem sufixo. */
  private chave(): string {
    const id = this.auth.usuarioAtual()?.id;
    return id != null ? `${CHAVE_BASE_AVISOS_OCULTO}.${id}` : CHAVE_BASE_AVISOS_OCULTO;
  }

  /** Lê a preferência; qualquer erro/valor diferente de `"1"` ⇒ `false` (mostrar — default seguro). */
  private ler(): boolean {
    try {
      return localStorage.getItem(this.chave()) === '1';
    } catch {
      return false;
    }
  }
}
