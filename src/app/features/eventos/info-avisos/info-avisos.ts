import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleModule, MatSlideToggleChange } from '@angular/material/slide-toggle';

import { AvisosEventosPreferencia } from '../../../core/services/avisos-eventos-preferencia';

/**
 * Regra de aviso, em linguagem de negócio (SPEC-M4.1 §3.4). É a **fonte única** do texto do "i",
 * reutilizada na aba Eventos e na Home. SEM jargão interno ("faixaUrgencia"/"diasAte") — só os
 * números de negócio (60 dias, último mês, 7 dias).
 */
export const REGRAS_AVISO: ReadonlyArray<{ icone: string; texto: string }> = [
  { icone: 'event_upcoming', texto: 'Avisamos sobre um evento a partir de 60 dias antes.' },
  {
    icone: 'notifications_active',
    texto: 'No último mês, o aviso é reforçado a cada 7 dias para não passar batido.',
  },
  {
    icone: 'palette',
    texto: 'Na última semana (7 dias ou menos), o card do evento muda de cor para chamar a atenção.',
  },
  { icone: 'autorenew', texto: 'Eventos que repetem todo ano voltam a avisar na próxima virada anual.' },
];

/**
 * Diálogo "Como funcionam os avisos" — o ícone "i" da aba Eventos e da Home (SPEC-M4.1 §7 T-M4.1-5,
 * CA-9/CA-10). Reusa o padrão do `confirmar-exclusao` (`MatDialog` → foco preso, Esc/backdrop/botão
 * fecham). Explica as regras em linguagem de negócio (§3.4). Mobile-first (FC-02).
 *
 * Onda 2 (T-M4.1-6, CA-11): abaixo das regras vive o toggle "Mostrar avisos na tela inicial", ligado
 * ao `AvisosEventosPreferencia` (signal compartilhado + `localStorage`). Ligar/desligar reflete na
 * Home imediatamente e persiste. "Mostrar" (checked) = `oculto=false`; desmarcar oculta o bloco.
 */
@Component({
  selector: 'app-info-avisos',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatSlideToggleModule],
  templateUrl: './info-avisos.html',
  styleUrl: './info-avisos.scss',
})
export class InfoAvisos {
  private readonly ref = inject(MatDialogRef<InfoAvisos>);
  private readonly pref = inject(AvisosEventosPreferencia);
  protected readonly regras = REGRAS_AVISO;

  /** Signal compartilhado da preferência: `true` = bloco oculto. O toggle "Mostrar" é o inverso. */
  protected readonly oculto = this.pref.oculto;

  /** O operador (des)marcou "Mostrar avisos na tela inicial" → persiste e reflete na Home. */
  protected aoAlternarMostrar(evento: MatSlideToggleChange): void {
    this.pref.definir(!evento.checked); // checked = mostrar ⇒ oculto = !checked
  }

  protected fechar(): void {
    this.ref.close();
  }
}
