import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';

import { EventosService } from '../eventos.service';
import { InfoAvisos } from '../info-avisos/info-avisos';
import { AvisosEventosPreferencia } from '../../../core/services/avisos-eventos-preferencia';
import { EventoProximo, TipoEvento } from '../../../core/models/evento.model';
import { ROTULOS_TIPO_EVENTO } from '../eventos';

/** Meses abreviados pt-BR — a próxima ocorrência é `LocalDate` (sem hora). */
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Bloco "Próximos eventos" da Home (SPEC-M4 §7 T-M4-8, CA-18). Consome `GET /eventos/proximos`
 * (já filtrado/ordenado no back — §3.3) via o estado COMPARTILHADO do `EventosService`
 * (`proximos` signal + `carregarProximos()`), a mesma fonte do badge do menu (sem chamada dupla).
 *
 * Embutido no topo da Home (`/produtos`, AD-SQ-33/CA-16 — a Home continua sendo Produtos). Cada item
 * mostra nome, próxima ocorrência (dd/MM) e "faltam N dias"; `diasAte ≤ 30` (`destaqueReforcado`)
 * ganha realce. Sem eventos na janela, o bloco some (não polui a Home). O serviço é injetado de
 * forma OPCIONAL: nos testes que não o registram, o bloco fica vazio sem disparar HTTP (anti-burla).
 *
 * T-M4.1-6 (CA-11/CA-13): o bloco também some quando o usuário desliga o aviso (`oculto()` da
 * preferência por usuário×dispositivo). O **badge do menu NÃO** consulta esta preferência (CA-12).
 */
@Component({
  selector: 'app-proximos-eventos',
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './proximos-eventos.html',
  styleUrl: './proximos-eventos.scss',
})
export class ProximosEventos implements OnInit {
  private readonly service = inject(EventosService, { optional: true });
  private readonly dialog = inject(MatDialog);
  private readonly pref = inject(AvisosEventosPreferencia, { optional: true });

  /** Lista compartilhada do serviço (ou vazia quando o serviço não está disponível nos testes). */
  protected readonly proximos = this.service?.proximos ?? signal<EventoProximo[]>([]);

  /** Preferência "desligar aviso" (T-M4.1-6): `true` esconde o bloco. Default seguro = mostrar. */
  protected readonly oculto = this.pref?.oculto ?? signal(false);

  /** Home compacta (T-M4.2-2/AD-SQ-57): mostra até 3 por padrão; o resto expande na própria Home. */
  private static readonly LIMITE = 3;

  /** Estado local de expansão — efêmero por render (SEM persistência: some ao trocar de tela). */
  protected readonly expandido = signal(false);

  /**
   * Itens exibidos: os 3 primeiros (mais urgentes) por padrão, todos quando expandido. NÃO reordena
   * — reusa a ordem de urgência que o back já entrega (`proximaOcorrencia ASC, nome ASC`, AD-SQ-47).
   */
  protected readonly visiveis = computed(() =>
    this.expandido() ? this.proximos() : this.proximos().slice(0, ProximosEventos.LIMITE),
  );

  /** Quantos ficam ocultos no modo compacto (>0 ⇒ mostra "ver todos"). */
  protected readonly totalOcultos = computed(() =>
    Math.max(0, this.proximos().length - ProximosEventos.LIMITE),
  );

  /** Total de eventos na janela (rótulo "ver todos (N)"). */
  protected readonly total = computed(() => this.proximos().length);

  ngOnInit(): void {
    this.service?.carregarProximos();
  }

  /** Alterna compacto ⇄ expandido — puramente client-side, sem nova chamada nem navegação. */
  protected alternarExpandido(): void {
    this.expandido.update((v) => !v);
  }

  /** Abre o diálogo "Como funcionam os avisos" (fonte única do texto — §3.4, CA-9). */
  protected abrirInfoAvisos(): void {
    this.dialog.open(InfoAvisos, { maxWidth: 'min(30rem, calc(100vw - 2rem))' });
  }

  protected rotuloTipo(t: TipoEvento): string {
    return ROTULOS_TIPO_EVENTO[t] ?? t;
  }

  /** "dd/mês" curto do selo (ex.: 10 mai) a partir de `yyyy-MM-dd`. */
  protected diaMes(iso: string): string {
    const dia = iso.slice(8, 10);
    const mes = Number(iso.slice(5, 7));
    return `${dia} ${MESES_ABREV[mes - 1] ?? ''}`;
  }

  /**
   * Rótulo da contagem regressiva. `diasAte` pode ser negativo (período em andamento — §4.3).
   * Textos do lado do usuário (design-distintivo §texto): "é hoje" / "amanhã" / "faltam N dias".
   */
  protected quando(e: EventoProximo): string {
    if (e.emAndamento || e.diasAte < 0) {
      return 'em andamento';
    }
    if (e.diasAte === 0) {
      return 'é hoje';
    }
    if (e.diasAte === 1) {
      return 'amanhã';
    }
    return `faltam ${e.diasAte} dias`;
  }
}
