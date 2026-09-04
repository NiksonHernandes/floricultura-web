import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

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
 * Preparado para a Onda 2 (T-M4.1-6): o toggle "Mostrar avisos na tela inicial" morará DENTRO deste
 * diálogo (PA#3), abaixo das regras — por isso o rodapé de ações já existe. O toggle/`localStorage`
 * ainda NÃO é implementado aqui.
 */
@Component({
  selector: 'app-info-avisos',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './info-avisos.html',
  styleUrl: './info-avisos.scss',
})
export class InfoAvisos {
  private readonly ref = inject(MatDialogRef<InfoAvisos>);
  protected readonly regras = REGRAS_AVISO;

  protected fechar(): void {
    this.ref.close();
  }
}
